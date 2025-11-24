/**
 * Comprehensive License Fix Script
 * 
 * This script fixes three issues in existing IndexedDB data:
 * 1. Resolves "unknown" versions to latest version
 * 2. Fetches licenses for resolved versions
 * 3. Adds repository license fallback for unlicensed dependencies
 * 
 * Usage: Run this once after updating the code, before doing a new scan
 */

(async function comprehensiveLicenseFix() {
    console.log('🔧 Starting comprehensive license fix...');
    console.log('   This will fix existing data in IndexedDB');
    console.log('   Phase 1: Resolve unknown versions');
    console.log('   Phase 2: Fetch licenses for resolved versions');
    console.log('   Phase 3: Apply repository license fallback');
    console.log('');
    
    const storageManager = new StorageManager();
    await storageManager.init();
    
    // Initialize version resolver
    const resolver = new DependencyTreeResolver();
    
    // Get all stored analyses
    const entries = await storageManager.indexedDB.getAllEntries();
    console.log(`📦 Found ${entries.length} analyses to process\n`);
    
    let stats = {
        totalDeps: 0,
        unknownVersions: 0,
        versionsResolved: 0,
        licensesFetched: 0,
        repoLicenseApplied: 0,
        stillUnlicensed: 0
    };
    
    for (const entry of entries) {
        if (!entry.data || !entry.data.allDependencies) {
            console.log(`⏭️  Skipping ${entry.name} - missing dependencies\n`);
            continue;
        }
        
        console.log(`${'='.repeat(60)}`);
        console.log(`📝 Processing: ${entry.name}`);
        console.log(`${'='.repeat(60)}`);
        
        const allDeps = entry.data.allDependencies;
        stats.totalDeps += allDeps.length;
        
        // Build repository license map for Phase 3
        const repoLicenseMap = new Map();
        if (entry.data.allRepositories) {
            entry.data.allRepositories.forEach(repo => {
                const repoKey = `${repo.owner}/${repo.name}`;
                const repoLicense = repo.license || repo.repositoryLicense || null;
                if (repoLicense && repoLicense !== 'NOASSERTION' && repoLicense.trim() !== '') {
                    repoLicenseMap.set(repoKey, repoLicense);
                }
            });
            console.log(`📚 Found ${repoLicenseMap.size} repositories with licenses`);
        }
        
        // ===================================================================
        // PHASE 1 & 2: Resolve unknown versions and fetch licenses
        // ===================================================================
        console.log(`\n🔍 Phase 1 & 2: Resolving unknown versions and fetching licenses...`);
        
        const unknownVersionDeps = allDeps.filter(dep => 
            !dep.version || 
            dep.version === 'version unknown' || 
            dep.version === 'unknown' ||
            dep.version.trim() === ''
        );
        
        if (unknownVersionDeps.length > 0) {
            console.log(`   Found ${unknownVersionDeps.length} dependencies with unknown versions`);
            stats.unknownVersions += unknownVersionDeps.length;
            
            // Process in batches
            const batchSize = 10;
            for (let i = 0; i < unknownVersionDeps.length; i += batchSize) {
                const batch = unknownVersionDeps.slice(i, i + batchSize);
                
                await Promise.all(batch.map(async (dep) => {
                    const ecosystem = dep.category?.ecosystem?.toLowerCase() || dep.ecosystem?.toLowerCase();
                    if (!ecosystem || !dep.name) return;
                    
                    try {
                        // Resolve version
                        const latestVersion = await resolver.fetchLatestVersion(dep.name, ecosystem);
                        
                        if (latestVersion) {
                            console.log(`   ✅ ${dep.name}: unknown → v${latestVersion}`);
                            dep.version = latestVersion;
                            dep.displayVersion = latestVersion;
                            dep.assumedVersion = latestVersion;
                            stats.versionsResolved++;
                            
                            // Fetch license for resolved version
                            let systemName = ecosystem;
                            if (ecosystem === 'nodejs' || ecosystem === 'node') systemName = 'npm';
                            else if (ecosystem === 'python') systemName = 'pypi';
                            else if (ecosystem === 'ruby' || ecosystem === 'gem') systemName = 'rubygems';
                            else if (ecosystem === 'rust') systemName = 'cargo';
                            else if (ecosystem === 'go' || ecosystem === 'golang') {
                                // Skip Go - will use repository license in Phase 3
                                return;
                            }
                            
                            try {
                                const url = `https://api.deps.dev/v3alpha/systems/${systemName}/packages/${encodeURIComponent(dep.name)}/versions/${encodeURIComponent(latestVersion)}`;
                                const response = await fetch(url);
                                
                                if (response.ok) {
                                    const data = await response.json();
                                    if (data.licenses && data.licenses.length > 0) {
                                        const licenseFull = data.licenses.join(' AND ');
                                        let licenseShort = licenseFull.startsWith('Apache') ? 'Apache' :
                                            (licenseFull.length > 8 ? licenseFull.substring(0, 8) + '...' : licenseFull);
                                        
                                        dep.license = licenseShort;
                                        dep.licenseFull = licenseFull;
                                        dep._licenseEnriched = true;
                                        stats.licensesFetched++;
                                        console.log(`      📄 License: ${licenseFull}`);
                                    }
                                }
                            } catch (e) {
                                // Silent fail for license fetch
                            }
                        }
                    } catch (error) {
                        // Silent fail for version resolution
                    }
                }));
                
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        } else {
            console.log(`   ✅ No unknown versions found`);
        }
        
        // ===================================================================
        // PHASE 3: Apply repository license fallback
        // ===================================================================
        console.log(`\n🏢 Phase 3: Applying repository license fallback...`);
        
        let repoLicenseCount = 0;
        allDeps.forEach(dep => {
            // Check if dependency needs license
            const needsLicense = !dep.license || 
                                 dep.license === 'Unknown' || 
                                 !dep.licenseFull || 
                                 dep.licenseFull === 'Unknown';
            
            if (needsLicense) {
                // Try to get repository license
                if (dep.repositories && dep.repositories.length > 0) {
                    const firstRepo = dep.repositories[0];
                    const repoLicense = repoLicenseMap.get(firstRepo);
                    
                    if (repoLicense) {
                        dep.repositoryLicense = repoLicense;
                        
                        // Also update license fields if they're Unknown
                        if (!dep.licenseFull || dep.licenseFull === 'Unknown') {
                            dep.licenseFull = repoLicense;
                            dep.license = repoLicense.startsWith('Apache') ? 'Apache' :
                                (repoLicense.length > 8 ? repoLicense.substring(0, 8) + '...' : repoLicense);
                        }
                        
                        repoLicenseCount++;
                        stats.repoLicenseApplied++;
                    }
                } else if (!dep.repositoryLicense) {
                    // No repositories - can't apply fallback
                    dep.repositoryLicense = null;
                }
            } else {
                // Has license - still add repositoryLicense field for consistency
                if (!dep.repositoryLicense && dep.repositories && dep.repositories.length > 0) {
                    const firstRepo = dep.repositories[0];
                    const repoLicense = repoLicenseMap.get(firstRepo);
                    if (repoLicense) {
                        dep.repositoryLicense = repoLicense;
                    }
                }
            }
        });
        
        console.log(`   ✅ Applied repository license to ${repoLicenseCount} dependencies`);
        
        // Count still unlicensed
        const stillUnlicensed = allDeps.filter(dep => 
            !dep.licenseFull || 
            dep.licenseFull === 'Unknown' || 
            dep.licenseFull === 'NOASSERTION'
        ).length;
        stats.stillUnlicensed += stillUnlicensed;
        console.log(`   ℹ️  Still unlicensed: ${stillUnlicensed}`);
        
        // ===================================================================
        // SAVE CHANGES
        // ===================================================================
        console.log(`\n💾 Saving changes to IndexedDB...`);
        const saveSuccess = await storageManager.saveAnalysisData(entry.name, entry.data);
        if (saveSuccess) {
            console.log(`✅ Successfully saved ${entry.name}\n`);
        } else {
            console.warn(`⚠️  Failed to save ${entry.name}\n`);
        }
    }
    
    // ===================================================================
    // FINAL SUMMARY
    // ===================================================================
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ COMPREHENSIVE LICENSE FIX COMPLETE!`);
    console.log(`${'='.repeat(60)}`);
    console.log(`📊 Statistics:`);
    console.log(`   Total dependencies processed: ${stats.totalDeps}`);
    console.log(`   Unknown versions found: ${stats.unknownVersions}`);
    console.log(`   Versions resolved: ${stats.versionsResolved}`);
    console.log(`   Licenses fetched (deps.dev): ${stats.licensesFetched}`);
    console.log(`   Repository licenses applied: ${stats.repoLicenseApplied}`);
    console.log(`   Still unlicensed: ${stats.stillUnlicensed}`);
    console.log(`\n   Success rate: ${Math.round((1 - stats.stillUnlicensed / stats.totalDeps) * 100)}% licensed`);
    console.log(`\n🔄 Please refresh the page to see updated license counts`);
    console.log(`${'='.repeat(60)}\n`);
})();

