/**
 * License Re-fetch Module
 * Provides functionality to manually re-fetch missing licenses for existing analysis data
 */

document.addEventListener('DOMContentLoaded', async () => {
    const refetchBtn = document.getElementById('refetchLicensesBtn');
    const checkBtn = document.getElementById('checkUnknownLicensesBtn');
    const statusDiv = document.getElementById('licenseRefetchStatus');
    const progressDiv = document.getElementById('licenseRefetchProgress');
    const progressBar = document.getElementById('licenseRefetchProgressBar');
    const progressText = document.getElementById('licenseRefetchProgressText');
    const detailsText = document.getElementById('licenseRefetchDetails');
    
    // Only run if we're on the settings page with these elements
    if (!refetchBtn || !checkBtn) {
        return;
    }
    
    // Initialize storage manager
    const storageManager = new window.StorageManager();
    await storageManager.init();
    
    /**
     * Check and display count of dependencies with unknown licenses
     */
    async function checkUnknownLicenses() {
        try {
            checkBtn.disabled = true;
            checkBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Checking...';
            
            const combinedData = await storageManager.getCombinedData();
            if (!combinedData || !combinedData.data || !combinedData.data.allDependencies) {
                statusDiv.innerHTML = '<div class="alert alert-warning"><i class="fas fa-exclamation-triangle me-2"></i>No analysis data found. Please run an analysis first.</div>';
                return;
            }
            
            const data = combinedData.data;
            const unknownByEcosystem = {};
            let totalUnknown = 0;
            
            data.allDependencies.forEach(dep => {
                const hasUnknownLicense = !dep.licenseFull || 
                                        dep.licenseFull === 'Unknown' || 
                                        dep.licenseFull === 'NOASSERTION' ||
                                        dep.license === 'Unknown' ||
                                        dep.license === 'NOASSERTION';
                
                if (hasUnknownLicense && dep.name && dep.version && dep.version !== 'version unknown') {
                    const ecosystem = (dep.ecosystem || dep.category?.ecosystem || 'Unknown').toLowerCase();
                    unknownByEcosystem[ecosystem] = (unknownByEcosystem[ecosystem] || 0) + 1;
                    totalUnknown++;
                }
            });
            
            if (totalUnknown === 0) {
                statusDiv.innerHTML = '<div class="alert alert-success"><i class="fas fa-check-circle me-2"></i>All dependencies have licenses! No re-fetch needed.</div>';
            } else {
                let html = `<div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    <strong>Found ${totalUnknown} dependencies with unknown licenses:</strong>
                    <ul class="mb-0 mt-2">`;
                
                for (const [eco, count] of Object.entries(unknownByEcosystem).sort((a, b) => b[1] - a[1])) {
                    html += `<li><strong>${eco}:</strong> ${count} packages</li>`;
                }
                
                html += `</ul></div>`;
                statusDiv.innerHTML = html;
            }
        } catch (error) {
            console.error('Error checking unknown licenses:', error);
            statusDiv.innerHTML = `<div class="alert alert-danger"><i class="fas fa-times-circle me-2"></i>Error: ${error.message}</div>`;
        } finally {
            checkBtn.disabled = false;
            checkBtn.innerHTML = '<i class="fas fa-search me-2"></i>Check Unknown License Count';
        }
    }
    
    /**
     * Re-fetch missing licenses from various package registries
     */
    async function refetchMissingLicenses() {
        try {
            refetchBtn.disabled = true;
            checkBtn.disabled = true;
            refetchBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Re-fetching...';
            progressDiv.classList.remove('d-none');
            
            // Load data
            const combinedData = await storageManager.getCombinedData();
            if (!combinedData || !combinedData.data || !combinedData.data.allDependencies) {
                throw new Error('No analysis data found. Please run an analysis first.');
            }
            
            const data = combinedData.data;
            
            // Filter dependencies needing licenses
            const needsLicense = data.allDependencies.filter(dep => {
                const hasUnknownLicense = !dep.licenseFull || 
                                        dep.licenseFull === 'Unknown' || 
                                        dep.licenseFull === 'NOASSERTION' ||
                                        dep.license === 'Unknown' ||
                                        dep.license === 'NOASSERTION';
                return hasUnknownLicense && dep.name && dep.version && dep.version !== 'version unknown';
            });
            
            if (needsLicense.length === 0) {
                statusDiv.innerHTML = '<div class="alert alert-success"><i class="fas fa-check-circle me-2"></i>All dependencies already have licenses!</div>';
                progressDiv.classList.add('d-none');
                return;
            }
            
            statusDiv.innerHTML = `<div class="alert alert-info"><i class="fas fa-info-circle me-2"></i>Re-fetching licenses for ${needsLicense.length} dependencies...</div>`;
            
            // Group by ecosystem
            const byEcosystem = {};
            needsLicense.forEach(dep => {
                const ecosystem = (dep.ecosystem || dep.category?.ecosystem || 'unknown').toLowerCase();
                if (!byEcosystem[ecosystem]) byEcosystem[ecosystem] = [];
                byEcosystem[ecosystem].push(dep);
            });
            
            console.log('📄 Starting license re-fetch for:', byEcosystem);
            
            let totalFetched = 0;
            let totalProcessed = 0;
            const totalToProcess = needsLicense.length;
            
            // Create temporary app instance for license fetching
            const tempApp = new window.SBOMPlayApp();
            
            // Update progress
            const updateProgress = (processed, total, ecosystem, fetched) => {
                const percent = Math.round((processed / total) * 100);
                progressBar.style.width = `${percent}%`;
                progressText.textContent = `${percent}%`;
                detailsText.textContent = `Processing ${ecosystem}: ${processed}/${total} packages (${fetched} licenses fetched)`;
            };
            
            // First, resolve unknown versions for all dependencies
            console.log('🔍 Resolving unknown versions...');
            detailsText.textContent = 'Resolving unknown versions...';
            const resolver = new window.DependencyTreeResolver();
            let versionsResolved = 0;
            
            for (const dep of needsLicense) {
                if (!dep.version || dep.version === 'unknown' || dep.version === 'version unknown') {
                    const ecosystem = dep.ecosystem?.toLowerCase();
                    if (ecosystem && ecosystem !== 'unknown' && ecosystem !== 'github actions') {
                        try {
                            const latestVersion = await resolver.fetchLatestVersion(dep.name, ecosystem);
                            if (latestVersion) {
                                dep.version = latestVersion;
                                dep.displayVersion = latestVersion;
                                dep.assumedVersion = latestVersion;
                                versionsResolved++;
                                console.log(`   ✅ Resolved ${dep.ecosystem}:${dep.name} → ${latestVersion}`);
                            }
                        } catch (error) {
                            console.log(`   ⚠️  Failed to resolve ${dep.ecosystem}:${dep.name}: ${error.message}`);
                        }
                    }
                }
            }
            
            console.log(`✅ Resolved ${versionsResolved} unknown versions`);
            detailsText.textContent = `Resolved ${versionsResolved} unknown versions. Fetching licenses...`;
            
            // Fetch PyPI licenses
            if (byEcosystem.pypi) {
                console.log(`📄 Fetching ${byEcosystem.pypi.length} PyPI licenses...`);
                await tempApp.fetchPyPILicenses(byEcosystem.pypi, 'manual-refetch');
                const fetched = byEcosystem.pypi.filter(d => d._licenseEnriched).length;
                totalFetched += fetched;
                totalProcessed += byEcosystem.pypi.length;
                updateProgress(totalProcessed, totalToProcess, 'PyPI', totalFetched);
            }
            
            // Fetch Go licenses
            if (byEcosystem.go || byEcosystem.golang) {
                const goDeps = [...(byEcosystem.go || []), ...(byEcosystem.golang || [])];
                console.log(`📄 Fetching ${goDeps.length} Go licenses...`);
                await tempApp.fetchGoLicenses(goDeps, 'manual-refetch');
                const fetched = goDeps.filter(d => d._licenseEnriched).length;
                totalFetched += fetched;
                totalProcessed += goDeps.length;
                updateProgress(totalProcessed, totalToProcess, 'Go', totalFetched);
            }
            
            // Fetch other ecosystem licenses (npm, maven, cargo, etc.)
            const otherEcosystems = Object.keys(byEcosystem).filter(e => 
                e !== 'pypi' && e !== 'go' && e !== 'golang' && e !== 'github actions' && e !== 'unknown'
            );
            
            if (otherEcosystems.length > 0) {
                const otherDeps = otherEcosystems.flatMap(e => byEcosystem[e]);
                console.log(`📄 Fetching ${otherDeps.length} licenses for other ecosystems (${otherEcosystems.join(', ')})...`);
                await tempApp.fetchLicensesForAllEcosystems(otherDeps, 'manual-refetch');
                const fetched = otherDeps.filter(d => d._licenseEnriched).length;
                totalFetched += fetched;
                totalProcessed += otherDeps.length;
                updateProgress(totalProcessed, totalToProcess, otherEcosystems.join(', '), totalFetched);
            }
            
            // Save updated data back to IndexedDB
            console.log(`💾 Saving ${totalFetched} updated licenses to IndexedDB...`);
            detailsText.textContent = 'Saving updated licenses to database...';
            
            // Create a map of fetched licenses (packageKey -> {license, licenseFull})
            const licenseMap = new Map();
            needsLicense.forEach(dep => {
                if (dep._licenseEnriched) {
                    const key = `${dep.name}@${dep.version || dep.displayVersion}`;
                    licenseMap.set(key, {
                        license: dep.license,
                        licenseFull: dep.licenseFull
                    });
                }
            });
            
            console.log(`📝 Updating ${licenseMap.size} licenses in original data...`);
            
            // Get all entries and update dependencies with fetched licenses
            const entries = await storageManager.indexedDB.getAllEntries();
            for (const entry of entries) {
                if (entry.data && entry.data.allDependencies) {
                    let updated = 0;
                    // Update each dependency if we have a fetched license for it
                    entry.data.allDependencies.forEach(dep => {
                        const key = `${dep.name}@${dep.version || dep.displayVersion}`;
                        if (licenseMap.has(key)) {
                            const licenseInfo = licenseMap.get(key);
                            dep.license = licenseInfo.license;
                            dep.licenseFull = licenseInfo.licenseFull;
                            dep._licenseEnriched = true;
                            
                            // Also update originalPackage if it exists
                            if (dep.originalPackage) {
                                dep.originalPackage.licenseConcluded = licenseInfo.licenseFull;
                                dep.originalPackage.licenseDeclared = licenseInfo.licenseFull;
                            }
                            updated++;
                        }
                    });
                    
                    if (updated > 0) {
                        console.log(`   Updating ${entry.name}: ${updated} licenses updated`);
                        await storageManager.saveAnalysisData(entry.name, entry.data);
                    }
                }
            }
            
            progressBar.classList.remove('progress-bar-animated');
            progressBar.classList.add('bg-success');
            progressText.textContent = '100%';
            
            statusDiv.innerHTML = `<div class="alert alert-success">
                <i class="fas fa-check-circle me-2"></i>
                <strong>License re-fetch complete!</strong>
                <ul class="mb-0 mt-2">
                    <li>Processed: ${totalProcessed} dependencies</li>
                    <li>Fetched: ${totalFetched} new licenses</li>
                    <li>Remaining unknown: ${needsLicense.length - totalFetched}</li>
                </ul>
                <p class="mb-0 mt-2"><small>Please refresh your browser to see the updated licenses in other pages.</small></p>
            </div>`;
            
            detailsText.textContent = `Successfully fetched ${totalFetched} licenses out of ${needsLicense.length} unknown dependencies`;
            
            console.log(`✅ License re-fetch complete: ${totalFetched}/${needsLicense.length} licenses fetched`);
            
        } catch (error) {
            console.error('Error re-fetching licenses:', error);
            statusDiv.innerHTML = `<div class="alert alert-danger"><i class="fas fa-times-circle me-2"></i>Error: ${error.message}</div>`;
            progressBar.classList.remove('progress-bar-animated');
            progressBar.classList.add('bg-danger');
        } finally {
            refetchBtn.disabled = false;
            checkBtn.disabled = false;
            refetchBtn.innerHTML = '<i class="fas fa-sync-alt me-2"></i>Re-fetch Missing Licenses';
        }
    }
    
    // Attach event listeners
    checkBtn.addEventListener('click', checkUnknownLicenses);
    refetchBtn.addEventListener('click', refetchMissingLicenses);
});

