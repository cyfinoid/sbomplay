/**
 * OSV Service - Queries OSV API for vulnerability information
 * BUILD: 1764041557320 (with version resolution for unknown versions)
 */
console.log('🛡️ OSV Service loaded - BUILD: 1764041557320 (resolves unknown versions)');

class OSVService {
    constructor() {
        this.baseUrl = 'https://api.osv.dev';
        // Cache is handled by unified cacheManager
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
        
        // Check unified cache first (NEW ARCHITECTURE)
        if (window.cacheManager) {
            const cached = await window.cacheManager.getVulnerability(cacheKey);
            if (cached) {
                console.log(`📦 OSV: Using unified cache for ${cacheKey}`);
                return cached;
            }
        }
        
        // Check centralized storage (legacy)
        if (window.storageManager && window.storageManager.hasVulnerabilityData(cacheKey)) {
            const storedData = window.storageManager.getVulnerabilityDataForPackage(cacheKey);
            if (storedData && storedData.data) {
                console.log(`📦 OSV: Using centralized storage for ${cacheKey}`);
                // Also save to unified cache
                if (window.cacheManager) {
                    await window.cacheManager.saveVulnerability(cacheKey, storedData.data);
                }
                return storedData.data;
            }
        }
        
        // In-memory cache is handled by unified cacheManager

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

            const url = `${this.baseUrl}/v1/query`;
            debugLogUrl(`🌐 [DEBUG] Fetching URL: ${url}`);
            debugLogUrl(`   Reason: Querying OSV API for vulnerabilities for package ${cleanName}@${cleanVersion} (ecosystem: ${mappedEcosystem || 'auto-detected'})`);

            const response = await fetchWithTimeout(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(query)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`❌ OSV: API Response for ${cacheKey}:`, errorText);
                console.log(`   ❌ Response: Status ${response.status} ${response.statusText}`);
                throw new Error(`OSV API error: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const data = await response.json();
            
            // Debug: Log extracted information
            const vulnCount = data.vulns?.length || 0;
            const extractedInfo = `Extracted: ${vulnCount} vulnerability/vulnerabilities for ${cleanName}@${cleanVersion}`;
            if (vulnCount > 0) {
                const vulnIds = data.vulns.slice(0, 3).map(v => v.id).join(', ');
                console.log(`   ✅ Response: Status ${response.status}, ${extractedInfo} (IDs: ${vulnIds}${vulnCount > 3 ? '...' : ''})`);
            } else {
                console.log(`   ✅ Response: Status ${response.status}, ${extractedInfo}`);
            }
            
            // Save to unified cache (NEW ARCHITECTURE)
            if (window.cacheManager) {
                await window.cacheManager.saveVulnerability(cacheKey, data);
            }

            // Save to centralized storage (legacy)
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
     * With improved error handling and retry logic for failed chunks
     */
    async queryVulnerabilitiesBatch(packages) {
        if (packages.length === 0) return [];
        const MAX_BATCH = 100; // OSV API limit - tested and confirmed
        const MAX_RETRIES = 2; // Retry failed chunks up to 2 times
        
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
            let failedChunks = [];
            
            for (let idx = 0; idx < chunks.length; idx++) {
                const chunk = chunks[idx];
                console.log(`🔍 OSV: Sending chunk ${idx + 1}/${chunks.length} with ${chunk.length} queries`);
                
                const result = await this._queryBatchChunk(chunk, idx + 1, chunks.length);
                
                if (result.success) {
                    allResults = allResults.concat(result.data);
                } else {
                    // Store failed chunk for retry
                    failedChunks.push({ chunk, idx });
                    // Fill with empty results to maintain order
                    allResults = allResults.concat(chunk.map(() => ({ vulns: [] })));
                }
            }

            // Retry failed chunks
            for (let retry = 0; retry < MAX_RETRIES && failedChunks.length > 0; retry++) {
                console.log(`🔄 OSV: Retrying ${failedChunks.length} failed chunk(s) (attempt ${retry + 1}/${MAX_RETRIES})`);
                const stillFailed = [];
                
                for (const { chunk, idx } of failedChunks) {
                    // Wait before retry
                    await new Promise(resolve => setTimeout(resolve, 1000 * (retry + 1)));
                    
                    const result = await this._queryBatchChunk(chunk, idx + 1, chunks.length, true);
                    
                    if (result.success) {
                        // Replace empty results with actual data
                        const startIdx = idx * MAX_BATCH;
                        result.data.forEach((data, i) => {
                            if (startIdx + i < allResults.length) {
                                allResults[startIdx + i] = data;
                            }
                        });
                    } else {
                        stillFailed.push({ chunk, idx });
                    }
                }
                
                failedChunks = stillFailed;
            }

            if (failedChunks.length > 0) {
                console.warn(`⚠️ OSV: ${failedChunks.length} chunk(s) failed after retries`);
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
     * Query a single batch chunk
     * @param {Array} chunk - Array of query objects
     * @param {number} chunkNum - Current chunk number (for logging)
     * @param {number} totalChunks - Total number of chunks (for logging)
     * @param {boolean} isRetry - Whether this is a retry attempt
     * @returns {Object} - { success: boolean, data: Array }
     */
    async _queryBatchChunk(chunk, chunkNum, totalChunks, isRetry = false) {
        try {
            const url = `${this.baseUrl}/v1/querybatch`;
            const logPrefix = isRetry ? '🔄' : '🔍';
            
            debugLogUrl(`🌐 [DEBUG] Fetching URL: ${url}`);
            debugLogUrl(`   Reason: Batch querying OSV API for ${chunk.length} packages (chunk ${chunkNum}/${totalChunks}${isRetry ? ' - retry' : ''})`);
            
            const response = await fetchWithTimeout(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ queries: chunk })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`❌ OSV: API Response (chunk ${chunkNum}):`, errorText);
                console.log(`   ❌ Response: Status ${response.status} ${response.statusText}`);
                return { success: false, data: [] };
            }

            const data = await response.json();
            
            // Debug: Log extracted information
            const resultsCount = data.results?.length || 0;
            const vulnCount = data.results?.reduce((sum, r) => sum + (r.vulns?.length || 0), 0) || 0;
            console.log(`   ${logPrefix} Response: Status ${response.status}, Extracted: Batch results for ${resultsCount} packages with ${vulnCount} total vulnerabilities`);
            
            return { success: true, data: data.results || [] };
        } catch (error) {
            console.error(`❌ OSV: Chunk ${chunkNum} error:`, error.message);
            return { success: false, data: [] };
        }
    }

    /**
     * Map ecosystem names to OSV-compatible names
     * Uses shared EcosystemMapper for consistency
     */
    mapEcosystemToOSV(ecosystem) {
        if (window.ecosystemMapper) {
            return window.ecosystemMapper.mapToOSV(ecosystem) || ecosystem;
        }
        // Fallback if EcosystemMapper not available
        return ecosystem;
    }

    /**
     * Extract ecosystem from PURL or package data
     * Using only valid OSV ecosystem values
     * Uses shared EcosystemMapper for consistency
     */
    extractEcosystemFromPurl(pkg) {
        if (!pkg) return null;
        
        // Use shared EcosystemMapper if available
        if (window.ecosystemMapper) {
            const mapped = window.ecosystemMapper.extractEcosystemFromPurl(pkg);
            if (mapped) {
                return mapped;
            }
        }
        
        // Fallback to name-based detection if no PURL or SPDXID is available
        console.log(`⚠️ OSV: No PURL or SPDXID found for ${pkg.name}, falling back to name-based detection`);
        return this.detectEcosystemFromName(pkg.name);
    }
    
    /**
     * Detect ecosystem based on package name (fallback method)
     * Uses shared EcosystemMapper for consistency
     */
    detectEcosystemFromName(packageName) {
        if (window.ecosystemMapper) {
            return window.ecosystemMapper.detectFromName(packageName);
        }
        // Fallback if EcosystemMapper not available
        return null;
    }

    /**
     * Analyze dependencies for vulnerabilities
     */
    async analyzeDependencies(dependencies, onProgress = null) {
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
            results = await this.queryVulnerabilitiesIndividually(packages, onProgress);
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

        let totalMalwareDropped = 0;
        dependencies.forEach((dep, index) => {
            const vulnResult = results[index];
            const rawVulns = vulnResult?.vulns || [];

            // Defensive filter: drop MAL- advisories whose `affected[]`
            // entries don't actually apply to this dep's version. The OSV
            // batch endpoint occasionally returns malware advisories that
            // pin a single version even when we asked about a different
            // one (e.g. MAL-2025-6516 / graphemer@3.1.2 surfacing for
            // graphemer@1.4.0). We re-run the OSV-spec match here so the
            // false positives don't leak into the vuln dashboard, the
            // findings page, the feeds, or the malware page.
            const depEcosystem = dep.ecosystem || dep.category?.ecosystem || null;
            const vulnerabilities = rawVulns.filter(v => {
                if (!v) return false;
                const isMal = this.classifyKind(v) === 'malware';
                if (!isMal) return true; // CVE filtering is OSV's job
                const matches = this.advisoryAppliesToVersion(v, dep.version, depEcosystem);
                if (!matches) {
                    totalMalwareDropped++;
                    console.log(`🛡️ OSV: dropping ${v.id} for ${dep.name}@${dep.version || 'unknown'} (advisory targets a different version)`);
                }
                return matches;
            });

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

                // Add to vulnerable dependencies list with full metadata
                vulnerabilityAnalysis.vulnerableDependencies.push({
                    name: dep.name,
                    version: dep.version,
                    ecosystem: dep.ecosystem || dep.category?.ecosystem || null,
                    versionDrift: dep.versionDrift || null,
                    category: dep.category || null,
                    vulnerabilities: vulnerabilities.map(vuln => {
                        const severity = this.getHighestSeverity(vuln);
                        const kind = this.classifyKind(vuln);
                        console.log(`🔍 OSV: Mapped vulnerability ${vuln.id} severity: ${severity} kind: ${kind}`);
                        return {
                            id: vuln.id,
                            summary: vuln.summary,
                            details: vuln.details,
                            severity: severity,
                            kind: kind,
                            published: vuln.published,
                            modified: vuln.modified,
                            references: vuln.references || [],
                            affected: kind === 'malware' ? (vuln.affected || []) : undefined
                        };
                    })
                });
            }
        });

        if (totalMalwareDropped > 0) {
            console.log(`🛡️ OSV: dropped ${totalMalwareDropped} malware advisor(ies) whose affected[] did not match the queried version`);
        }
        console.log(`✅ OSV: Analysis complete - ${vulnerabilityAnalysis.vulnerablePackages} vulnerable packages found`);
        return vulnerabilityAnalysis;
    }

    /**
     * Classify an OSV advisory as a CVE-style vulnerability or a malicious
     * package. Malicious package advisories use the `MAL-YYYY-NNN` ID prefix
     * and/or carry `affected[].database_specific['malicious-packages-origins']`.
     * Returns either 'cve' or 'malware'. Defaults to 'cve' so existing
     * consumers (e.g. severity dashboards) treat unknown advisories as vulns.
     */
    classifyKind(vuln) {
        if (!vuln || typeof vuln !== 'object') return 'cve';
        const id = String(vuln.id || '');
        if (id.startsWith('MAL-')) return 'malware';
        const affected = Array.isArray(vuln.affected) ? vuln.affected : [];
        for (const a of affected) {
            const ds = a && a.database_specific;
            if (!ds || typeof ds !== 'object') continue;
            if (ds['malicious-packages-origins']) return 'malware';
            if (ds.malicious === true) return 'malware';
        }
        return 'cve';
    }

    /**
     * OSV-spec strict version match against an advisory's `affected[]`.
     * Used as a defensive secondary filter for MAL- advisories where the
     * batch endpoint sometimes returns hits for non-matching versions.
     *
     * - if `affected[]` is empty/missing -> match (conservative)
     * - if `version` is unknown/blank   -> match (we can't disprove it)
     * - else each entry is a disjunction:
     *     * `versions[]` includes the version, OR
     *     * a *meaningful* `ranges[]` entry covers the version
     *       (introduced > 0, or any `fixed` / `last_affected`), OR
     *     * neither `versions` nor `ranges` is present (entry-level wildcard)
     *
     * Trivial open-ended placeholder ranges (`{introduced: "0"}` with no
     * `fixed` / `last_affected`) are intentionally ignored when an
     * explicit `versions[]` enumeration is present on the same entry.
     * The OSSF Malicious Packages dataset routinely emits such a
     * placeholder alongside the authoritative `versions[]` list (e.g.
     * MAL-2024-2506 enumerates `["1.0.0", "10.1.1"]` while still pinning
     * `ranges: [{introduced: "0"}]`) - trusting that range would flag
     * every installed version of the package as malicious.
     *
     * NOTE: `database_specific.malicious-packages-origins[].ranges` is
     * intentionally NOT consulted - that is import-source metadata, not an
     * OSV affected-range and treating it as such causes broad mis-flags.
     */
    advisoryAppliesToVersion(vuln, version, ecosystem) {
        if (!vuln || typeof vuln !== 'object') return true;
        const affected = Array.isArray(vuln.affected) ? vuln.affected : [];
        if (affected.length === 0) return true;
        if (version === undefined || version === null) return true;
        const v = String(version).trim();
        if (!v || v.toLowerCase() === 'unknown') return true;
        const depEco = ecosystem ? String(ecosystem).toLowerCase() : null;
        for (const a of affected) {
            if (!a || typeof a !== 'object') continue;
            if (a.package && a.package.ecosystem && depEco) {
                const advEco = String(a.package.ecosystem).toLowerCase();
                if (advEco !== depEco) continue;
            }
            const versions = Array.isArray(a.versions) ? a.versions : [];
            const ranges = Array.isArray(a.ranges) ? a.ranges : [];
            if (versions.length === 0 && ranges.length === 0) return true;
            if (versions.length > 0 && versions.includes(v)) return true;
            // When `versions[]` is non-empty, consult only ranges that add
            // information beyond the explicit enumeration - drop trivial
            // open-ended placeholders so we don't mass-flag unaffected
            // versions of a partially-malicious package.
            const effectiveRanges = versions.length > 0
                ? ranges.filter(r => !this._isTrivialOpenRange(r))
                : ranges;
            if (effectiveRanges.length > 0 && this._versionInRanges(v, effectiveRanges)) return true;
        }
        return false;
    }

    /**
     * Returns true for a `ranges[]` entry that carries no information
     * beyond "all versions" - i.e. a single `introduced: "0"` event with
     * no `fixed` / `last_affected` companion. These are produced by the
     * OSSF Malicious Packages dataset as a schema-required placeholder
     * when the author only knows the explicit malicious versions, not a
     * lower bound. See `advisoryAppliesToVersion` for context.
     */
    _isTrivialOpenRange(range) {
        if (!range || !Array.isArray(range.events)) return false;
        let introduced = null;
        let fixed = null;
        let lastAffected = null;
        for (const ev of range.events) {
            if (!ev || typeof ev !== 'object') continue;
            if (Object.prototype.hasOwnProperty.call(ev, 'introduced')) introduced = ev.introduced;
            if (Object.prototype.hasOwnProperty.call(ev, 'fixed')) fixed = ev.fixed;
            if (Object.prototype.hasOwnProperty.call(ev, 'last_affected')) lastAffected = ev.last_affected;
        }
        return introduced === '0' && fixed === null && lastAffected === null;
    }

    _versionInRanges(version, ranges) {
        for (const range of ranges) {
            if (!range || !Array.isArray(range.events)) continue;
            let introduced = null;
            let fixed = null;
            let lastAffected = null;
            for (const ev of range.events) {
                if (!ev || typeof ev !== 'object') continue;
                if (Object.prototype.hasOwnProperty.call(ev, 'introduced')) introduced = ev.introduced;
                if (Object.prototype.hasOwnProperty.call(ev, 'fixed')) fixed = ev.fixed;
                if (Object.prototype.hasOwnProperty.call(ev, 'last_affected')) lastAffected = ev.last_affected;
            }
            if (introduced === null && fixed === null && lastAffected === null) continue;
            const introducedOk = introduced === null
                || introduced === '0'
                || this._compareVersions(version, introduced) >= 0;
            const fixedOk = fixed === null || this._compareVersions(version, fixed) < 0;
            const lastAffectedOk = lastAffected === null || this._compareVersions(version, lastAffected) <= 0;
            if (introducedOk && fixedOk && lastAffectedOk) return true;
        }
        return false;
    }

    _compareVersions(a, b) {
        if (a === b) return 0;
        const parse = (s) => {
            const cleaned = String(s).replace(/^v/i, '');
            const dashIdx = cleaned.search(/[-+]/);
            const main = dashIdx === -1 ? cleaned : cleaned.slice(0, dashIdx);
            const tail = dashIdx === -1 ? '' : cleaned.slice(dashIdx + 1);
            const tokens = main.split('.').map(t => /^\d+$/.test(t) ? parseInt(t, 10) : t);
            return { tokens, tail };
        };
        const A = parse(a);
        const B = parse(b);
        const len = Math.max(A.tokens.length, B.tokens.length);
        for (let i = 0; i < len; i++) {
            const x = A.tokens[i] === undefined ? 0 : A.tokens[i];
            const y = B.tokens[i] === undefined ? 0 : B.tokens[i];
            if (x === y) continue;
            if (typeof x === 'number' && typeof y === 'number') return x - y;
            return String(x).localeCompare(String(y));
        }
        if (A.tail && !B.tail) return -1;
        if (!A.tail && B.tail) return 1;
        if (A.tail && B.tail) return A.tail.localeCompare(B.tail);
        return 0;
    }

    /**
     * Analyze dependencies for vulnerabilities with incremental saving
     */
    async analyzeDependenciesWithIncrementalSaving(dependencies, orgName, onProgress = null) {
        console.log(`🔍 OSV: Analyzing ${dependencies.length} dependencies for vulnerabilities with incremental saving`);
        
        // Resolve unknown versions to latest before filtering
        const resolver = window.DependencyTreeResolver ? new window.DependencyTreeResolver() : null;
        let resolvedCount = 0;
        let unknownCount = dependencies.filter(d => !d.version || d.version === 'unknown').length;
        
        if (!resolver) {
            console.warn('⚠️  OSV: DependencyTreeResolver not available, cannot resolve unknown versions');
        } else if (unknownCount > 0) {
            console.log(`🔍 OSV: Attempting to resolve ${unknownCount} dependencies with unknown versions...`);
        }
        
        for (const dep of dependencies) {
            if (!dep.version || dep.version === 'unknown') {
                // Try to resolve to latest version
                // Use multiple fallbacks to detect ecosystem
                let ecosystem = dep.category?.ecosystem?.toLowerCase() || 
                                (dep.pkg ? this.extractEcosystemFromPurl(dep.pkg)?.toLowerCase() : null) ||
                                (dep.ecosystem ? dep.ecosystem.toLowerCase() : null) ||
                                this.detectEcosystemFromName(dep.name)?.toLowerCase();
                
                if (resolver && ecosystem) {
                    try {
                        const latestVersion = await resolver.fetchLatestVersion(dep.name, ecosystem);
                        if (latestVersion) {
                            console.log(`   ✅ OSV: Resolved ${dep.name} (${ecosystem}) → v${latestVersion} for vulnerability scan`);
                            dep.version = latestVersion;
                            dep.resolvedForVulnScan = true;
                            resolvedCount++;
                        }
                    } catch (error) {
                        console.debug(`   ⚠️  OSV: Could not resolve latest version for ${dep.name}: ${error.message}`);
                    }
                }
            }
        }
        
        if (resolvedCount > 0) {
            console.log(`🔍 OSV: Resolved ${resolvedCount} unknown versions to latest for vulnerability scanning`);
        }
        
        // Filter out dependencies that still don't have valid versions
        const validDependencies = dependencies.filter(dep => {
            if (!dep.version || dep.version === 'unknown') {
                console.warn(`⚠️  Skipping vulnerability scan for ${dep.name}: no version available (could not resolve)`);
                return false;
            }
            return true;
        });
        
        console.log(`🔍 OSV: ${validDependencies.length}/${dependencies.length} dependencies have valid versions for vulnerability scanning`);
        
        const packages = validDependencies.map(dep => {
            const detectedEcosystem = dep.pkg ? this.extractEcosystemFromPurl(dep.pkg) : this.detectEcosystemFromName(dep.name);
            const mappedEcosystem = detectedEcosystem ? this.mapEcosystemToOSV(detectedEcosystem) : null;
            return {
                name: dep.name,
                version: dep.version,
                ecosystem: mappedEcosystem
            };
        });

        // Try batch query first for quick vulnerability detection
        if (onProgress) {
            onProgress(5, `Querying vulnerability database for ${packages.length} packages...`);
        }
        let results = await this.queryVulnerabilitiesBatch(packages);
        
        // Check if batch query returned minimal data (just id and modified)
        const hasMinimalData = results.some(result => 
            result.vulns && result.vulns.length > 0 && 
            result.vulns[0] && Object.keys(result.vulns[0]).length <= 3
        );
        
        // If batch query failed, returned no results, or returned minimal data, fall back to individual queries
        if (!results || results.length === 0 || hasMinimalData) {
            console.log('⚠️ OSV: Batch query returned minimal data, falling back to individual queries for full details');
            if (onProgress) {
                onProgress(10, `Scanning packages individually for detailed vulnerability data...`);
            }
            results = await this.queryVulnerabilitiesIndividually(packages, onProgress);
        } else if (onProgress) {
            onProgress(50, `Processing vulnerability results...`);
        }
        
        const vulnerabilityAnalysis = {
            totalPackages: validDependencies.length,
            vulnerablePackages: 0,
            totalVulnerabilities: 0,
            criticalVulnerabilities: 0,
            highVulnerabilities: 0,
            mediumVulnerabilities: 0,
            lowVulnerabilities: 0,
            vulnerableDependencies: []
        };

        let totalMalwareDropped = 0;
        for (let index = 0; index < validDependencies.length; index++) {
            const dep = validDependencies[index];
            const vulnResult = results[index] || { vulns: [] };
            const rawVulns = vulnResult?.vulns || [];

            // Strict per-version filter for MAL- advisories. See the
            // matching logic in `analyzeDependencies` for the rationale -
            // we drop malware advisories that target a different version
            // so they don't pollute the dashboards.
            const depEcosystem = dep.ecosystem || dep.category?.ecosystem || null;
            const vulnerabilities = rawVulns.filter(v => {
                if (!v) return false;
                if (this.classifyKind(v) !== 'malware') return true;
                const matches = this.advisoryAppliesToVersion(v, dep.version, depEcosystem);
                if (!matches) {
                    totalMalwareDropped++;
                    console.log(`🛡️ OSV: dropping ${v.id} for ${dep.name}@${dep.version || 'unknown'} (advisory targets a different version)`);
                }
                return matches;
            });

            // ALWAYS save to cache immediately (even if no vulnerabilities found)
            // This ensures incremental storage during analysis
            const cacheKey = `${dep.name}@${dep.version}`;
            
            // Save to unified cache (NEW ARCHITECTURE) - saves immediately for each entry
            if (window.cacheManager) {
                await window.cacheManager.saveVulnerability(cacheKey, vulnResult);
                console.log(`💾 OSV: Saved vulnerability data to cache: ${cacheKey} (${vulnerabilities.length} vulns)`);
            }
            
            // Also save to legacy centralized storage (for backward compatibility)
            if (window.storageManager) {
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

                // Add to vulnerable dependencies list with full metadata
                vulnerabilityAnalysis.vulnerableDependencies.push({
                    name: dep.name,
                    version: dep.version,
                    ecosystem: dep.ecosystem || dep.category?.ecosystem || null,
                    versionDrift: dep.versionDrift || null,
                    category: dep.category || null,
                    vulnerabilities: vulnerabilities.map(vuln => {
                        const severity = this.getHighestSeverity(vuln);
                        const kind = this.classifyKind(vuln);
                        console.log(`🔍 OSV: Mapped vulnerability ${vuln.id} severity: ${severity} kind: ${kind}`);
                        return {
                            id: vuln.id,
                            summary: vuln.summary,
                            details: vuln.details,
                            severity: severity,
                            kind: kind,
                            published: vuln.published,
                            modified: vuln.modified,
                            references: vuln.references || [],
                            affected: kind === 'malware' ? (vuln.affected || []) : undefined
                        };
                    })
                });
            }

            // Save incrementally every 10 dependencies
            if ((index + 1) % 10 === 0 || index === dependencies.length - 1) {
                console.log(`💾 OSV: Saving incremental vulnerability data (${index + 1}/${dependencies.length} dependencies processed)`);
                
                if (window.storageManager && orgName) {
                    const saveSuccess = await window.storageManager.updateAnalysisWithVulnerabilities(orgName, vulnerabilityAnalysis);
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
        }

        // Final progress update
        if (onProgress) {
            onProgress(100, `Vulnerability analysis complete - ${vulnerabilityAnalysis.vulnerablePackages} vulnerable packages found`);
        }

        if (totalMalwareDropped > 0) {
            console.log(`🛡️ OSV: dropped ${totalMalwareDropped} malware advisor(ies) whose affected[] did not match the queried version`);
        }
        console.log(`✅ OSV: Analysis complete - ${vulnerabilityAnalysis.vulnerablePackages} vulnerable packages found`);
        return vulnerabilityAnalysis;
    }

    /**
     * Query vulnerabilities individually as fallback (parallelized)
     */
    async queryVulnerabilitiesIndividually(packages, onProgress = null) {
        console.log(`🔍 OSV: Querying ${packages.length} packages individually (parallelized)`);
        
        const CONCURRENCY_LIMIT = 15; // Process 15 packages concurrently
        const results = new Array(packages.length); // Pre-allocate array to maintain order
        let processedCount = 0;
        
        // Helper function to query a single package
        const queryPackage = async (pkg, index) => {
            try {
                const result = await this.queryVulnerabilities(pkg.name, pkg.version, pkg.ecosystem);
                results[index] = result;
                return { index, result, success: true };
            } catch (error) {
                console.error(`❌ OSV: Error querying ${pkg.name}@${pkg.version}:`, error);
                results[index] = { vulns: [] };
                return { index, result: { vulns: [] }, success: false };
            }
        };
        
        // Process packages in batches with concurrency limit
        for (let i = 0; i < packages.length; i += CONCURRENCY_LIMIT) {
            const batch = packages.slice(i, i + CONCURRENCY_LIMIT);
            const batchPromises = batch.map((pkg, batchIndex) => 
                queryPackage(pkg, i + batchIndex)
            );
            
            // Wait for all packages in this batch to complete
            const batchResults = await Promise.allSettled(batchPromises);
            
            // Update processed count (thread-safe - done after batch completes)
            processedCount += batchResults.length;
            
            // Report progress
            if (onProgress) {
                const progressPercent = (processedCount / packages.length) * 100;
                onProgress(progressPercent, `Scanning package ${processedCount}/${packages.length} for vulnerabilities...`);
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
     * Uses unified cacheManager
     */
    clearCache() {
        if (window.cacheManager) {
            window.cacheManager.clearCache('vulnerabilities');
            console.log('🗑️ OSV: Cache cleared via cacheManager');
        }
    }

    /**
     * Get cache statistics
     * Note: Cache stats are now managed by unified cacheManager
     */
    getCacheStats() {
        // Cache stats are handled by unified cacheManager
        return {
            message: 'Cache stats available via window.cacheManager'
        };
    }

}

// Export for use in other modules
window.OSVService = OSVService;

// Create global instance
const osvService = new OSVService();
window.osvService = osvService; 