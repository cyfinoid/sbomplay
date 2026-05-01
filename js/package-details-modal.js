/**
 * Package Details Modal - Shared Component
 * 
 * Provides a reusable package details modal that can be used across pages.
 * Shows comprehensive package information including:
 * - Basic info (name, version, ecosystem, license)
 * - Version drift/staleness status
 * - Links (GitHub, package registry)
 * - Repositories where the package is used
 * - Dependency chains (for transitive dependencies)
 * - Authors/maintainers
 * - Sponsorship info
 */

console.log('📦 SBOM Play package-details-modal.js loaded');

/**
 * PackageDetailsModal class - manages the package details modal display
 */
class PackageDetailsModal {
    constructor() {
        this.modalElement = null;
        this.modalInstance = null;
    }

    /**
     * Ensure the modal HTML exists in the DOM
     * @returns {HTMLElement} The modal element
     */
    ensureModalExists() {
        let modal = document.getElementById('packageDetailsModal');
        if (!modal) {
            // Create the modal dynamically if it doesn't exist
            const modalHtml = `
                <div class="modal fade" id="packageDetailsModal" tabindex="-1">
                    <div class="modal-dialog modal-xl">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title" id="packageDetailsModalTitle">Package Details</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body" id="packageDetailsModalBody">
                                <div class="text-center">
                                    <div class="spinner-border text-primary" role="status">
                                        <span class="visually-hidden">Loading...</span>
                                    </div>
                                    <p class="mt-2">Loading package details...</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            modal = document.getElementById('packageDetailsModal');
        }
        return modal;
    }

    /**
     * Show the package details modal
     * @param {Object} options - Options for displaying the modal
     * @param {string} options.packageName - Package name
     * @param {string} options.packageVersion - Package version
     * @param {string} options.ecosystem - Package ecosystem (npm, pypi, etc.)
     * @param {string[]} options.repositories - List of repositories using this package
     * @param {Object} options.depInfo - Full dependency info object (optional)
     * @param {Object} options.analysisData - Current analysis data for building dependency chains (optional)
     * @param {string} options.currentOrg - Current organization context (optional)
     */
    async show(options) {
        const {
            packageName,
            packageVersion,
            ecosystem,
            repositories = [],
            depInfo = null,
            analysisData = null,
            currentOrg = ''
        } = options;

        this.ensureModalExists();
        const modalTitle = document.getElementById('packageDetailsModalTitle');
        const modalBody = document.getElementById('packageDetailsModalBody');
        
        modalTitle.textContent = `${packageName}@${packageVersion || 'unknown'}`;
        modalBody.innerHTML = `
            <div class="text-center">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p class="mt-2">Loading package details...</p>
            </div>
        `;
        
        // Show the modal
        const modalEl = document.getElementById('packageDetailsModal');
        if (!this.modalInstance) {
            this.modalInstance = new bootstrap.Modal(modalEl);
        }
        this.modalInstance.show();
        
        // Build the modal content
        const html = await this.buildModalContent({
            packageName,
            packageVersion,
            ecosystem,
            repositories,
            depInfo,
            analysisData,
            currentOrg
        });
        
        modalBody.innerHTML = html;
        
        // Attach event handlers for any links that should stop propagation
        modalBody.querySelectorAll('[data-stop-propagation]').forEach(el => {
            el.addEventListener('click', e => e.stopPropagation());
        });
    }

    /**
     * Build the modal content HTML
     * @param {Object} options - Same options as show()
     * @returns {string} HTML content for the modal
     */
    async buildModalContent(options) {
        const {
            packageName,
            packageVersion,
            ecosystem,
            repositories,
            depInfo,
            analysisData,
            currentOrg
        } = options;

        const ecosystemLower = (ecosystem || '').toLowerCase();
        
        // Fetch package data from cache
        let packageData = null;
        let authors = [];
        let funding = null;
        let packageKey = null;
        
        // Normalize ecosystem for package key
        let normalizedEcosystem = ecosystemLower;
        if (normalizedEcosystem === 'rubygems' || normalizedEcosystem === 'gem') {
            normalizedEcosystem = 'gem';
        } else if (normalizedEcosystem === 'go' || normalizedEcosystem === 'golang') {
            normalizedEcosystem = 'golang';
        } else if (normalizedEcosystem === 'packagist' || normalizedEcosystem === 'composer') {
            normalizedEcosystem = 'composer';
        } else if (normalizedEcosystem === 'github actions') {
            normalizedEcosystem = 'github actions';
        }
        
        packageKey = `${normalizedEcosystem}:${packageName}`;
        
        if (window.cacheManager) {
            try {
                packageData = await window.cacheManager.getPackage(packageKey);
                if (packageData) {
                    funding = packageData.funding || null;
                }
                authors = await window.cacheManager.getPackageAuthors(packageKey);
            } catch (e) {
                console.warn('Failed to fetch package details from cache:', e);
            }
        }
        
        // Get license info
        const licenseProcessor = window.LicenseProcessor ? new LicenseProcessor() : null;
        let licenseInfo = { license: 'Unknown', category: 'unknown' };
        
        if (depInfo && depInfo.originalPackage && licenseProcessor) {
            licenseInfo = licenseProcessor.parseLicense(depInfo.originalPackage);
        } else if (depInfo && depInfo.license) {
            licenseInfo = { license: depInfo.license, category: 'unknown' };
        }
        
        // Build GitHub repo URL and registry URL
        let githubRepoUrl = null;
        let registryUrl = null;
        
        // For Go packages, the package name often IS the GitHub path
        if (!githubRepoUrl && (ecosystemLower === 'go' || ecosystemLower === 'golang')) {
            if (packageName.startsWith('github.com/')) {
                const parts = packageName.replace('github.com/', '').split('/');
                if (parts.length >= 2) {
                    const owner = parts[0];
                    const repo = parts[1];
                    githubRepoUrl = `https://github.com/${owner}/${repo}`;
                }
            }
        }
        
        // Build package registry URL based on ecosystem
        if (ecosystemLower === 'npm' || ecosystemLower === 'nodejs') {
            registryUrl = `https://www.npmjs.com/package/${encodeURIComponent(packageName)}`;
        } else if (ecosystemLower === 'pypi' || ecosystemLower === 'python') {
            registryUrl = `https://pypi.org/project/${encodeURIComponent(packageName)}/`;
        } else if (ecosystemLower === 'rubygems' || ecosystemLower === 'gem') {
            registryUrl = `https://rubygems.org/gems/${encodeURIComponent(packageName)}`;
        } else if (ecosystemLower === 'cargo' || ecosystemLower === 'rust') {
            registryUrl = `https://crates.io/crates/${encodeURIComponent(packageName)}`;
        } else if (ecosystemLower === 'maven' || ecosystemLower === 'java') {
            const parts = packageName.split(':');
            if (parts.length >= 2) {
                const groupId = parts[0].replace(/\./g, '/');
                const artifactId = parts[1];
                registryUrl = `https://mvnrepository.com/artifact/${groupId}/${artifactId}`;
            }
        } else if (ecosystemLower === 'composer' || ecosystemLower === 'packagist' || ecosystemLower === 'php') {
            registryUrl = `https://packagist.org/packages/${encodeURIComponent(packageName)}`;
        } else if (ecosystemLower === 'go' || ecosystemLower === 'golang') {
            registryUrl = `https://pkg.go.dev/${encodeURIComponent(packageName)}`;
        }
        
        // Determine dependency type
        const isDirect = depInfo ? depInfo.type === 'direct' : true;
        
        // Fetch version drift data
        let driftData = null;
        let staleness = null;
        
        if (ecosystem && packageVersion && packageVersion !== 'unknown' && packageName && window.versionDriftAnalyzer) {
            try {
                const driftPackageKey = `${normalizedEcosystem}:${packageName}`;
                driftData = await window.versionDriftAnalyzer.getVersionDriftFromCache(driftPackageKey, packageVersion);
                
                if (!driftData) {
                    driftData = await window.versionDriftAnalyzer.checkVersionDrift(
                        packageName,
                        packageVersion,
                        ecosystem
                    );
                }
                
                if (driftData && driftData.staleness) {
                    staleness = driftData.staleness;
                } else if (driftData && !driftData.hasMajorUpdate && !driftData.hasMinorUpdate) {
                    staleness = await window.versionDriftAnalyzer.checkStaleness(
                        packageName,
                        packageVersion,
                        ecosystem
                    );
                }
            } catch (e) {
                console.warn('Failed to fetch version drift data:', e);
            }
        }
        
        // Helper function to create deps.html URL with repo filter
        const createRepoLink = (repo) => {
            const params = new URLSearchParams();
            if (currentOrg && currentOrg !== '') {
                params.set('org', currentOrg);
            }
            params.set('repo', repo);
            return `deps.html?${params.toString()}`;
        };
        
        // Helper function to create deps.html URL with search filter
        const createDepLink = (depName, depVersion = null) => {
            const params = new URLSearchParams();
            if (currentOrg && currentOrg !== '') {
                params.set('org', currentOrg);
            }
            const searchTerm = depVersion ? `${depName}@${depVersion}` : depName;
            params.set('search', searchTerm);
            return `deps.html?${params.toString()}`;
        };
        
        // Build HTML - Compact layout with two columns
        let html = `
            <div class="row g-3">
                <!-- Left Column: Basic Info & Version Status -->
                <div class="col-md-6">
                    <div class="card h-100">
                        <div class="card-body">
                            <h6 class="card-title"><i class="fas fa-info-circle me-2"></i>Package Info</h6>
                            <div class="mb-2">
                                <strong>${escapeHtml(packageName)}</strong>
                                <code class="ms-2 small">v${escapeHtml(packageVersion || 'unknown')}</code>
                            </div>
                            <div class="d-flex flex-wrap gap-2 mb-2">
                                <span class="badge ${isDirect ? 'bg-primary' : 'bg-secondary'} text-white">${escapeHtml(ecosystem || 'Unknown')}</span>
                                <span class="badge ${isDirect ? 'bg-primary' : 'bg-secondary'} text-white">${isDirect ? 'Direct' : 'Transitive'}</span>
                                <span class="badge bg-info" title="${escapeHtml(licenseInfo.license || 'Unknown')}">${escapeHtml(licenseInfo.license || 'Unknown')}</span>
                            </div>
                            ${driftData && driftData.latestVersion ? `
                                <div class="mt-2">
                                    ${driftData.hasMajorUpdate ? `
                                        <div class="alert alert-danger py-2 mb-0">
                                            <i class="fas fa-arrow-up me-1"></i><strong>Major update available:</strong> v${escapeHtml(driftData.latestVersion)}
                                        </div>
                                    ` : driftData.hasMinorUpdate ? `
                                        <div class="alert alert-warning py-2 mb-0">
                                            <i class="fas fa-arrow-up me-1"></i><strong>Minor update available:</strong> v${escapeHtml(driftData.latestVersion)}
                                        </div>
                                    ` : staleness && staleness.isProbableEOL && staleness.monthsSinceRelease >= 36 ? `
                                        <div class="alert alert-danger py-2 mb-0">
                                            <i class="fas fa-skull me-1"></i><strong>Highly Likely EOL:</strong> ${escapeHtml(staleness.probableEOLReason || 'No updates for 3+ years')}
                                        </div>
                                    ` : staleness && staleness.isProbableEOL ? `
                                        <div class="alert alert-warning py-2 mb-0">
                                            <i class="fas fa-hourglass-end me-1"></i><strong>Probable EOL:</strong> ${escapeHtml(staleness.probableEOLReason || 'No updates for 2+ years')}
                                        </div>
                                    ` : staleness && staleness.isStale ? `
                                        <div class="alert alert-warning py-2 mb-0">
                                            <i class="fas fa-clock me-1"></i><strong>Stale:</strong> Last release ${staleness.monthsSinceRelease} months ago
                                        </div>
                                    ` : `
                                        <div class="alert alert-success py-2 mb-0">
                                            <i class="fas fa-check me-1"></i>Up to date (v${escapeHtml(driftData.latestVersion)})
                                        </div>
                                    `}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
                
                <!-- Right Column: Links & Quick Actions -->
                <div class="col-md-6">
                    <div class="card h-100">
                        <div class="card-body">
                            <h6 class="card-title"><i class="fas fa-link me-2"></i>Links</h6>
                            <div class="d-grid gap-2">
                                ${githubRepoUrl ? `
                                    <a href="${escapeHtml(githubRepoUrl)}" target="_blank" rel="noreferrer noopener" class="btn btn-outline-dark btn-sm">
                                        <i class="fab fa-github me-1"></i>GitHub Source
                                    </a>
                                ` : ''}
                                ${registryUrl ? `
                                    <a href="${escapeHtml(registryUrl)}" target="_blank" rel="noreferrer noopener" class="btn btn-outline-primary btn-sm">
                                        <i class="fas fa-box me-1"></i>Package Registry
                                    </a>
                                ` : ''}
                            </div>
                            ${repositories && repositories.length > 0 ? `
                                <div class="mt-3">
                                    <small class="text-muted d-block mb-1">Used in ${repositories.length} ${repositories.length === 1 ? 'repository' : 'repositories'}</small>
                                    <div class="d-flex flex-wrap gap-1">
                                        ${repositories.slice(0, 3).map(repo => `
                                            <a href="${createRepoLink(repo)}" class="badge bg-primary text-decoration-none">${escapeHtml(repo)}</a>
                                        `).join('')}
                                        ${repositories.length > 3 ? `<span class="badge bg-secondary">+${repositories.length - 3} more</span>` : ''}
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Additional sections
        html += `<div class="row g-3 mt-2">`;

        // Phase 5.4 — Six-badge "Health summary" row. Surfaces the six
        // labeled signals the plan calls out: Official deprecation,
        // Registry status, Repository status, Maintainer signal, Textual
        // heuristic, Needs manual review. Each badge is independently
        // sourced so a user can audit the inference chain at a glance.
        html += this._renderHealthSummaryRow(depInfo, packageData);

        // Phase 4 (lifecycle) — render the OFFICIAL lifecycle status from
        // the native registry/GitHub. This trumps the heuristic warnings
        // because it's authoritative; we still render heuristic warnings
        // afterwards but clearly labeled so users can tell them apart.
        const lifecycle = depInfo && depInfo.lifecycle ? depInfo.lifecycle : null;
        if (lifecycle && lifecycle.status && lifecycle.status !== 'unknown') {
            const lcMap = {
                'deprecated':  { cls: 'alert-warning', label: 'Deprecated' },
                'yanked':      { cls: 'alert-danger',  label: 'Yanked' },
                'archived':    { cls: 'alert-danger',  label: 'Archived' },
                'quarantined': { cls: 'alert-warning', label: 'Quarantined' }
            };
            const meta = lcMap[lifecycle.status];
            if (meta) {
                html += `
                    <div class="col-12">
                        <div class="alert ${meta.cls} py-2 mb-0 d-flex align-items-start gap-2">
                            <i class="fas fa-shield-alt mt-1"></i>
                            <div class="flex-grow-1">
                                <div>
                                    <strong>Official lifecycle: ${escapeHtml(meta.label)}</strong>
                                    <span class="badge bg-info text-dark ms-1" title="${escapeHtml(lifecycle.source || '')}">${escapeHtml(lifecycle.source || 'official')}</span>
                                </div>
                                ${lifecycle.reason ? `<small class="d-block text-muted">${escapeHtml(lifecycle.reason)}</small>` : ''}
                                ${lifecycle.replacement ? `<small class="d-block">Replacement: <code>${escapeHtml(lifecycle.replacement)}</code></small>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }
        }

        // Warnings section (text/heuristic). Phase 5 (heuristics) — when
        // structured signals are available, surface them as a labeled list
        // so users can audit the inference rather than seeing only a single
        // boolean banner.
        if (packageData && packageData.warnings) {
            const warnings = packageData.warnings;
            const heuristicSignals = Array.isArray(warnings.heuristicSignals) ? warnings.heuristicSignals : [];
            html += `<div class="col-12">`;
            // Only show heuristic deprecation banner if no official lifecycle status exists
            // (avoid duplication when both signals agree).
            const officialAlreadyShown = lifecycle && ['deprecated','yanked','archived','quarantined'].includes(lifecycle.status);
            if (warnings.isDeprecated && !officialAlreadyShown) {
                html += `
                    <div class="alert alert-warning py-2 mb-0">
                        <i class="fas fa-magnifying-glass me-1"></i><strong>Heuristic: Deprecated</strong>
                        <span class="badge bg-secondary ms-1" title="Inferred from package description / readme text">heuristic</span>
                        ${warnings.replacement ? ` - Consider migrating to: <code>${escapeHtml(warnings.replacement)}</code>` : ''}
                    </div>
                `;
            } else if (warnings.isUnmaintained) {
                const warningText = warnings.warningType === 'out-of-support' ? 'Out of support' : 'Unmaintained';
                html += `
                    <div class="alert alert-warning py-2 mb-0">
                        <i class="fas fa-exclamation-triangle me-1"></i><strong>${warningText}</strong>
                        <span class="badge bg-secondary ms-1">heuristic</span>
                        - May not receive security updates
                    </div>
                `;
            }
            // Phase 5.4 — render the textual heuristic signals as a labeled
            // list so users see exactly which phrase fired and where.
            if (heuristicSignals.length > 0) {
                const items = heuristicSignals.map(s => `
                    <li><code>${escapeHtml(s.phrase || '')}</code>
                        <span class="badge bg-light text-dark ms-1">${escapeHtml(s.source || 'description')}</span>
                        ${typeof s.weight === 'number' ? `<span class="text-muted small ms-1">w=${s.weight}</span>` : ''}
                    </li>`).join('');
                html += `
                    <div class="mt-2">
                        <small class="text-muted d-block mb-1"><i class="fas fa-list me-1"></i>Textual heuristic signals</small>
                        <ul class="small mb-0">${items}</ul>
                    </div>
                `;
            }
            html += `</div>`;
        }

        // Phase 5.3 — Maintainer signal composite (level + factors). Only
        // render when we actually have a computed level so we don't bait
        // users with empty cards on legacy analyses.
        const maintainerSignal = depInfo && depInfo.maintainerSignal ? depInfo.maintainerSignal : null;
        if (maintainerSignal && maintainerSignal.level) {
            const levelMap = {
                'critical': { cls: 'alert-danger',  label: 'Critical' },
                'risk':     { cls: 'alert-warning', label: 'Risk' },
                'watch':    { cls: 'alert-info',    label: 'Watch' },
                'healthy':  { cls: 'alert-success', label: 'Healthy' }
            };
            const meta = levelMap[maintainerSignal.level] || levelMap.healthy;
            const factorChips = Array.isArray(maintainerSignal.factors)
                ? maintainerSignal.factors.map(f => `<span class="badge bg-light text-dark me-1" title="${escapeHtml(f.key)}">${escapeHtml(f.key)}${f.value !== undefined ? `: ${escapeHtml(String(f.value))}` : ''}</span>`).join('')
                : '';
            html += `
                <div class="col-12">
                    <div class="alert ${meta.cls} py-2 mb-0">
                        <strong><i class="fas fa-user-shield me-1"></i>Maintainer signal: ${escapeHtml(meta.label)}</strong>
                        <div class="mt-1">${factorChips}</div>
                    </div>
                </div>
            `;
        }
        
        // Sponsorship section
        if (funding) {
            const platforms = [];
            if (funding.github) {
                const githubUrl = funding.githubUrl || funding.url || `https://github.com/sponsors/${encodeURIComponent(packageName)}`;
                platforms.push(`<a href="${githubUrl}" target="_blank" rel="noreferrer noopener" class="btn btn-outline-dark btn-sm"><i class="fab fa-github me-1"></i>GitHub</a>`);
            }
            if (funding.opencollective) {
                const ocUrl = funding.opencollectiveUrl || funding.url;
                if (ocUrl) {
                    platforms.push(`<a href="${ocUrl}" target="_blank" rel="noreferrer noopener" class="btn btn-outline-primary btn-sm"><i class="fas fa-hand-holding-usd me-1"></i>Open Collective</a>`);
                }
            }
            if (funding.patreon) {
                const patreonUrl = funding.patreonUrl || funding.url || `https://patreon.com/${encodeURIComponent(packageName)}`;
                platforms.push(`<a href="${patreonUrl}" target="_blank" rel="noreferrer noopener" class="btn btn-outline-danger btn-sm"><i class="fab fa-patreon me-1"></i>Patreon</a>`);
            }
            if (funding.tidelift) {
                const tideliftUrl = funding.tideliftUrl || funding.url;
                if (tideliftUrl) {
                    platforms.push(`<a href="${tideliftUrl}" target="_blank" rel="noreferrer noopener" class="btn btn-outline-warning btn-sm"><i class="fas fa-gift me-1"></i>Tidelift</a>`);
                }
            }
            if (platforms.length > 0) {
                html += `
                    <div class="col-12">
                        <div class="card">
                            <div class="card-body py-2">
                                <small class="text-muted d-block mb-1"><i class="fas fa-heart text-danger me-1"></i>Sponsorship</small>
                                <div class="d-flex flex-wrap gap-1">${platforms.join('')}</div>
                            </div>
                        </div>
                    </div>
                `;
            } else if (funding.url) {
                html += `
                    <div class="col-12">
                        <div class="card">
                            <div class="card-body py-2">
                                <small class="text-muted d-block mb-1"><i class="fas fa-heart text-danger me-1"></i>Sponsorship</small>
                                <a href="${funding.url}" target="_blank" rel="noreferrer noopener" class="btn btn-outline-success btn-sm"><i class="fas fa-donate me-1"></i>Support</a>
                            </div>
                        </div>
                    </div>
                `;
            }
        }
        
        html += `</div>`;
        
        // Authors section
        if (authors && authors.length > 0) {
            html += `
                <div class="row mt-2">
                    <div class="col-12">
                        <div class="card">
                            <div class="card-body py-2">
                                <small class="text-muted d-block mb-2">
                                    <i class="fas fa-users me-1"></i>Authors & Maintainers
                                </small>
                                <div class="d-flex flex-wrap gap-2">
                                    ${authors.map(author => {
                                        const authorName = author.name || author.author || author.login || 'Unknown';
                                        const authorUrl = author.html_url || author.url || '';
                                        const isMaintainer = author.isMaintainer || false;
                                        return `
                                            <div class="d-flex align-items-center">
                                                ${authorUrl ? `<a href="${escapeHtml(authorUrl)}" target="_blank" rel="noreferrer noopener" class="text-decoration-none">${escapeHtml(authorName)}</a>` : `<span>${escapeHtml(authorName)}</span>`}
                                                ${isMaintainer ? '<span class="badge bg-primary ms-1 small">M</span>' : ''}
                                            </div>
                                        `;
                                    }).join('')}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        // Dependency Chain section (for transitive dependencies)
        if (depInfo && depInfo.type === 'transitive' && depInfo.parentsByRepo && Object.keys(depInfo.parentsByRepo).length > 0) {
            html += this.buildDependencyChainSection(depInfo, analysisData, currentOrg, createRepoLink, createDepLink);
        }
        
        return html;
    }

    /**
     * Phase 5.4 — render the six labeled signal badges in a single row.
     *
     * The six labels (per the plan):
     *   1. Official deprecation — `lifecycle.status === 'deprecated'` from
     *      a native registry's deprecation flag.
     *   2. Registry status     — `lifecycle.status` for non-deprecated
     *      registry signals (yanked, quarantined). Distinct from
     *      "deprecated" because semantics differ across ecosystems.
     *   3. Repository status   — `lifecycle.status === 'archived'` (source
     *      repo on GitHub).
     *   4. Maintainer signal   — composite from `dep.maintainerSignal.level`.
     *   5. Textual heuristic   — number of fired phrase-based signals from
     *      `dep.warnings.heuristicSignals`.
     *   6. Needs manual review — true when only weak signals fired and no
     *      official lifecycle status confirmed them, OR when the maintainer
     *      signal is `risk`/`critical` without an official lifecycle source.
     *
     * Each badge collapses to a muted "—" when there is no data, so the
     * row stays readable on healthy packages.
     */
    _renderHealthSummaryRow(depInfo, packageData) {
        const lifecycle = (depInfo && depInfo.lifecycle) || null;
        const heuristicSignals = (packageData && packageData.warnings && Array.isArray(packageData.warnings.heuristicSignals))
            ? packageData.warnings.heuristicSignals
            : [];
        const maintainer = (depInfo && depInfo.maintainerSignal) || null;
        const lcStatus = lifecycle && lifecycle.status ? lifecycle.status : null;

        const badge = (cls, label) => `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
        const muted = `<span class="text-muted small">&mdash;</span>`;

        // 1. Official deprecation
        const officialDeprecated = lcStatus === 'deprecated' ? badge('bg-warning text-dark', 'Deprecated') : muted;

        // 2. Registry status (yanked / quarantined / unknown)
        const registryStatus = (lcStatus === 'yanked')
            ? badge('bg-danger', 'Yanked')
            : (lcStatus === 'quarantined' ? badge('bg-warning text-dark', 'Quarantined') : muted);

        // 3. Repository status (archived)
        const repoStatus = (lcStatus === 'archived') ? badge('bg-danger', 'Archived') : muted;

        // 4. Maintainer signal
        const levelMap = {
            critical: 'bg-danger',
            risk:     'bg-warning text-dark',
            watch:    'bg-info text-dark',
            healthy:  'bg-success'
        };
        const maintainerBadge = (maintainer && maintainer.level && levelMap[maintainer.level])
            ? badge(levelMap[maintainer.level], maintainer.level.charAt(0).toUpperCase() + maintainer.level.slice(1))
            : muted;

        // 5. Textual heuristic count
        const textBadge = heuristicSignals.length > 0
            ? badge('bg-secondary', `${heuristicSignals.length} signal${heuristicSignals.length === 1 ? '' : 's'}`)
            : muted;

        // 6. Needs manual review
        const officialKnown = lcStatus && ['deprecated','yanked','archived','quarantined'].includes(lcStatus);
        const heuristicFired = heuristicSignals.length > 0;
        const maintainerWarn = maintainer && (maintainer.level === 'risk' || maintainer.level === 'critical');
        const needsReview = (heuristicFired && !officialKnown) || (maintainerWarn && !officialKnown);
        const reviewBadge = needsReview ? badge('bg-warning text-dark', 'Review') : muted;

        return `
            <div class="col-12">
                <div class="card">
                    <div class="card-body py-2">
                        <small class="text-muted d-block mb-2"><i class="fas fa-stethoscope me-1"></i>Health summary</small>
                        <div class="row g-2 small">
                            <div class="col-6 col-md-4 col-lg-2"><div class="text-muted">Official deprecation</div>${officialDeprecated}</div>
                            <div class="col-6 col-md-4 col-lg-2"><div class="text-muted">Registry status</div>${registryStatus}</div>
                            <div class="col-6 col-md-4 col-lg-2"><div class="text-muted">Repository status</div>${repoStatus}</div>
                            <div class="col-6 col-md-4 col-lg-2"><div class="text-muted">Maintainer signal</div>${maintainerBadge}</div>
                            <div class="col-6 col-md-4 col-lg-2"><div class="text-muted">Textual heuristic</div>${textBadge}</div>
                            <div class="col-6 col-md-4 col-lg-2"><div class="text-muted">Needs manual review</div>${reviewBadge}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Build the dependency chain section HTML
     * @param {Object} depInfo - Dependency info with parentsByRepo
     * @param {Object} analysisData - Current analysis data
     * @param {string} currentOrg - Current organization
     * @param {Function} createRepoLink - Helper to create repo links
     * @param {Function} createDepLink - Helper to create dep links
     * @returns {string} HTML for dependency chain section
     */
    buildDependencyChainSection(depInfo, analysisData, currentOrg, createRepoLink, createDepLink) {
        const targetPkgKey = `${depInfo.name}@${depInfo.version}`;
        
        // Helper function to parse package name and version
        const parsePackage = (pkgStr) => {
            const match = pkgStr.match(/^(.+?)@(.+)$/);
            if (match) {
                return { name: match[1], version: match[2] };
            }
            return { name: pkgStr, version: null };
        };
        
        // Helper function to normalize version
        const normalizeVersion = (version) => {
            if (!version) return '';
            return version.replace(/^v/, '');
        };
        
        // Helper function to build full dependency chain path
        const buildDependencyChain = (repoName, parentPkg, targetPkg) => {
            if (!analysisData || !analysisData.allRepositories) {
                return [parentPkg, targetPkg];
            }
            
            const repo = analysisData.allRepositories.find(r => `${r.owner}/${r.name}` === repoName);
            if (!repo || !repo.relationships || !repo.spdxPackages) {
                return [parentPkg, targetPkg];
            }
            
            // Build SPDX ID to package mapping
            const spdxToPackage = new Map();
            const packageToSpdx = new Map();
            repo.spdxPackages.forEach(pkg => {
                if (pkg.SPDXID && pkg.name) {
                    const pkgKey = `${pkg.name}@${normalizeVersion(pkg.version || '')}`;
                    spdxToPackage.set(pkg.SPDXID, pkgKey);
                    packageToSpdx.set(pkgKey, pkg.SPDXID);
                }
            });
            
            // Find SPDX IDs for target and parent
            const targetSpdxId = packageToSpdx.get(targetPkg);
            const parentSpdxId = packageToSpdx.get(parentPkg);
            
            if (!targetSpdxId || !parentSpdxId) {
                return [parentPkg, targetPkg];
            }
            
            // Build reverse map: child -> parent(s)
            const childToParent = new Map();
            repo.relationships.forEach(rel => {
                if (!rel.isDirectFromMain) {
                    if (!childToParent.has(rel.to)) {
                        childToParent.set(rel.to, []);
                    }
                    childToParent.get(rel.to).push(rel.from);
                }
            });
            
            // Find path from root to target
            const chain = [];
            const visited = new Set();
            
            // Trace from parent up to root (direct dependency)
            const rootPath = [];
            let currentSpdxId = parentSpdxId;
            
            while (currentSpdxId && !visited.has(currentSpdxId)) {
                visited.add(currentSpdxId);
                const pkg = spdxToPackage.get(currentSpdxId);
                if (pkg) {
                    rootPath.unshift(pkg);
                }
                
                // Check if this is a direct dependency (root)
                const isDirect = repo.relationships.some(rel => 
                    rel.to === currentSpdxId && rel.isDirectFromMain
                );
                
                if (isDirect) {
                    break;
                }
                
                // Find parent
                const parents = childToParent.get(currentSpdxId);
                if (parents && parents.length > 0) {
                    currentSpdxId = parents[0];
                } else {
                    break;
                }
            }
            
            // Add parent and target to complete the chain
            if (rootPath.length > 0) {
                chain.push(...rootPath);
            } else {
                chain.push(parentPkg);
            }
            
            // Add target at the end if not already included
            if (chain[chain.length - 1] !== targetPkg) {
                chain.push(targetPkg);
            }
            
            return chain.length > 0 ? chain : [parentPkg, targetPkg];
        };
        
        // Build dependency chains HTML
        let chainsHtml = '<div class="accordion" id="dependencyChainsAccordionModal">';
        
        Object.keys(depInfo.parentsByRepo).sort().forEach((repoName, index) => {
            const repoParents = depInfo.parentsByRepo[repoName];
            
            chainsHtml += `
                <div class="accordion-item">
                    <h2 class="accordion-header" id="chainHeadingModal${index}">
                        <button class="accordion-button ${index !== 0 ? 'collapsed' : ''}" type="button" 
                                data-bs-toggle="collapse" data-bs-target="#chainCollapseModal${index}" 
                                aria-expanded="${index === 0 ? 'true' : 'false'}" aria-controls="chainCollapseModal${index}">
                            <i class="fas fa-code-branch me-2 text-primary"></i>
                            <a href="${createRepoLink(repoName)}" class="text-decoration-none text-dark" data-stop-propagation>
                                <strong>${escapeHtml(repoName)}</strong>
                            </a>
                            <span class="badge bg-primary text-white ms-2">${repoParents.length} ${repoParents.length === 1 ? 'path' : 'paths'}</span>
                        </button>
                    </h2>
                    <div id="chainCollapseModal${index}" class="accordion-collapse collapse ${index === 0 ? 'show' : ''}" 
                         aria-labelledby="chainHeadingModal${index}" data-bs-parent="#dependencyChainsAccordionModal">
                        <div class="accordion-body">
                            <p class="text-muted small mb-2">Dependency paths:</p>
                            <ul class="list-group">
                                ${repoParents.map(parent => {
                                    // Build full dependency chain
                                    const chain = buildDependencyChain(repoName, parent, targetPkgKey);
                                    
                                    // The first element in the chain is the direct dependency (root)
                                    const directDep = chain.length > 0 ? chain[0] : parent;
                                    const directDepParsed = parsePackage(directDep);
                                    const directDepLink = createDepLink(directDepParsed.name, directDepParsed.version);
                                    
                                    // Render chain with links
                                    const chainHtml = chain.map((pkg, idx) => {
                                        const pkgParsed = parsePackage(pkg);
                                        const pkgLink = createDepLink(pkgParsed.name, pkgParsed.version);
                                        const isLast = idx === chain.length - 1;
                                        
                                        return `
                                            ${idx > 0 ? '<span class="text-muted mx-1">→</span>' : ''}
                                            <a href="${pkgLink}" class="text-decoration-none ${isLast ? 'fw-bold text-primary' : ''}" target="_blank">
                                                <code>${escapeHtml(pkg)}</code>
                                            </a>
                                        `;
                                    }).join('');
                                    
                                    return `
                                        <li class="list-group-item">
                                            <div class="d-flex align-items-center flex-wrap">
                                                <i class="fas fa-arrow-right me-2 text-success"></i>
                                                <div class="flex-grow-1">
                                                    <div class="mb-1">
                                                        <strong>Direct dependency:</strong> 
                                                        <a href="${directDepLink}" class="text-decoration-none fw-bold ms-1" target="_blank">
                                                            <code>${escapeHtml(directDep)}</code>
                                                        </a>
                                                    </div>
                                                    ${chain.length > 1 ? `
                                                        <div class="small text-muted mt-1">
                                                            <strong>Full path:</strong> ${chainHtml}
                                                        </div>
                                                    ` : ''}
                                                </div>
                                            </div>
                                        </li>
                                    `;
                                }).join('')}
                            </ul>
                        </div>
                    </div>
                </div>
            `;
        });
        
        chainsHtml += '</div>';
        
        return `
            <div class="mt-3">
                <h6><i class="fas fa-sitemap me-2"></i>Dependency Chains</h6>
                <p class="text-muted small mb-2">This transitive dependency is brought in by the following dependency paths:</p>
                ${chainsHtml}
            </div>
        `;
    }
}

// Create global instance
window.packageDetailsModal = new PackageDetailsModal();

/**
 * Convenience function to show the package details modal
 * @param {Object} options - Options for the modal (see PackageDetailsModal.show)
 */
async function showPackageDetailsModal(options) {
    return window.packageDetailsModal.show(options);
}

// Make it globally available
window.showPackageDetailsModal = showPackageDetailsModal;

