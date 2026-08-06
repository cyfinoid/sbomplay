/**
 * demo.html — load bundled demo fixtures via fetch.
 * Full-analysis exports go through StorageManager.importAllData();
 * raw SPDX/CycloneDX still uses processUploadedSBOM (same path as file upload).
 */
(function () {
    'use strict';

    /** @type {{ id: string, label: string, path: string }[]} */
    const DEMO_SCENARIOS = [
        { id: 'sbomplay-demo', label: 'Load SBOM Play demo', path: 'data/demo/sbomplay-demo.json' }
    ];

    const DEMO_PATH_RE = /^data\/demo\/[a-zA-Z0-9._-]+\.json$/;

    function assertAllowedDemoPath(path) {
        if (!DEMO_PATH_RE.test(path)) {
            throw new Error('Invalid demo asset path');
        }
    }

    async function waitForAppReady() {
        for (let i = 0; i < 400; i++) {
            if (window.app && window.app.initialized) {
                return window.app;
            }
            await new Promise(function (r) {
                setTimeout(r, 50);
            });
        }
        throw new Error('Application failed to initialize storage');
    }

    function setDemoButtonsDisabled(disabled) {
        DEMO_SCENARIOS.forEach(function (s) {
            const btn = document.querySelector('[data-demo-id="' + s.id + '"]');
            if (btn) {
                btn.disabled = disabled;
            }
        });
    }

    function setStatusHtml(html) {
        const el = document.getElementById('demoProgressStatus');
        if (!el || typeof safeSetHTML !== 'function') return;
        safeSetHTML(el, html);
    }

    async function runDemoScenario(scenario) {
        assertAllowedDemoPath(scenario.path);

        const app = await waitForAppReady();
        if (app.isAnalyzing) {
            throw new Error('Another analysis is already running');
        }

        const fileName = scenario.path.split('/').pop();

        const res = await fetch(scenario.path, { credentials: 'same-origin' });
        if (!res.ok) {
            throw new Error('Could not load demo file (' + res.status + ')');
        }
        const text = await res.text();

        app.isAnalyzing = true;
        setDemoButtonsDisabled(true);
        setStatusHtml(
            '<p class="mb-0 text-muted"><i class="fas fa-spinner fa-spin me-2"></i>Loading <strong>' +
                escapeHtml(fileName) +
                '</strong>…</p>'
        );

        try {
            // Bundled demo fixtures are full analysis exports produced by
            // StorageManager.exportAllData() (e.g. { type: 'all', entries: [...] }).
            // Detect that shape and restore the pre-computed scan results through
            // StorageManager.importAllData() so nothing has to be re-parsed or
            // re-enriched. The SBOM parser only understands SPDX/CycloneDX and
            // rejects exports with "Unknown SBOM format", so this branch is what
            // makes the bundled full-scan demo data loadable at all.
            let parsedExport = null;
            try {
                const candidate = JSON.parse(text);
                if (
                    candidate &&
                    typeof candidate === 'object' &&
                    typeof candidate.type === 'string' &&
                    Array.isArray(candidate.entries)
                ) {
                    parsedExport = candidate;
                }
            } catch (jsonError) {
                // Not JSON — fall through to the raw-SBOM path below.
            }

            if (parsedExport) {
                if (!app.storageManager) {
                    throw new Error('Storage manager is not available');
                }
                const result = await app.storageManager.importAllData(parsedExport);
                if (!result || result.success === false) {
                    throw new Error((result && result.error) || 'Failed to import demo analysis');
                }
                const imported = (result.importedEntries != null) ? result.importedEntries : parsedExport.entries.length;
                setStatusHtml(
                    '<div class="alert alert-success mb-0">' +
                        '<i class="fas fa-check-circle me-2"></i>Demo analysis imported (' +
                        escapeHtml(String(imported)) +
                        ' ' + (imported === 1 ? 'entry' : 'entries') + '). Open ' +
                        '<a href="index.html">Home</a>, ' +
                        '<a href="vuln.html">Vulns</a>, ' +
                        '<a href="deps.html">Deps</a>, or ' +
                        '<a href="licenses.html">Licenses</a> to explore results.' +
                        '</div>'
                );
                return;
            }

            if (!app.sbomParser) {
                throw new Error('SBOM parser is not available');
            }
            if (!app.sbomParser.isValidExtension(fileName)) {
                throw new Error('Unsupported demo file name');
            }

            const parsed = app.sbomParser.parse(text, fileName);
            if (!parsed.success || !parsed.data || !parsed.format || parsed.format.format === 'unknown') {
                throw new Error(parsed.error || 'Failed to parse demo SBOM');
            }

            const item = {
                file: { name: fileName },
                parsedData: parsed
            };

            await app.processUploadedSBOM(item, function (_phase, _pct, message) {
                setStatusHtml(
                    '<p class="mb-0 text-muted"><i class="fas fa-spinner fa-spin me-2"></i>' +
                        escapeHtml(message) +
                        '</p>'
                );
            });

            const base = fileName.replace(/\.[^/.]+$/, '');
            const storedKey = 'upload/' + base;
            setStatusHtml(
                '<div class="alert alert-success mb-0">' +
                    '<i class="fas fa-check-circle me-2"></i>Demo analysis saved as <code>' +
                    escapeHtml(storedKey) +
                    '</code>. Open ' +
                    '<a href="index.html">Home</a>, ' +
                    '<a href="vuln.html">Vulns</a>, ' +
                    '<a href="deps.html">Deps</a>, or ' +
                    '<a href="licenses.html">Licenses</a> to explore results.' +
                    '</div>'
            );
        } catch (err) {
            console.error('Demo analysis failed:', err);
            setStatusHtml(
                '<div class="alert alert-danger mb-0"><i class="fas fa-exclamation-circle me-2"></i>' +
                    escapeHtml(err.message || String(err)) +
                    '</div>'
            );
        } finally {
            app.isAnalyzing = false;
            setDemoButtonsDisabled(false);
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        const host = document.getElementById('demoScenarioButtons');
        if (!host) return;

        DEMO_SCENARIOS.forEach(function (s) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn-primary mb-2 me-2';
            btn.setAttribute('data-demo-id', s.id);
            btn.textContent = s.label;
            btn.addEventListener('click', function () {
                runDemoScenario(s).catch(function (e) {
                    console.error(e);
                    setStatusHtml(
                        '<div class="alert alert-danger mb-0">' +
                            escapeHtml(e.message || String(e)) +
                            '</div>'
                    );
                });
            });
            host.appendChild(btn);
        });
    });
})();
