/**
 * OSV Service - Queries OSV API for vulnerability information
 */
class OSVService {
    constructor() {
        this.baseUrl = 'https://api.osv.dev';
        this.cache = new Map(); // Simple in-memory cache
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Query vulnerabilities for a package
     */
    async queryVulnerabilities(packageName, version, ecosystem = null) {
        // Validate inputs
        if (!packageName || !version || !packageName.trim() || !version.trim()) {
            console.warn(`⚠️ OSV: Invalid package data - name: "${packageName}", version: "${version}"`);
            return { vulns: [] };
        }

        const cleanName = packageName.trim();
        const cleanVersion = version.trim();
        const cacheKey = `${cleanName}@${cleanVersion}`;
        
        // Check centralized storage first
        if (window.storageManager && window.storageManager.hasVulnerabilityData(cacheKey)) {
            const storedData = window.storageManager.getVulnerabilityDataForPackage(cacheKey);
            if (storedData && storedData.data) {
                console.log(`📦 OSV: Using centralized storage for ${cacheKey}`);
                return storedData.data;
            }
        }
        
        // Check in-memory cache second
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                console.log(`📦 OSV: Using in-memory cache for ${cacheKey}`);
                return cached.data;
            }
        }

        try {
            console.log(`🔍 OSV: Querying vulnerabilities for ${cleanName}@${cleanVersion}`);
            
            // Only include ecosystem for very confident matches
            const detectedEcosystem = this.detectEcosystemFromName(cleanName);
            const mappedEcosystem = ecosystem ? this.mapEcosystemToOSV(ecosystem) : detectedEcosystem;
            const query = {
                package: {
                    name: cleanName,
                    ...(mappedEcosystem && { ecosystem: mappedEcosystem })
                },
                version: cleanVersion
            };

            console.log(`🔍 OSV: Query payload:`, query);

            const response = await fetch(`${this.baseUrl}/v1/query`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(query)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`❌ OSV: API Response for ${cacheKey}:`, errorText);
                throw new Error(`OSV API error: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const data = await response.json();
            
            // Cache the result in memory
            this.cache.set(cacheKey, {
                data: data,
                timestamp: Date.now()
            });

            // Save to centralized storage
            if (window.storageManager) {
                window.storageManager.saveVulnerabilityData(cacheKey, {
                    data: data,
                    packageName: cleanName,
                    version: cleanVersion,
                    ecosystem: ecosystem
                });
            }

            console.log(`✅ OSV: Found ${data.vulns?.length || 0} vulnerabilities for ${cacheKey}`);
            return data;
        } catch (error) {
            console.error(`❌ OSV: Error querying ${cacheKey}:`, error);
            return { vulns: [] };
        }
    }

    /**
     * Batch query vulnerabilities for multiple packages
     */
    async queryVulnerabilitiesBatch(packages) {
        if (packages.length === 0) return [];
        const MAX_BATCH = 100; // OSV API limit
        try {
            console.log(`🔍 OSV: Batch querying ${packages.length} packages`);
            // Filter out invalid packages and create proper queries
            const validQueries = packages
                .filter(pkg => pkg.name && pkg.version && pkg.name.trim() && pkg.version.trim())
                .map(pkg => {
                    const mappedEcosystem = pkg.ecosystem ? this.mapEcosystemToOSV(pkg.ecosystem) : null;
                    return {
                        package: {
                            name: pkg.name.trim(),
                            ...(mappedEcosystem && { ecosystem: mappedEcosystem })
                        },
                        version: pkg.version.trim()
                    };
                });

            if (validQueries.length === 0) {
                console.warn('⚠️ OSV: No valid packages to query');
                return packages.map(() => ({ vulns: [] }));
            }

            // Split into chunks of 100
            const chunks = [];
            for (let i = 0; i < validQueries.length; i += MAX_BATCH) {
                chunks.push(validQueries.slice(i, i + MAX_BATCH));
            }

            let allResults = [];
            for (let idx = 0; idx < chunks.length; idx++) {
                const chunk = chunks[idx];
                console.log(`🔍 OSV: Sending chunk ${idx + 1}/${chunks.length} with ${chunk.length} queries`);
                const response = await fetch(`${this.baseUrl}/v1/querybatch`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ queries: chunk })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`❌ OSV: API Response (chunk ${idx + 1}):`, errorText);
                    throw new Error(`OSV API error: ${response.status} ${response.statusText} - ${errorText}`);
                }

                const data = await response.json();
                if (data.results && Array.isArray(data.results)) {
                    allResults = allResults.concat(data.results);
                }
            }

            console.log(`✅ OSV: Batch query completed, found vulnerabilities for ${allResults.length} packages`);
            // Debug: Log sample vulnerability structure from batch query
            if (allResults && allResults.length > 0) {
                const sampleResult = allResults.find(r => r.vulns && r.vulns.length > 0);
                if (sampleResult) {
                    console.log('🔍 OSV: Sample batch query vulnerability structure:', {
                        id: sampleResult.vulns[0].id,
                        hasSummary: !!sampleResult.vulns[0].summary,
                        hasSeverity: !!sampleResult.vulns[0].severity,
                        hasDatabaseSpecific: !!sampleResult.vulns[0].database_specific,
                        fields: Object.keys(sampleResult.vulns[0])
                    });
                }
            }
            return allResults;
        } catch (error) {
            console.error(`❌ OSV: Batch query error:`, error);
            return packages.map(() => ({ vulns: [] }));
        }
    }

    /**
     * Map ecosystem names to OSV-compatible names
     */
    mapEcosystemToOSV(ecosystem) {
        if (!ecosystem) return null;
        
        const ecosystemMap = {
            'golang': 'Go',
            'go': 'Go',
            'pypi': 'PyPI',
            'npm': 'npm',
            'maven': 'Maven',
            'nuget': 'NuGet',
            'cargo': 'cargo',
            'composer': 'Packagist',
            'githubactions': 'GitHub Actions',
            'github': 'GitHub',
            'docker': 'Docker',
            'helm': 'Helm',
            'terraform': 'Terraform',
            'rubygems': 'RubyGems'
        };
        
        return ecosystemMap[ecosystem.toLowerCase()] || ecosystem;
    }

    /**
     * Extract ecosystem from PURL or package data
     * Using only valid OSV ecosystem values
     */
    extractEcosystemFromPurl(pkg) {
        if (!pkg) return null;
        
        // Try to extract from PURL first (most reliable)
        if (pkg.externalRefs) {
            const purlRef = pkg.externalRefs.find(ref => ref.referenceType === 'purl');
            if (purlRef && purlRef.referenceLocator) {
                const purl = purlRef.referenceLocator;
                const purlParts = purl.split('/');
                
                if (purlParts.length >= 2) {
                    const ecosystem = purlParts[0].replace('pkg:', '');
                    
                    // Map PURL ecosystem to OSV ecosystem
                    // Based on OSV API documentation: https://ossf.github.io/osv-schema/#affectedpackage-field
                    const ecosystemMap = {
                        'pypi': 'PyPI',
                        'npm': 'npm', 
                        'maven': 'Maven',
                        'nuget': 'NuGet',
                        'cargo': 'cargo',
                        'composer': 'Packagist',
                        'go': 'Go',
                        'golang': 'Go',  // Handle golang ecosystem from SBOM
                        'githubactions': 'GitHub Actions',
                        'github': 'GitHub',
                        'docker': 'Docker',
                        'helm': 'Helm',
                        'terraform': 'Terraform',
                        'rubygems': 'RubyGems'
                    };
                    
                    const mappedEcosystem = ecosystemMap[ecosystem];
                    if (mappedEcosystem) {
                        console.log(`🔍 OSV: Extracted ecosystem '${mappedEcosystem}' from PURL for ${pkg.name}`);
                        return mappedEcosystem;
                    } else {
                        console.log(`⚠️ OSV: Unknown ecosystem '${ecosystem}' from PURL for ${pkg.name}`);
                    }
                }
            }
        }
        
        // Try to extract ecosystem from SPDXID as fallback
        if (pkg.SPDXID) {
            const spdxMatch = pkg.SPDXID.match(/SPDXRef-([^-]+)-/);
            if (spdxMatch) {
                const ecosystem = spdxMatch[1];
                const ecosystemMap = {
                    'pypi': 'PyPI',
                    'npm': 'npm', 
                    'maven': 'Maven',
                    'nuget': 'NuGet',
                    'cargo': 'cargo',
                    'composer': 'Packagist',
                    'go': 'Go',
                    'githubactions': 'GitHub Actions',
                    'github': 'GitHub',
                    'docker': 'Docker',
                    'helm': 'Helm',
                    'terraform': 'Terraform',
                    'rubygems': 'RubyGems'
                };
                
                const mappedEcosystem = ecosystemMap[ecosystem];
                if (mappedEcosystem) {
                    console.log(`🔍 OSV: Extracted ecosystem '${mappedEcosystem}' from SPDXID for ${pkg.name}`);
                    return mappedEcosystem;
                }
            }
        }
        
        // Only fallback to name-based detection if no PURL or SPDXID is available
        console.log(`⚠️ OSV: No PURL or SPDXID found for ${pkg.name}, falling back to name-based detection`);
        return this.detectEcosystemFromName(pkg.name);
    }
    
    /**
     * Detect ecosystem based on package name (fallback method)
     * Using only valid OSV ecosystem values - conservative but practical approach
     */
    detectEcosystemFromName(packageName) {
        if (!packageName) return null;
        
        const name = packageName.toLowerCase();
        
        // NPM packages with @ prefix
        if (name.startsWith('@')) {
            return 'npm';
        }
        
        // Maven packages with group:artifact format
        if (name.includes(':')) {
            return 'Maven';
        }
        
        // Go modules with clear domain patterns
        if (name.startsWith('github.com/') || name.startsWith('golang.org/')) {
            return 'Go';
        }
        
        // GitHub Actions packages
        if (name.startsWith('actions/') || name.startsWith('github/')) {
            return 'GitHub Actions';
        }
        
        // Common NPM packages (without @ prefix)
        const npmPackages = [
            'lodash', 'react', 'axios', 'moment', 'jquery', 'express', 'vue', 'angular',
            'bootstrap', 'webpack', 'babel', 'eslint', 'prettier', 'jest', 'mocha',
            'chai', 'sinon', 'cypress', 'typescript', 'node', 'npm', 'yarn', 'socket.io',
            'underscore', 'grunt', 'node-sass'
        ];
        if (npmPackages.includes(name)) {
            return 'npm';
        }
        
        // Common Python packages
        const pypiPackages = [
            'requests', 'flask', 'django', 'numpy', 'pandas', 'matplotlib', 'scipy',
            'pillow', 'sqlalchemy', 'jinja2', 'werkzeug', 'click', 'pyyaml',
            'beautifulsoup4', 'lxml', 'pytest', 'pytest-cov', 'black', 'flake8',
            'gitpython', 'gitdb', 'smmap', 'pynacl', 'itsdangerous'
        ];
        if (pypiPackages.includes(name)) {
            return 'PyPI';
        }
        
        // Common Ruby gems
        const rubyGems = [
            'rails', 'sinatra', 'rack', 'bundler', 'rake', 'rspec', 'capybara',
            'jekyll', 'octokit', 'nokogiri', 'faraday', 'addressable', 'ffi',
            'activesupport', 'typhoeus', 'yell', 'coffee-script', 'fast-stemmer'
        ];
        if (rubyGems.includes(name)) {
            return 'RubyGems';
        }
        
        // For everything else, return null to avoid false positives
        return null;
    }

    /**
     * Analyze dependencies for vulnerabilities
     */
    async analyzeDependencies(dependencies) {
        console.log(`🔍 OSV: Analyzing ${dependencies.length} dependencies for vulnerabilities`);
        
        const packages = dependencies.map(dep => {
            const detectedEcosystem = dep.pkg ? this.extractEcosystemFromPurl(dep.pkg) : this.detectEcosystemFromName(dep.name);
            const mappedEcosystem = detectedEcosystem ? this.mapEcosystemToOSV(detectedEcosystem) : null;
            return {
                name: dep.name,
                version: dep.version,
                ecosystem: mappedEcosystem
            };
        });

        // Try batch query first for quick vulnerability detection
        let results = await this.queryVulnerabilitiesBatch(packages);
        
        // Check if batch query returned minimal data (just id and modified)
        const hasMinimalData = results.some(result => 
            result.vulns && result.vulns.length > 0 && 
            result.vulns[0] && Object.keys(result.vulns[0]).length <= 3
        );
        
        // If batch query failed, returned no results, or returned minimal data, fall back to individual queries
        if (!results || results.length === 0 || hasMinimalData) {
            console.log('⚠️ OSV: Batch query returned minimal data, falling back to individual queries for full details');
            results = await this.queryVulnerabilitiesIndividually(packages);
        }
        
        const vulnerabilityAnalysis = {
            totalPackages: dependencies.length,
            vulnerablePackages: 0,
            totalVulnerabilities: 0,
            criticalVulnerabilities: 0,
            highVulnerabilities: 0,
            mediumVulnerabilities: 0,
            lowVulnerabilities: 0,
            vulnerableDependencies: []
        };

        dependencies.forEach((dep, index) => {
            const vulnResult = results[index];
            const vulnerabilities = vulnResult?.vulns || [];
            
            // Save to centralized storage if vulnerabilities found
            if (vulnerabilities.length > 0 && window.storageManager) {
                const cacheKey = `${dep.name}@${dep.version}`;
                window.storageManager.saveVulnerabilityData(cacheKey, {
                    data: vulnResult,
                    packageName: dep.name,
                    version: dep.version,
                    ecosystem: dep.ecosystem
                });
            }
            
            if (vulnerabilities.length > 0) {
                vulnerabilityAnalysis.vulnerablePackages++;
                vulnerabilityAnalysis.totalVulnerabilities += vulnerabilities.length;
                
                // Debug: Log first vulnerability structure
                if (vulnerabilities.length > 0) {
                    console.log(`🔍 OSV: Sample vulnerability for ${dep.name}:`, {
                        id: vulnerabilities[0].id,
                        severity: vulnerabilities[0].severity,
                        severityType: typeof vulnerabilities[0].severity,
                        database_specific: vulnerabilities[0].database_specific,
                        database_specific_severity: vulnerabilities[0].database_specific?.severity
                    });
                }
                
                // Analyze severity levels
                vulnerabilities.forEach(vuln => {
                    const severity = this.getHighestSeverity(vuln);
                    switch (severity) {
                        case 'CRITICAL':
                            vulnerabilityAnalysis.criticalVulnerabilities++;
                            break;
                        case 'HIGH':
                            vulnerabilityAnalysis.highVulnerabilities++;
                            break;
                        case 'MEDIUM':
                        case 'MODERATE': // OSV API sometimes uses MODERATE instead of MEDIUM
                            vulnerabilityAnalysis.mediumVulnerabilities++;
                            break;
                        case 'LOW':
                            vulnerabilityAnalysis.lowVulnerabilities++;
                            break;
                    }
                });

                // Add to vulnerable dependencies list
                vulnerabilityAnalysis.vulnerableDependencies.push({
                    name: dep.name,
                    version: dep.version,
                    vulnerabilities: vulnerabilities.map(vuln => {
                        const severity = this.getHighestSeverity(vuln);
                        console.log(`🔍 OSV: Mapped vulnerability ${vuln.id} severity: ${severity}`);
                        return {
                            id: vuln.id,
                            summary: vuln.summary,
                            details: vuln.details,
                            severity: severity,
                            published: vuln.published,
                            modified: vuln.modified,
                            references: vuln.references || []
                        };
                    })
                });
            }
        });

        console.log(`✅ OSV: Analysis complete - ${vulnerabilityAnalysis.vulnerablePackages} vulnerable packages found`);
        return vulnerabilityAnalysis;
    }

    /**
     * Analyze dependencies for vulnerabilities with incremental saving
     */
    async analyzeDependenciesWithIncrementalSaving(dependencies, orgName, onProgress = null) {
        console.log(`🔍 OSV: Analyzing ${dependencies.length} dependencies for vulnerabilities with incremental saving`);
        
        const packages = dependencies.map(dep => {
            const detectedEcosystem = dep.pkg ? this.extractEcosystemFromPurl(dep.pkg) : this.detectEcosystemFromName(dep.name);
            const mappedEcosystem = detectedEcosystem ? this.mapEcosystemToOSV(detectedEcosystem) : null;
            return {
                name: dep.name,
                version: dep.version,
                ecosystem: mappedEcosystem
            };
        });

        // Try batch query first for quick vulnerability detection
        let results = await this.queryVulnerabilitiesBatch(packages);
        
        // Check if batch query returned minimal data (just id and modified)
        const hasMinimalData = results.some(result => 
            result.vulns && result.vulns.length > 0 && 
            result.vulns[0] && Object.keys(result.vulns[0]).length <= 3
        );
        
        // If batch query failed, returned no results, or returned minimal data, fall back to individual queries
        if (!results || results.length === 0 || hasMinimalData) {
            console.log('⚠️ OSV: Batch query returned minimal data, falling back to individual queries for full details');
            results = await this.queryVulnerabilitiesIndividually(packages);
        }
        
        const vulnerabilityAnalysis = {
            totalPackages: dependencies.length,
            vulnerablePackages: 0,
            totalVulnerabilities: 0,
            criticalVulnerabilities: 0,
            highVulnerabilities: 0,
            mediumVulnerabilities: 0,
            lowVulnerabilities: 0,
            vulnerableDependencies: []
        };

        dependencies.forEach((dep, index) => {
            const vulnResult = results[index];
            const vulnerabilities = vulnResult?.vulns || [];
            
            // Save to centralized storage if vulnerabilities found
            if (vulnerabilities.length > 0 && window.storageManager) {
                const cacheKey = `${dep.name}@${dep.version}`;
                window.storageManager.saveVulnerabilityData(cacheKey, {
                    data: vulnResult,
                    packageName: dep.name,
                    version: dep.version,
                    ecosystem: dep.ecosystem
                });
            }
            
            if (vulnerabilities.length > 0) {
                vulnerabilityAnalysis.vulnerablePackages++;
                vulnerabilityAnalysis.totalVulnerabilities += vulnerabilities.length;
                
                // Debug: Log first vulnerability structure
                if (vulnerabilities.length > 0) {
                    console.log(`🔍 OSV: Sample vulnerability for ${dep.name}:`, {
                        id: vulnerabilities[0].id,
                        severity: vulnerabilities[0].severity,
                        severityType: typeof vulnerabilities[0].severity,
                        database_specific: vulnerabilities[0].database_specific,
                        database_specific_severity: vulnerabilities[0].database_specific?.severity
                    });
                }
                
                // Analyze severity levels
                vulnerabilities.forEach(vuln => {
                    const severity = this.getHighestSeverity(vuln);
                    switch (severity) {
                        case 'CRITICAL':
                            vulnerabilityAnalysis.criticalVulnerabilities++;
                            break;
                        case 'HIGH':
                            vulnerabilityAnalysis.highVulnerabilities++;
                            break;
                        case 'MEDIUM':
                        case 'MODERATE': // OSV API sometimes uses MODERATE instead of MEDIUM
                            vulnerabilityAnalysis.mediumVulnerabilities++;
                            break;
                        case 'LOW':
                            vulnerabilityAnalysis.lowVulnerabilities++;
                            break;
                    }
                });

                // Add to vulnerable dependencies list
                vulnerabilityAnalysis.vulnerableDependencies.push({
                    name: dep.name,
                    version: dep.version,
                    vulnerabilities: vulnerabilities.map(vuln => {
                        const severity = this.getHighestSeverity(vuln);
                        console.log(`🔍 OSV: Mapped vulnerability ${vuln.id} severity: ${severity}`);
                        return {
                            id: vuln.id,
                            summary: vuln.summary,
                            details: vuln.details,
                            severity: severity,
                            published: vuln.published,
                            modified: vuln.modified,
                            references: vuln.references || []
                        };
                    })
                });
            }

            // Save incrementally every 10 dependencies
            if ((index + 1) % 10 === 0 || index === dependencies.length - 1) {
                console.log(`💾 OSV: Saving incremental vulnerability data (${index + 1}/${dependencies.length} dependencies processed)`);
                
                if (window.storageManager && orgName) {
                    const saveSuccess = window.storageManager.updateAnalysisWithVulnerabilities(orgName, vulnerabilityAnalysis);
                    if (saveSuccess) {
                        console.log(`✅ OSV: Incremental vulnerability data saved for ${orgName}`);
                    } else {
                        console.warn(`⚠️ OSV: Failed to save incremental vulnerability data for ${orgName}`);
                    }
                }

                // Call progress callback if provided
                if (onProgress) {
                    const progressPercent = ((index + 1) / dependencies.length) * 100;
                    onProgress(progressPercent, `Processed ${index + 1}/${dependencies.length} dependencies for vulnerabilities`);
                }
            }
        });

        console.log(`✅ OSV: Analysis complete - ${vulnerabilityAnalysis.vulnerablePackages} vulnerable packages found`);
        return vulnerabilityAnalysis;
    }

    /**
     * Query vulnerabilities individually as fallback
     */
    async queryVulnerabilitiesIndividually(packages) {
        console.log(`🔍 OSV: Querying ${packages.length} packages individually`);
        
        const results = [];
        for (let i = 0; i < packages.length; i++) {
            const pkg = packages[i];
            try {
                const result = await this.queryVulnerabilities(pkg.name, pkg.version, pkg.ecosystem);
                results.push(result);
                
                // Add small delay to be respectful to the API
                if (i < packages.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            } catch (error) {
                console.error(`❌ OSV: Error querying ${pkg.name}@${pkg.version}:`, error);
                results.push({ vulns: [] });
            }
        }
        
        return results;
    }

    /**
     * Get the highest severity level from a vulnerability
     */
    getHighestSeverity(vulnerability) {
        // Sort by severity level (CRITICAL > HIGH > MEDIUM/MODERATE > LOW)
        const severityLevels = {
            'CRITICAL': 5,
            'HIGH': 4,
            'MEDIUM': 3,
            'MODERATE': 3, // OSV API sometimes uses MODERATE instead of MEDIUM
            'LOW': 2,
            'INFORMATIONAL': 1,
            'UNKNOWN': 0
        };

        let highestSeverity = 'UNKNOWN';

        // Debug logging to understand vulnerability structure
        if (!vulnerability) {
            console.warn('⚠️ OSV: Vulnerability object is null or undefined');
            return highestSeverity;
        }

        // Additional safety check for vulnerability object
        if (typeof vulnerability !== 'object') {
            console.warn('⚠️ OSV: Vulnerability is not an object:', vulnerability);
            return highestSeverity;
        }

        console.log('🔍 OSV: Processing vulnerability:', {
            id: vulnerability.id,
            database_specific_severity: vulnerability.database_specific?.severity,
            severity: vulnerability.severity,
            severityType: typeof vulnerability.severity,
            isArray: Array.isArray(vulnerability.severity)
        });

        // First, check database_specific.severity (most reliable - this is the straightforward HIGH, LOW, etc.)
        if (vulnerability.database_specific && vulnerability.database_specific.severity) {
            const dbSeverity = vulnerability.database_specific.severity.toUpperCase();
            if (severityLevels[dbSeverity] > severityLevels[highestSeverity]) {
                highestSeverity = dbSeverity;
                console.log(`✅ OSV: Using database_specific severity: ${dbSeverity}`);
                return highestSeverity; // Return immediately since this is the most reliable
            }
        } else {
            console.log(`⚠️ OSV: No database_specific.severity found for ${vulnerability.id}, will check CVSS`);
        }

        // Check for informational vulnerabilities (unmaintained, etc.)
        if (vulnerability.affected && vulnerability.affected.length > 0) {
            const affected = vulnerability.affected[0];
            if (affected.database_specific && affected.database_specific.informational) {
                console.log(`ℹ️ OSV: Found informational vulnerability: ${affected.database_specific.informational}`);
                return 'INFORMATIONAL'; // Special severity for informational issues
            }
        }

        // Fallback: Check severity field (can be string or array)
        if (vulnerability.severity) {
            console.log(`🔍 OSV: Checking severity field for ${vulnerability.id}`);
        } else {
            console.log(`⚠️ OSV: No severity field found for ${vulnerability.id}, will try keyword inference`);
        }
        
        if (vulnerability.severity) {
            if (typeof vulnerability.severity === 'string') {
                // Direct severity string (like 'HIGH')
                const severityStr = vulnerability.severity.toUpperCase();
                if (severityLevels[severityStr] > severityLevels[highestSeverity]) {
                    highestSeverity = severityStr;
                    console.log(`✅ OSV: Using direct severity string: ${severityStr}`);
                }
            } else if (Array.isArray(vulnerability.severity) && vulnerability.severity.length > 0) {
                // CVSS array format
                vulnerability.severity.forEach(sev => {
                    if (sev.type === 'CVSS_V3' || sev.type === 'CVSS_V4') {
                        // Extract score from CVSS string like "CVSS:3.1/AV:L/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:H" or "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N"
                        let cvssMatch = sev.score.match(/CVSS:3\.[01]\/[^\/]+\/[^\/]+\/[^\/]+\/[^\/]+\/[^\/]+\/[^\/]+\/[^\/]+\/[^\/]+\/([^\/]+)/);
                        if (!cvssMatch) {
                            // Try CVSS v4 format
                            cvssMatch = sev.score.match(/CVSS:4\.0\/[^\/]+\/[^\/]+\/[^\/]+\/[^\/]+\/[^\/]+\/[^\/]+\/[^\/]+\/[^\/]+\/[^\/]+\/[^\/]+\/([^\/]+)/);
                        }
                        console.log(`🔍 OSV: CVSS score: ${sev.score}, match: ${cvssMatch ? 'yes' : 'no'}`);
                        if (cvssMatch) {
                            const impact = cvssMatch[1];
                            let score = 0;
                            
                            // Calculate base score from impact
                            if (impact === 'C:H/I:H/A:H') score = 9.8;
                            else if (impact === 'C:H/I:H/A:N') score = 8.8;
                            else if (impact === 'C:H/I:N/A:H') score = 8.6;
                            else if (impact === 'C:N/I:H/A:H') score = 8.2;
                            else if (impact === 'C:H/I:N/A:N') score = 7.5;
                            else if (impact === 'C:N/I:H/A:N') score = 7.5;
                            else if (impact === 'C:N/I:N/A:H') score = 7.5;
                            else if (impact === 'C:L/I:L/A:N') score = 3.7;
                            else if (impact === 'C:N/I:L/A:N') score = 3.7;
                            else if (impact === 'C:N/I:N/A:L') score = 3.7;
                            else if (impact === 'C:N/I:N/A:N') score = 0.0; // No impact
                            else {
                                console.log(`⚠️ OSV: Unknown CVSS impact pattern: ${impact}`);
                                // Try to estimate score based on individual components
                                let estimatedScore = 0;
                                if (impact.includes('C:H')) estimatedScore += 3;
                                else if (impact.includes('C:L')) estimatedScore += 1;
                                if (impact.includes('I:H')) estimatedScore += 3;
                                else if (impact.includes('I:L')) estimatedScore += 1;
                                if (impact.includes('A:H')) estimatedScore += 3;
                                else if (impact.includes('A:L')) estimatedScore += 1;
                                
                                score = Math.min(estimatedScore, 10.0);
                                console.log(`🔍 OSV: Estimated CVSS score for ${impact}: ${score}`);
                            }
                            
                            let cvssSeverity = 'UNKNOWN';
                            if (score >= 9.0) cvssSeverity = 'CRITICAL';
                            else if (score >= 7.0) cvssSeverity = 'HIGH';
                            else if (score >= 4.0) cvssSeverity = 'MEDIUM';
                            else if (score > 0) cvssSeverity = 'LOW';
                            
                            if (severityLevels[cvssSeverity] > severityLevels[highestSeverity]) {
                                highestSeverity = cvssSeverity;
                                console.log(`✅ OSV: Using CVSS severity: ${cvssSeverity} (score: ${score})`);
                            }
                        }
                    }
                });
            }
        }

        console.log(`🔍 OSV: Final severity for ${vulnerability.id}: ${highestSeverity}`);
        return highestSeverity;
    }

    /**
     * Get vulnerability statistics
     */
    getVulnerabilityStats(analysis) {
        return {
            totalPackages: analysis.totalPackages,
            vulnerablePackages: analysis.vulnerablePackages,
            vulnerabilityRate: analysis.totalPackages > 0 ? 
                (analysis.vulnerablePackages / analysis.totalPackages * 100).toFixed(1) : 0,
            totalVulnerabilities: analysis.totalVulnerabilities,
            criticalCount: analysis.criticalVulnerabilities,
            highCount: analysis.highVulnerabilities,
            mediumCount: analysis.mediumVulnerabilities,
            lowCount: analysis.lowVulnerabilities
        };
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
        console.log('🗑️ OSV: Cache cleared');
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            size: this.cache.size,
            entries: Array.from(this.cache.keys())
        };
    }

    /**
     * Test ecosystem detection with sample packages
     */
    testEcosystemDetection() {
        const testPackages = [
            // NPM packages
            'lodash',
            '@angular/core',
            'react',
            'axios',
            'moment',
            'jquery',
            'express',
            'vue',
            'bootstrap',
            'webpack',
            // Python packages
            'requests',
            'flask',
            'django',
            'numpy',
            'pandas',
            'matplotlib',
            'beautifulsoup4',
            // Java/Maven packages
            'org.springframework.boot:spring-boot-starter-web',
            'com.google.guava:guava',
            'io.netty:netty-all',
            // Go packages
            'github.com/gorilla/mux',
            'golang.org/x/text',
            'go.uber.org/zap',
            // Ruby gems
            'rails',
            'sinatra',
            'rack',
            'bundler',
            'rspec'
        ];

        console.log('🧪 Testing name-based ecosystem detection:');
        testPackages.forEach(pkg => {
            const ecosystem = this.detectEcosystemFromName(pkg);
            console.log(`  ${pkg} -> ${ecosystem || 'null'}`);
        });
    }

    /**
     * Test vulnerability details with external links
     */
    testVulnerabilityDetails() {
        // Sample vulnerability data with external links
        const sampleVulnerabilities = [
            {
                id: "GHSA-1234-5678-9abc",
                summary: "Cross-site scripting (XSS) vulnerability in example package",
                details: "A cross-site scripting vulnerability was found in the example package that allows attackers to inject arbitrary web scripts or HTML via a crafted payload.",
                severity: [
                    {
                        type: "CVSS_V3",
                        score: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"
                    }
                ],
                database_specific: {
                    severity: "HIGH"
                },
                published: "2023-01-15T10:00:00Z",
                modified: "2023-01-20T14:30:00Z",
                references: [
                    {
                        type: "ADVISORY",
                        url: "https://github.com/advisories/GHSA-1234-5678-9abc"
                    },
                    {
                        type: "REPORT",
                        url: "https://nvd.nist.gov/vuln/detail/CVE-2023-12345"
                    },
                    {
                        type: "FIX",
                        url: "https://github.com/example/package/commit/abc123def456"
                    },
                    {
                        type: "PACKAGE",
                        url: "https://pypi.org/project/example-package/"
                    }
                ]
            },
            {
                id: "GHSA-9876-5432-def0",
                summary: "SQL injection vulnerability in database component",
                details: "A SQL injection vulnerability exists in the database component that allows attackers to execute arbitrary SQL commands.",
                severity: [
                    {
                        type: "CVSS_V3",
                        score: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:L/A:N"
                    }
                ],
                database_specific: {
                    severity: "MEDIUM"
                },
                published: "2023-02-10T09:00:00Z",
                modified: "2023-02-15T16:45:00Z",
                references: [
                    {
                        type: "ADVISORY",
                        url: "https://github.com/advisories/GHSA-9876-5432-def0"
                    },
                    {
                        type: "REPORT",
                        url: "https://nvd.nist.gov/vuln/detail/CVE-2023-67890"
                    },
                    {
                        type: "FIX",
                        url: "https://github.com/example/database/commit/def456ghi789"
                    }
                ]
            }
        ];

        // Show the vulnerability details modal with sample data
        if (window.viewManager) {
            window.viewManager.showVulnerabilityDetails('example-package', '1.0.0', sampleVulnerabilities);
        } else {
            console.log('Sample vulnerability data with external links:', sampleVulnerabilities);
        }
    }

    /**
     * Test PURL-based ecosystem detection with sample SBOM packages
     */
    testPurlEcosystemDetection() {
        const testPackages = [
            // PyPI packages
            {
                name: 'flask',
                externalRefs: [{
                    referenceType: 'purl',
                    referenceLocator: 'pkg:pypi/flask@1.1.2'
                }]
            },
            {
                name: 'requests',
                externalRefs: [{
                    referenceType: 'purl',
                    referenceLocator: 'pkg:pypi/requests@2.25.1'
                }]
            },
            // NPM packages
            {
                name: 'lodash',
                externalRefs: [{
                    referenceType: 'purl',
                    referenceLocator: 'pkg:npm/lodash@4.17.21'
                }]
            },
            // Maven packages
            {
                name: 'org.springframework.boot:spring-boot-starter-web',
                externalRefs: [{
                    referenceType: 'purl',
                    referenceLocator: 'pkg:maven/org.springframework.boot/spring-boot-starter-web@2.5.0'
                }]
            },
            // GitHub Actions
            {
                name: 'actions/checkout',
                externalRefs: [{
                    referenceType: 'purl',
                    referenceLocator: 'pkg:githubactions/actions/checkout@4'
                }]
            }
        ];

        console.log('🧪 Testing PURL-based ecosystem detection:');
        testPackages.forEach(pkg => {
            const ecosystem = this.extractEcosystemFromPurl(pkg);
            console.log(`  ${pkg.name} (${pkg.externalRefs[0].referenceLocator}) -> ${ecosystem || 'null'}`);
        });
    }
}

// Export for use in other modules
window.OSVService = OSVService;

// Create global instance
const osvService = new OSVService();
window.osvService = osvService; 