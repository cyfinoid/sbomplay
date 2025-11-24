/**
 * Fix Transitive Dependencies Without Repository Associations
 * 
 * This script fixes transitive dependencies that have no repository associations
 * by querying package registries for repository URLs and applying licenses.
 * 
 * Usage: Run this after comprehensive-license-fix.js to handle edge cases
 */

(async function fixTransitiveLicenses() {
    console.log('🔧 Starting transitive license fix for dependencies without repository associations...');
    console.log('   This fixes transitive dependencies that were resolved from registries\n');
    
    const storageManager = new StorageManager();
    await storageManager.init();
    
    const entries = await storageManager.indexedDB.getAllEntries();
    console.log(`📦 Found ${entries.length} analyses to process\n`);
    
    let stats = {
        totalProcessed: 0,
        pypiLicensesFetched: 0,
        repoUrlsFound: 0,
        licensesUpdated: 0
    };
    
    for (const entry of entries) {
        if (!entry.data || !entry.data.allDependencies || !entry.data.allRepositories) {
            console.log(`⏭️  Skipping ${entry.name} - missing data\n`);
            continue;
        }
        
        console.log(`${'='.repeat(60)}`);
        console.log(`📝 Processing: ${entry.name}`);
        console.log(`${'='.repeat(60)}`);
        
        const allDeps = entry.data.allDependencies;
        const allRepos = entry.data.allRepositories;
        
        // Build a map of repository URLs to their licenses
        const repoUrlToLicense = new Map();
        allRepos.forEach(repo => {
            if (repo.url && repo.license) {
                repoUrlToLicense.set(repo.url.toLowerCase().replace(/\.git$/, ''), repo.license);
            }
        });
        
        console.log(`📚 Found ${repoUrlToLicense.size} repositories with licenses\n`);
        
        // Find transitive dependencies without repositories
        const transitiveWithoutRepos = allDeps.filter(dep => 
            (!dep.repositories || dep.repositories.length === 0) &&
            (!dep.license || dep.license === 'Unknown' || !dep.licenseFull || dep.licenseFull === 'Unknown')
        );
        
        if (transitiveWithoutRepos.length === 0) {
            console.log('✅ No transitive dependencies without repositories found\n');
            continue;
        }
        
        console.log(`🔍 Found ${transitiveWithoutRepos.length} transitive dependencies without repository associations`);
        console.log(`   Querying package registries for repository URLs and licenses...\n`);
        
        // Process in batches
        const batchSize = 5;
        for (let i = 0; i < transitiveWithoutRepos.length; i += batchSize) {
            const batch = transitiveWithoutRepos.slice(i, i + batchSize);
            
            await Promise.all(batch.map(async (dep) => {
                const ecosystem = dep.category?.ecosystem?.toLowerCase();
                stats.totalProcessed++;
                
                try {
                    if (ecosystem === 'pypi') {
                        // Query PyPI API for package metadata
                        const url = `https://pypi.org/pypi/${encodeURIComponent(dep.name)}/json`;
                        const response = await fetch(url);
                        
                        if (response.ok) {
                            const data = await response.json();
                            const info = data.info || {};
                            
                            // Try to get repository URL
                            let repoUrl = null;
                            if (info.project_urls) {
                                repoUrl = info.project_urls.Source || 
                                          info.project_urls.Repository || 
                                          info.project_urls['Source Code'] ||
                                          info.project_urls.Homepage;
                            }
                            if (!repoUrl && info.home_page) {
                                repoUrl = info.home_page;
                            }
                            
                            // Clean up repo URL
                            if (repoUrl && repoUrl.includes('github.com')) {
                                repoUrl = repoUrl.toLowerCase().replace(/\.git$/, '').replace(/\/$/, '');
                                const repoLicense = repoUrlToLicense.get(repoUrl);
                                
                                if (repoLicense) {
                                    dep.repositoryLicense = repoLicense;
                                    dep.licenseFull = repoLicense;
                                    dep.license = repoLicense.startsWith('Apache') ? 'Apache' :
                                        (repoLicense.length > 8 ? repoLicense.substring(0, 8) + '...' : repoLicense);
                                    stats.repoUrlsFound++;
                                    stats.licensesUpdated++;
                                    console.log(`   ✅ ${dep.name}@${dep.version}: Found repo ${repoUrl} → ${repoLicense}`);
                                    return;
                                }
                            }
                            
                            // If no repo match, try to get license from PyPI metadata
                            let license = info.license;
                            if (!license || license === 'UNKNOWN') {
                                // Try license_expression (PEP 639)
                                license = info.license_expression;
                            }
                            if (!license || license === 'UNKNOWN') {
                                // Try classifiers
                                const classifiers = info.classifiers || [];
                                const licenseClassifier = classifiers.find(c => c.startsWith('License ::'));
                                if (licenseClassifier) {
                                    const parts = licenseClassifier.split('::');
                                    license = parts[parts.length - 1].trim();
                                }
                            }
                            
                            if (license && license !== 'UNKNOWN' && license.trim() !== '') {
                                dep.licenseFull = license;
                                dep.license = license.startsWith('Apache') ? 'Apache' :
                                    (license.length > 8 ? license.substring(0, 8) + '...' : license);
                                dep.raw = dep.raw || {};
                                dep.raw.licenseFull = license;
                                stats.pypiLicensesFetched++;
                                stats.licensesUpdated++;
                                console.log(`   📄 ${dep.name}@${dep.version}: ${license} (from PyPI metadata)`);
                            }
                        }
                    }
                    // Add similar logic for other ecosystems (npm, RubyGems, etc.) if needed
                } catch (error) {
                    // Silent fail
                }
            }));
            
            // Small delay between batches
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Save changes
        console.log(`\n💾 Saving changes to IndexedDB...`);
        const saveSuccess = await storageManager.saveAnalysisData(entry.name, entry.data);
        if (saveSuccess) {
            console.log(`✅ Successfully saved ${entry.name}\n`);
        } else {
            console.warn(`⚠️  Failed to save ${entry.name}\n`);
        }
    }
    
    // Final summary
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ TRANSITIVE LICENSE FIX COMPLETE!`);
    console.log(`${'='.repeat(60)}`);
    console.log(`📊 Statistics:`);
    console.log(`   Total dependencies processed: ${stats.totalProcessed}`);
    console.log(`   Repository URLs found and matched: ${stats.repoUrlsFound}`);
    console.log(`   Licenses fetched from PyPI: ${stats.pypiLicensesFetched}`);
    console.log(`   Total licenses updated: ${stats.licensesUpdated}`);
    console.log(`\n🔄 Please refresh the page to see updated license counts`);
    console.log(`${'='.repeat(60)}\n`);
})();

