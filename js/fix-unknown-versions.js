/**
 * Fix script to resolve unknown versions and fetch licenses
 * This handles dependencies with "version unknown" by:
 * 1. Resolving them to latest version using registry APIs
 * 2. Fetching licenses for the resolved version
 * 3. Updating IndexedDB with the resolved data
 */

(async function fixUnknownVersions() {
    console.log('🔧 Starting unknown version resolution and license fetch...');
    
    const storageManager = new StorageManager();
    await storageManager.init();
    
    // Initialize version resolver
    const resolver = new DependencyTreeResolver();
    
    // Get all stored analyses
    const entries = await storageManager.indexedDB.getAllEntries();
    console.log(`📦 Found ${entries.length} analyses to process`);
    
    let totalUnknown = 0;
    let totalResolved = 0;
    let totalLicensesFetched = 0;
    
    for (const entry of entries) {
        if (!entry.data || !entry.data.allDependencies) {
            console.log(`⏭️  Skipping ${entry.name} - missing dependencies`);
            continue;
        }
        
        console.log(`\n📝 Processing ${entry.name}...`);
        
        // Find dependencies with unknown versions
        const unknownVersionDeps = entry.data.allDependencies.filter(dep => 
            !dep.version || 
            dep.version === 'version unknown' || 
            dep.version === 'unknown' ||
            dep.version.trim() === ''
        );
        
        if (unknownVersionDeps.length === 0) {
            console.log(`   ℹ️  No unknown versions found in ${entry.name}`);
            continue;
        }
        
        console.log(`   🔍 Found ${unknownVersionDeps.length} dependencies with unknown versions`);
        totalUnknown += unknownVersionDeps.length;
        
        // Process in batches to avoid overwhelming APIs
        const batchSize = 10;
        for (let i = 0; i < unknownVersionDeps.length; i += batchSize) {
            const batch = unknownVersionDeps.slice(i, i + batchSize);
            
            await Promise.all(batch.map(async (dep) => {
                const ecosystem = dep.category?.ecosystem?.toLowerCase() || dep.ecosystem?.toLowerCase();
                if (!ecosystem || !dep.name) {
                    return;
                }
                
                try {
                    // Try to fetch latest version
                    console.log(`      🔎 Resolving ${dep.name} (${ecosystem})...`);
                    const latestVersion = await resolver.fetchLatestVersion(dep.name, ecosystem);
                    
                    if (latestVersion) {
                        console.log(`      ✅ Resolved ${dep.name} to v${latestVersion}`);
                        
                        // Update version fields
                        dep.version = latestVersion;
                        dep.displayVersion = latestVersion;
                        dep.assumedVersion = latestVersion;
                        totalResolved++;
                        
                        // Now try to fetch license for the resolved version
                        try {
                            // Normalize ecosystem for deps.dev API
                            let systemName = ecosystem;
                            if (ecosystem === 'nodejs' || ecosystem === 'node') {
                                systemName = 'npm';
                            } else if (ecosystem === 'python') {
                                systemName = 'pypi';
                            } else if (ecosystem === 'ruby' || ecosystem === 'gem') {
                                systemName = 'rubygems';
                            } else if (ecosystem === 'rust') {
                                systemName = 'cargo';
                            } else if (ecosystem === 'go' || ecosystem === 'golang') {
                                // Go doesn't work well with deps.dev, skip
                                console.log(`      ⏭️  Skipping license fetch for Go package (use repository license)`);
                                return;
                            }
                            
                            const url = `https://api.deps.dev/v3alpha/systems/${systemName}/packages/${encodeURIComponent(dep.name)}/versions/${encodeURIComponent(latestVersion)}`;
                            const response = await fetch(url);
                            
                            if (response.ok) {
                                const data = await response.json();
                                
                                if (data.licenses && data.licenses.length > 0) {
                                    const licenseFull = data.licenses.join(' AND ');
                                    let licenseShort = licenseFull;
                                    
                                    // Abbreviate license for display
                                    if (licenseFull.includes(' AND ')) {
                                        const firstLicense = licenseFull.split(' AND ')[0];
                                        licenseShort = firstLicense.startsWith('Apache') ? 'Apache' : 
                                            (firstLicense.length > 8 ? firstLicense.substring(0, 8) + '...' : firstLicense);
                                    } else if (licenseFull.startsWith('Apache')) {
                                        licenseShort = 'Apache';
                                    } else {
                                        licenseShort = licenseFull.length > 8 ? licenseFull.substring(0, 8) + '...' : licenseFull;
                                    }
                                    
                                    dep.license = licenseShort;
                                    dep.licenseFull = licenseFull;
                                    dep._licenseEnriched = true;
                                    totalLicensesFetched++;
                                    
                                    console.log(`      📄 Fetched license: ${licenseFull}`);
                                }
                            }
                        } catch (licenseError) {
                            console.log(`      ⚠️  License fetch failed for ${dep.name}@${latestVersion}: ${licenseError.message}`);
                        }
                    } else {
                        console.log(`      ⚠️  Could not resolve ${dep.name} - no latest version available`);
                    }
                } catch (error) {
                    console.log(`      ❌ Failed to resolve ${dep.name}: ${error.message}`);
                }
            }));
            
            // Small delay between batches
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Save updated data
        if (totalResolved > 0 || totalLicensesFetched > 0) {
            console.log(`   💾 Saving updated data for ${entry.name}...`);
            const saveSuccess = await storageManager.saveAnalysisData(entry.name, entry.data);
            if (saveSuccess) {
                console.log(`   ✅ Saved successfully`);
            } else {
                console.warn(`   ⚠️  Save failed`);
            }
        }
    }
    
    console.log(`\n✅ Fix complete!`);
    console.log(`   Total unknown versions found: ${totalUnknown}`);
    console.log(`   Versions resolved: ${totalResolved}`);
    console.log(`   Licenses fetched: ${totalLicensesFetched}`);
    console.log(`   Could not resolve: ${totalUnknown - totalResolved}`);
    console.log(`\n🔄 Please refresh the page to see updated data`);
})();

