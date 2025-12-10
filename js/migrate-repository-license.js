/**
 * One-time migration script to add repositoryLicense field to existing dependencies
 * This patches existing data in IndexedDB without requiring a full re-scan
 */

(async function migrateRepositoryLicense() {
    console.log('🔧 Starting repository license migration...');
    
    const storageManager = new StorageManager();
    await storageManager.init();
    
    // Get all stored analyses
    const entries = await storageManager.indexedDB.getAllEntries();
    console.log(`📦 Found ${entries.length} analyses to migrate`);
    
    let totalUpdated = 0;
    let totalDeps = 0;
    
    for (const entry of entries) {
        if (!entry.data || !entry.data.allDependencies || !entry.data.allRepositories) {
            console.log(`⏭️  Skipping ${entry.name} - missing data`);
            continue;
        }
        
        console.log(`\n📝 Processing ${entry.name}...`);
        
        // Build repository license map
        const repoLicenseMap = new Map();
        entry.data.allRepositories.forEach(repo => {
            const repoKey = `${repo.owner}/${repo.name}`;
            const repoLicense = repo.license || repo.repositoryLicense || null;
            if (repoLicense && repoLicense !== 'NOASSERTION') {
                repoLicenseMap.set(repoKey, repoLicense);
            }
        });
        
        console.log(`   📚 Found ${repoLicenseMap.size} repositories with licenses`);
        
        // Update dependencies
        let updated = 0;
        entry.data.allDependencies.forEach(dep => {
            totalDeps++;
            
            // Skip if already has repositoryLicense
            if (dep.repositoryLicense) {
                return;
            }
            
            // Get license from first repository
            if (dep.repositories && dep.repositories.length > 0) {
                const firstRepo = dep.repositories[0];
                const repoLicense = repoLicenseMap.get(firstRepo);
                
                if (repoLicense) {
                    dep.repositoryLicense = repoLicense;
                    updated++;
                    totalUpdated++;
                }
            }
        });
        
        if (updated > 0) {
            console.log(`   ✅ Updated ${updated} dependencies with repository licenses`);
            
            // Save back to IndexedDB
            const saveSuccess = await storageManager.saveAnalysisData(entry.name, entry.data);
            if (saveSuccess) {
                console.log(`   💾 Saved ${entry.name} to IndexedDB`);
            } else {
                console.warn(`   ⚠️  Failed to save ${entry.name}`);
            }
        } else {
            console.log(`   ℹ️  No updates needed for ${entry.name}`);
        }
    }
    
    console.log(`\n✅ Migration complete!`);
    console.log(`   Total dependencies processed: ${totalDeps}`);
    console.log(`   Dependencies updated: ${totalUpdated}`);
    console.log(`\n🔄 Please refresh the page to see updated license counts`);
})();

