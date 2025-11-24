/**
 * JavaScript for repos.html page
 * Handles repository listing page initialization and data loading
 * Converted from ES6 module to regular script for file:// compatibility
 */

document.addEventListener('DOMContentLoaded', async function() {
    const storageManager = new StorageManager();
    await storageManager.init();
    
    let allRepositories = [];
    let filteredRepositories = [];
    let currentPage = 1;
    let pageSize = parseInt(localStorage.getItem('reposPageSize') || '25', 10);
    let currentData = null;
    let sortColumn = 'name';
    let sortDirection = 'asc';
    
    // Sanitize search input to prevent injection attacks
    function sanitizeSearchInput(input) {
        if (!input || typeof input !== 'string') return '';
        // Remove any potentially dangerous characters, limit length
        return input
            .trim()
            .substring(0, 200) // Limit length
            .replace(/[<>\"'&]/g, ''); // Remove HTML/script injection chars
    }
    
    // Function to update pagination controls
    function updatePaginationControls(totalItems, totalPages) {
        const paginationInfo = document.getElementById('paginationInfo');
        const prevBtn = document.getElementById('prevPageBtn');
        const nextBtn = document.getElementById('nextPageBtn');
        
        if (!paginationInfo || !prevBtn || !nextBtn) return;
        
        const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
        const endItem = Math.min(currentPage * pageSize, totalItems);
        
        paginationInfo.textContent = `Showing ${startItem}-${endItem} of ${totalItems}`;
        
        // Update Previous button
        if (currentPage > 1) {
            prevBtn.classList.remove('disabled');
            prevBtn.querySelector('a').removeAttribute('tabindex');
        } else {
            prevBtn.classList.add('disabled');
            prevBtn.querySelector('a').setAttribute('tabindex', '-1');
        }
        
        // Update Next button
        if (currentPage < totalPages && totalPages > 0) {
            nextBtn.classList.remove('disabled');
        } else {
            nextBtn.classList.add('disabled');
        }
    }
    
    // Check for URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const orgParam = urlParams.get('org');
    const searchParam = urlParams.get('search');
    
    await loadAnalysesList();
    
    async function loadAnalysesList() {
        try {
            console.log('📋 Loading analyses list for repos page...');
            
            // Ensure storage manager is initialized
            if (!storageManager.initialized) {
                await storageManager.init();
            }
            
            const storageInfo = await storageManager.getStorageInfo();
            console.log(`📋 Storage info retrieved: ${storageInfo.organizations.length} orgs, ${storageInfo.repositories.length} repos`);
            
            const selector = document.getElementById('analysisSelector');
            if (!selector) {
                console.error('❌ Analysis selector not found');
                return;
            }
            
            const allEntries = [...storageInfo.organizations, ...storageInfo.repositories];
            console.log(`📋 Total entries to add: ${allEntries.length}`);
            
            selector.innerHTML = '';
            
            if (allEntries.length === 0) {
                console.warn('⚠️ No entries found in storage');
                const noDataMessage = document.getElementById('noDataMessage');
                if (noDataMessage) {
                    noDataMessage.classList.remove('d-none');
                }
                selector.disabled = true;
                return;
            }
            
            // Filter out __ALL__ entries (legacy from previous implementation)
            const filteredEntries = allEntries.filter(entry => entry.name !== '__ALL__');
            
            // Add "All Analyses" placeholder option (aggregated data)
            const allOption = document.createElement('option');
            allOption.value = '';
            const totalRepos = filteredEntries.reduce((sum, entry) => sum + (entry.repositories || 0), 0);
            allOption.textContent = `All Analyses (${totalRepos} repos)`;
            selector.appendChild(allOption);
            console.log(`📋 Added "All Analyses" placeholder option`);
            
            // Add individual entries (excluding __ALL__)
            filteredEntries.forEach(entry => {
                const option = document.createElement('option');
                option.value = entry.name;
                const repoCount = entry.repositories || 0;
                option.textContent = `${entry.name} (${repoCount} repos)`;
                selector.appendChild(option);
                console.log(`📋 Added option: ${entry.name} (${repoCount} repos)`);
            });
            
            // Set default based on URL parameter or default to aggregated view (empty value)
            if (filteredEntries.length > 0) {
                if (orgParam) {
                    const orgExists = filteredEntries.some(entry => entry.name === orgParam);
                    if (orgExists) {
                        selector.value = orgParam;
                        console.log(`📋 Set selector to URL parameter: ${orgParam}`);
                    } else {
                        selector.value = '';
                        console.log(`📋 URL parameter ${orgParam} not found, using aggregated view`);
                    }
                } else {
                    selector.value = '';
                    console.log(`📋 No URL parameter, using aggregated view`);
                }
                selector.disabled = false;
                console.log(`✅ Analysis selector populated with ${filteredEntries.length} entries`);
                await loadAnalysis();
            }
        } catch (error) {
            console.error('❌ Error loading analyses list:', error);
            console.error('   Error details:', error.stack);
            const selector = document.getElementById('analysisSelector');
            if (selector) {
                selector.disabled = true;
            }
            const noDataMessage = document.getElementById('noDataMessage');
            if (noDataMessage) {
                noDataMessage.classList.remove('d-none');
            }
        }
    }
    
    // Page size selector
    const pageSizeSelect = document.getElementById('pageSizeSelect');
    if (pageSizeSelect) {
        pageSizeSelect.value = pageSize.toString();
        pageSizeSelect.addEventListener('change', (e) => {
            pageSize = parseInt(e.target.value, 10);
            localStorage.setItem('reposPageSize', pageSize.toString());
            currentPage = 1;
            filterTable();
        });
    }
    
    // Pagination controls
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    
    if (prevPageBtn) {
        prevPageBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (currentPage > 1) {
                currentPage--;
                renderTable(filteredRepositories);
            }
        });
    }
    
    if (nextPageBtn) {
        nextPageBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const totalPages = Math.ceil(filteredRepositories.length / pageSize);
            if (currentPage < totalPages) {
                currentPage++;
                renderTable(filteredRepositories);
            }
        });
    }
    
    document.getElementById('analysisSelector').addEventListener('change', () => {
        loadAnalysis().then(() => filterTable());
    });
    document.getElementById('searchInput').addEventListener('input', () => filterTable());
    document.getElementById('exportBtn').addEventListener('click', exportCSV);
    
    // Sort handlers
    document.querySelectorAll('.sortable').forEach(header => {
        header.addEventListener('click', () => {
            const column = header.getAttribute('data-sort');
            if (sortColumn === column) {
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                sortColumn = column;
                sortDirection = 'asc';
            }
            updateSortIcons();
            filterTable();
        });
    });
    
    function updateSortIcons() {
        document.querySelectorAll('.sort-icon').forEach(icon => {
            icon.className = 'fas fa-sort sort-icon';
        });
        const activeHeader = document.querySelector(`[data-sort="${sortColumn}"]`);
        if (activeHeader) {
            const icon = activeHeader.querySelector('.sort-icon');
            icon.className = `fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} sort-icon active`;
        }
    }
    
    async function loadAnalysis() {
        const analysisName = document.getElementById('analysisSelector').value;
        // Note: analysisName can be empty string '' for aggregated view - don't skip loading!
        
        // Show loading indicator
        const loadingOverlay = document.getElementById('loadingOverlay');
        const tableCard = document.getElementById('tableCard');
        const statsRow = document.getElementById('statsRow');
        const noDataMessage = document.getElementById('noDataMessage');
        
        loadingOverlay.classList.remove('d-none');
        tableCard.classList.remove('d-none');
        statsRow.classList.remove('d-none');
        noDataMessage.classList.add('d-none');
        
        let data;
        
        // Handle aggregated view (empty/null analysisName)
        if (!analysisName || analysisName === '') {
            data = await storageManager.getCombinedData();
        } else {
            data = await storageManager.loadAnalysisDataForOrganization(analysisName);
        }
        
        if (!data || !data.data) {
            alert('No data found');
            document.getElementById('loadingOverlay').classList.add('d-none');
            return;
        }
        
        currentData = data.data;
        allRepositories = processData(currentData);
        
        // Set search input from URL parameter if present
        if (searchParam) {
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.value = decodeURIComponent(searchParam);
            }
        }
        
        // Hide loading indicator
        document.getElementById('loadingOverlay').classList.add('d-none');
        
        await filterTable();
    }
    
    function processData(data) {
        const repos = [];
        const allRepos = data.allRepositories || [];
        const vulnAnalysis = data.vulnerabilityAnalysis || {};
        const vulnerableDeps = vulnAnalysis.vulnerableDependencies || [];
        const authorAnalysis = data.authorAnalysis || {};
        const authorRefs = authorAnalysis.authors || [];
        
        // Create maps for quick lookups
        const vulnMap = new Map();
        vulnerableDeps.forEach(vulnDep => {
            const key = `${vulnDep.name}@${vulnDep.version}`;
            vulnMap.set(key, vulnDep);
        });
        
        // Map dependencies to repositories
        const depRepoMap = new Map(); // repo -> Set of dep keys
        const allDeps = data.allDependencies || [];
        allDeps.forEach(dep => {
            const depKey = `${dep.name}@${dep.version}`;
            (dep.repositories || []).forEach(repo => {
                if (!depRepoMap.has(repo)) {
                    depRepoMap.set(repo, new Set());
                }
                depRepoMap.get(repo).add(depKey);
            });
        });
        
        // Map authors to repositories
        const authorRepoMap = new Map(); // repo -> Set of author keys
        const isNewFormat = authorAnalysis._cacheVersion === 3 || 
                           (authorRefs.length > 0 && authorRefs[0].authorKey);
        
        if (isNewFormat) {
            // New format: Use both packageRepositories and repositories array
            authorRefs.forEach(ref => {
                const authorKey = ref.authorKey || `${ref.ecosystem}:${ref.author}`;
                
                // First, use packageRepositories if available
                if (ref.packageRepositories) {
                    Object.keys(ref.packageRepositories).forEach(pkg => {
                        (ref.packageRepositories[pkg] || []).forEach(repo => {
                            if (!authorRepoMap.has(repo)) {
                                authorRepoMap.set(repo, new Set());
                            }
                            authorRepoMap.get(repo).add(authorKey);
                        });
                    });
                }
                
                // Also use repositories array as fallback/supplement
                if (ref.repositories && Array.isArray(ref.repositories)) {
                    ref.repositories.forEach(repo => {
                        if (!authorRepoMap.has(repo)) {
                            authorRepoMap.set(repo, new Set());
                        }
                        authorRepoMap.get(repo).add(authorKey);
                    });
                }
            });
        } else {
            // Old format: Use repositories array directly from author objects
            authorRefs.forEach(author => {
                (author.repositories || []).forEach(repo => {
                    if (!authorRepoMap.has(repo)) {
                        authorRepoMap.set(repo, new Set());
                    }
                    authorRepoMap.get(repo).add(`${author.ecosystem}:${author.author}`);
                });
            });
        }
        
        allRepos.forEach(repo => {
            const repoKey = `${repo.owner}/${repo.name}`;
            
            // Get SBOM quality
            const quality = repo.qualityAssessment || null;
            const sbomStatus = quality ? 'Available' : 'Not Available';
            const sbomGrade = quality ? quality.grade : 'N/A';
            const sbomScore = quality ? quality.displayScore : null;
            
            // Get repository license
            const repoLicense = repo.license || null;
            
            // Get archived status
            const isArchived = repo.archived || false;
            
            // Count vulnerabilities for this repository
            const repoDepKeys = depRepoMap.get(repoKey) || new Set();
            let vulnHigh = 0, vulnMedium = 0, vulnLow = 0;
            
            repoDepKeys.forEach(depKey => {
                const vulnDep = vulnMap.get(depKey);
                if (vulnDep && vulnDep.vulnerabilities) {
                    vulnDep.vulnerabilities.forEach(vuln => {
                        const severity = vuln.severity || (window.osvService ? window.osvService.getHighestSeverity(vuln) : 'UNKNOWN');
                        if (severity === 'CRITICAL' || severity === 'HIGH') {
                            vulnHigh++;
                        } else if (severity === 'MEDIUM' || severity === 'MODERATE') {
                            vulnMedium++;
                        } else if (severity === 'LOW') {
                            vulnLow++;
                        }
                    });
                }
            });
            
            // Get dependency count
            const depCount = repoDepKeys.size || repo.totalDependencies || 0;
            
            // Get author count
            const authorCount = (authorRepoMap.get(repoKey) || new Set()).size;
            
            repos.push({
                name: repoKey,
                owner: repo.owner,
                repoName: repo.name,
                sbomStatus: sbomStatus,
                sbomGrade: sbomGrade,
                sbomScore: sbomScore,
                quality: quality,
                vulnHigh: vulnHigh,
                vulnMedium: vulnMedium,
                vulnLow: vulnLow,
                vulnCount: vulnHigh + vulnMedium + vulnLow,
                depCount: depCount,
                authorCount: authorCount,
                license: repoLicense,
                archived: isArchived,
                raw: repo
            });
        });
        
        return repos;
    }
    
    async function filterTable() {
        // Early return if no data is loaded
        if (!allRepositories || allRepositories.length === 0) {
            document.getElementById('tableCard').classList.add('d-none');
            document.getElementById('statsRow').classList.add('d-none');
            document.getElementById('noDataMessage').classList.remove('d-none');
            return;
        }
        
        const searchInput = document.getElementById('searchInput').value;
        const search = sanitizeSearchInput(searchInput).toLowerCase();
        
        let filtered = allRepositories;
        
        // Apply search filter
        if (search) {
            filtered = filtered.filter(repo => {
                return repo.name.toLowerCase().includes(search);
            });
        }
        
        // Sort
        filtered.sort((a, b) => {
            let aVal = a[sortColumn];
            let bVal = b[sortColumn];
            
            // Handle special cases
            if (sortColumn === 'sbomGrade') {
                // Sort by grade value (A=4, B=3, C=2, D=1, F=0, N/A=-1)
                const gradeValues = { 'A': 4, 'B': 3, 'C': 2, 'D': 1, 'F': 0, 'N/A': -1 };
                aVal = gradeValues[aVal] ?? -1;
                bVal = gradeValues[bVal] ?? -1;
            } else if (typeof aVal === 'string') {
                aVal = aVal.toLowerCase();
                bVal = bVal.toLowerCase();
            }
            
            // Handle null/undefined values
            if (aVal == null) aVal = '';
            if (bVal == null) bVal = '';
            
            if (sortDirection === 'asc') {
                return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
            } else {
                return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
            }
        });
        
        filteredRepositories = filtered;
        currentPage = 1; // Reset to first page when filtering
        
        updateStats(filtered);
        renderTable(filtered);
    }
    
    function updateStats(filtered) {
        const withSBOM = allRepositories.filter(r => r.sbomStatus === 'Available').length;
        const withVulns = allRepositories.filter(r => r.vulnCount > 0).length;
        
        document.getElementById('statTotal').textContent = allRepositories.length;
        document.getElementById('statWithSBOM').textContent = withSBOM;
        document.getElementById('statVulnerable').textContent = withVulns;
        document.getElementById('statShowing').textContent = filtered.length;
    }
    
    function renderTable(repos) {
        const tbody = document.getElementById('tableBody');
        tbody.innerHTML = '';
        
        // Get current organization context for links
        const currentOrg = document.getElementById('analysisSelector')?.value || '';
        const orgParamForLink = (!currentOrg || currentOrg === '') ? '' : currentOrg;
        
        // Helper function to create links with repo filter
        const createRepoLink = (page, repo) => {
            const params = new URLSearchParams();
            if (orgParamForLink && orgParamForLink !== '') {
                params.set('org', orgParamForLink);
            }
            params.set('repo', repo);
            return `${page}?${params.toString()}`;
        };
        
        // Calculate pagination
        const totalPages = Math.ceil(repos.length / pageSize);
        if (currentPage > totalPages && totalPages > 0) {
            currentPage = totalPages;
        }
        
        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = Math.min(startIndex + pageSize, repos.length);
        const reposToDisplay = repos.slice(startIndex, endIndex);
        
        reposToDisplay.forEach(repo => {
            // Build SBOM Grade cell (combined status and grade, clickable if available)
            const qualityLink = createRepoLink('audit.html', repo.name);
            let sbomGradeCell = '<td>';
            if (repo.sbomGrade && repo.sbomGrade !== 'N/A') {
                const gradeClass = {
                    'A': 'bg-success',
                    'B': 'bg-info',
                    'C': 'bg-warning',
                    'D': 'bg-warning text-dark',
                    'F': 'bg-danger'
                }[repo.sbomGrade] || 'bg-secondary';
                sbomGradeCell += `<a href="${qualityLink}" class="text-decoration-none" title="View quality details">
                    <span class="badge ${gradeClass}">${repo.sbomGrade}</span>`;
                if (repo.sbomScore !== null) {
                    sbomGradeCell += ` <small class="text-muted">(${repo.sbomScore})</small>`;
                }
                sbomGradeCell += '</a>';
            } else {
                sbomGradeCell += '<span class="text-muted">Not Available</span>';
            }
            sbomGradeCell += '</td>';
            
            // Build vulnerability cell (clickable)
            const vulnLink = createRepoLink('vuln.html', repo.name);
            let vulnCell = '<td>';
            if (repo.vulnCount > 0) {
                vulnCell += `<a href="${vulnLink}" class="text-decoration-none">`;
                const vulnParts = [];
                if (repo.vulnHigh > 0) {
                    vulnParts.push(`<span class="badge bg-danger" title="High: ${repo.vulnHigh}">H:${repo.vulnHigh}</span>`);
                }
                if (repo.vulnMedium > 0) {
                    vulnParts.push(`<span class="badge bg-warning text-dark" title="Medium: ${repo.vulnMedium}">M:${repo.vulnMedium}</span>`);
                }
                if (repo.vulnLow > 0) {
                    vulnParts.push(`<span class="badge bg-info" title="Low: ${repo.vulnLow}">L:${repo.vulnLow}</span>`);
                }
                vulnCell += `<span class="d-flex gap-1 flex-wrap">${vulnParts.join(' ')}</span>`;
                vulnCell += '</a>';
            } else {
                vulnCell += `<a href="${vulnLink}" class="text-decoration-none text-muted">—</a>`;
            }
            vulnCell += '</td>';
            
            // Build dependencies cell (clickable)
            const depsLink = createRepoLink('deps.html', repo.name);
            const depsCell = `<td><a href="${depsLink}" class="text-decoration-none"><span class="badge bg-primary">${repo.depCount}</span></a></td>`;
            
            // Build authors cell (clickable)
            const authorsLink = createRepoLink('authors.html', repo.name);
            const authorsCell = `<td><a href="${authorsLink}" class="text-decoration-none"><span class="badge bg-secondary">${repo.authorCount}</span></a></td>`;
            
            // Build repository license cell (clickable)
            const licensesLink = createRepoLink('licenses.html', repo.name);
            let licenseCell = '<td>';
            if (repo.license) {
                licenseCell += `<a href="${licensesLink}" class="text-decoration-none"><span class="badge bg-info">${escapeHtml(repo.license)}</span></a>`;
            } else {
                licenseCell += `<a href="${licensesLink}" class="text-decoration-none text-muted">—</a>`;
            }
            licenseCell += '</td>';
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <strong><a href="https://github.com/${repo.name}" target="_blank" class="text-decoration-none">
                        <i class="fab fa-github me-1"></i>${escapeHtml(repo.name)}
                    </a></strong>
                    ${repo.archived ? '<span class="badge bg-secondary ms-2" title="Archived Repository"><i class="fas fa-archive"></i> Archived</span>' : ''}
                </td>
                ${sbomGradeCell}
                ${vulnCell}
                ${depsCell}
                ${authorsCell}
                ${licenseCell}
            `;
            tbody.appendChild(tr);
        });
        
        // Update pagination controls
        updatePaginationControls(repos.length, totalPages);
    }
    
    function exportCSV() {
        const search = document.getElementById('searchInput').value.toLowerCase();
        
        let filtered = allRepositories.filter(repo => {
            if (search && !repo.name.toLowerCase().includes(search)) return false;
            return true;
        });
        
        const csv = [
            ['Repository', 'SBOM Grade', 'SBOM Score', 'Vulnerabilities (H/M/L)', 'Dependencies', 'Authors', 'Repository License'].join(','),
            ...filtered.map(repo => [
                `"${repo.name}"`,
                repo.sbomGrade,
                repo.sbomScore || 'N/A',
                `"H:${repo.vulnHigh} M:${repo.vulnMedium} L:${repo.vulnLow}"`,
                repo.depCount,
                repo.authorCount,
                repo.license || 'N/A'
            ].join(','))
        ].join('\n');
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `repositories-${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }
});

