/**
 * AI Insights (insights-ai.js) — natural-language executive analysis
 * using Chrome's built-in Gemini Nano (Prompt API).
 *
 * All AI processing happens on-device — no data ever leaves the browser.
 * Falls back gracefully if the API is not available.
 */
(async function () {
    'use strict';

    const storageManager = window.storageManager || new StorageManager();
    if (!storageManager.initialized) await storageManager.init();

    const esc  = window.escapeHtml || (s => String(s));
    const safe = window.safeSetHTML || ((el, h) => { el.innerHTML = h; });
    const Agg  = window.InsightsAggregator;

    const selector  = document.getElementById('analysisSelector');
    const content   = document.getElementById('content');
    const loading   = document.getElementById('loading');
    const noData    = document.getElementById('noDataMessage');
    const statusDot = document.getElementById('aiStatusDot');
    const statusTxt = document.getElementById('aiStatusText');

    /* ---- State ---- */
    let currentInsights = null;
    let aiCapabilities  = null;  // null = unavailable
    let abortController = null;

    const MODES = {
        executive: {
            label: 'Executive Summary',
            icon: 'fas fa-file-lines',
            system: 'You are an expert cybersecurity advisor writing a concise executive brief for a CISO. Use clear, plain language. Avoid jargon. Be direct about risks but constructive in tone. Maximum 250 words.',
            prompt: (data) => `Analyze this SBOM org health data and write a 2-3 paragraph executive summary.

DATA:
${data}

Cover: 1) Overall health assessment 2) Top 2-3 risks that need attention 3) One sentence of encouragement if things look good or a call to action if they don't.`
        },
        risks: {
            label: 'Risk Deep-Dive',
            icon: 'fas fa-exclamation-triangle',
            system: 'You are a risk analyst specializing in software supply-chain security. Be specific, reference the numbers, and prioritize by severity. Maximum 200 words.',
            prompt: (data) => `Analyze these SBOM risk indicators and provide a focused risk assessment.

DATA:
${data}

Identify: 1) The single biggest risk and why 2) 2-3 secondary risks ranked by severity 3) Which risks are urgent vs which can be monitored. Be specific about counts and thresholds.`
        },
        recommendations: {
            label: 'Recommendations',
            icon: 'fas fa-list-check',
            system: 'You are a remediation advisor. Give actionable, prioritized recommendations. Each recommendation must be specific and reference the data. Maximum 250 words.',
            prompt: (data) => `Based on this SBOM org health data, provide prioritized remediation recommendations.

DATA:
${data}

Give 3-5 recommendations ordered by impact. For each: what to do, why (reference the data), and the expected outcome. Use bullet points for readability.`
        },
        ma: {
            label: 'M&A Due Diligence',
            icon: 'fas fa-handshake',
            system: 'You are an M&A technical due diligence analyst. Assess the target organization\'s software supply-chain health for an acquisition context. Be balanced — note both strengths and liabilities. Maximum 250 words.',
            prompt: (data) => `Assess this organization's software supply-chain posture from an M&A due diligence perspective.

DATA:
${data}

Cover: 1) Overall risk rating (Low/Medium/High) for the acquisition context 2) Key liabilities being inherited (be specific) 3) Strengths that reduce risk 4) Estimated remediation effort (minimal/moderate/significant) 5) Deal recommendation — proceed as-is, proceed with conditions, or flag for deeper review.`
        }
    };

    /* ---- Check AI availability ---- */
    async function checkAi() {
        try {
            if (!window.AiNano || !window.AiNano.isSupported()) {
                statusDot.className = 'dot unavailable';
                statusTxt.textContent = 'Chrome Prompt API not found';
                aiCapabilities = { available: 'no' };
                return false;
            }
            const caps = await window.AiNano.getAvailability();
            aiCapabilities = caps;
            if (caps.available === 'readily') {
                statusDot.className = 'dot ready';
                statusTxt.textContent = 'Gemini Nano ready';
                return true;
            }
            if (caps.available === 'after-download') {
                statusDot.className = 'dot downloading';
                statusTxt.textContent = 'Gemini Nano — download needed (click generate to start)';
                return true;
            }
            statusDot.className = 'dot unavailable';
            statusTxt.textContent = 'Gemini Nano not available on this browser';
            return false;
        } catch (e) {
            console.warn('AI check failed:', e);
            statusDot.className = 'dot unavailable';
            statusTxt.textContent = 'AI unavailable';
            aiCapabilities = { available: 'no' };
            return false;
        }
    }

    /* ---- Bootstrap analysis ---- */
    async function loadAnalysesList() {
        try {
            const info = await storageManager.getStorageInfo();
            const all = [...info.organizations, ...info.repositories]
                .filter(e => e.name !== '__ALL__' && e.dependencies > 0);
            selector.innerHTML = '';
            if (all.length === 0) {
                noData.classList.remove('d-none');
                selector.disabled = true;
                return;
            }
            const opt = document.createElement('option');
            opt.value = '';
            const totalDeps = all.reduce((s, e) => s + (e.dependencies || 0), 0);
            opt.textContent = `All Analyses (${totalDeps} deps)`;
            selector.appendChild(opt);
            for (const e of all) {
                const o = document.createElement('option');
                o.value = e.name;
                o.textContent = `${e.name} (${e.dependencies || 0} deps)`;
                selector.appendChild(o);
            }
            selector.disabled = false;
            await loadAnalysis();
        } catch (err) {
            console.error('AI: load failed', err);
            selector.disabled = true;
            noData.classList.remove('d-none');
        }
    }

    async function loadAnalysis() {
        loading.classList.remove('d-none');
        content.classList.add('d-none');
        noData.classList.add('d-none');

        const name = selector.value;
        let data;
        if (!name || name === '') {
            data = await storageManager.getCombinedData();
        } else {
            data = await storageManager.loadAnalysisDataForOrganization(name);
        }

        if (!data || !data.data) {
            loading.classList.add('d-none');
            noData.classList.remove('d-none');
            return;
        }

        currentInsights = Agg.buildInsights(data.data);
        renderMetrics(currentInsights);
        loading.classList.add('d-none');
        content.classList.remove('d-none');
    }

    /* ---- Build compact data for AI ---- */
    function buildAiContext(ins) {
        const td  = ins.techDebt;
        const ch  = ins.critHigh;
        const dr  = ins.driftStats;
        const eol = ins.eolStats;
        const lic = ins.licenseStats;
        const sc  = ins.supplyChain;
        const hyg = ins.repoHygiene;
        const va  = ins.vulnAgeStats;
        const dw  = va.directDwellMedian;
        const age = ins.ageStats;

        const activeRepos = (hyg.activityBuckets['Last 30 days'] || 0)
            + (hyg.activityBuckets['30-90 days'] || 0)
            + (hyg.activityBuckets['90-180 days'] || 0);

        return {
            overview: {
                repos: ins.totalRepos,
                reposWithSbom: ins.reposWithSbom,
                deps: ins.totalDeps,
                directDeps: ins.directCount,
                transitiveDeps: ins.transitiveCount,
                languages: ins.languageStats.slice(0, 5).map(l => l.language)
            },
            security: {
                critVulns: ch.critical,
                highVulns: ch.high,
                totalVulns: ch.total,
                cveDwellDays: dw,
                malwareAlerts: sc.malwareCount,
                depConfusion: sc.depConfusionCount
            },
            maintenance: {
                techDebtGrade: td.grade,
                techDebtScore: td.score100,
                eolCount: eol.eolCount,
                eosCount: eol.eosCount,
                majorDrift: dr.buckets.major.total,
                driftCoverage: dr.coveragePct,
                oldDepsPct: age.coveragePct > 0
                    ? Math.round(age.buckets.filter(b => b.maxMonths >= 24).reduce((s, b) => s + b.total, 0) / ins.totalDeps * 100)
                    : 0
            },
            compliance: {
                highRiskLicenses: lic.highRisk,
                copyleftDirect: lic.copyleft.direct,
                copyleftTransitive: lic.copyleft.transitive,
                unknownLicenses: lic.unknown.total,
                unpinnedActions: sc.unpinnedActions
            },
            hygiene: {
                activeRepos,
                archivedRepos: hyg.archived,
                noSbomRepos: hyg.noSbom,
                avgGrade: Object.entries(hyg.gradeDistribution)
                    .reduce((s, [g, c]) => s + ({ A: 4, B: 3, C: 2, D: 1, F: 0 }[g] || 0) * c, 0)
                    / (ins.totalRepos || 1)
            }
        };
    }

    /* ---- Format prompt ---- */
    function formatDataForPrompt(ctx) {
        return JSON.stringify(ctx, null, 1);
    }

    /* ---- AI generation ---- */
    async function generateAi(modeKey) {
        if (!currentInsights || !aiCapabilities) return;

        // Abort previous
        if (abortController) {
            abortController.abort();
            abortController = null;
        }

        const mode = MODES[modeKey];
        if (!mode) return;

        const output = document.getElementById('aiOutput');
        const btns  = document.querySelectorAll('.ai-mode-btn');

        // Disable buttons, show loading
        btns.forEach(b => b.disabled = true);
        document.querySelectorAll('.ai-mode-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.mode === modeKey);
        });

        // Show skeleton
        safe(output, `<div class="ai-skeleton">
            <div class="line"></div><div class="line"></div><div class="line"></div>
            <div class="line"></div><div class="line"></div><div class="line"></div>
        </div>`);

        try {
            // Need to download? trigger first
            if (aiCapabilities.available === 'after-download') {
                safe(output, `<div class="text-center py-4">
                    <div class="spinner-border text-primary mb-3" role="status"></div>
                    <p class="text-muted">Downloading Gemini Nano model&hellip; (one-time, may take a minute)</p>
                </div>`);
            }

            const session = await window.AiNano.createSession({
                systemPrompt: mode.system,
                temperature: 0.3,
                topK: 20
            });

            const ctx  = buildAiContext(currentInsights);
            const data = formatDataForPrompt(ctx);
            const userPrompt = mode.prompt(data);

            // Use streaming for progressive display
            const stream = await session.promptStreaming(userPrompt);

            // Mark as no longer empty
            output.classList.remove('empty');

            let fullText = '';
            const responseDiv = document.createElement('div');
            responseDiv.className = 'ai-response';
            safe(output, '');
            output.appendChild(responseDiv);

            // Add mode label
            const modeLabel = document.createElement('h4');
            modeLabel.innerHTML = `<i class="${mode.icon} me-2"></i>${esc(mode.label)}`;
            responseDiv.appendChild(modeLabel);

            const contentDiv = document.createElement('div');
            contentDiv.id = 'aiResponseContent';
            responseDiv.appendChild(contentDiv);

            for await (const chunk of stream) {
                fullText = chunk;
                // Basic markdown-like rendering
                contentDiv.innerHTML = renderAiText(fullText) + '<span class="ai-cursor"></span>';
            }

            // Final render (no cursor)
            contentDiv.innerHTML = renderAiText(fullText);

            session.destroy();
        } catch (err) {
            if (err.name === 'AbortError' || err.message?.includes('abort')) {
                safe(output, `<div class="text-center py-4 text-muted"><i class="fas fa-ban me-2"></i>Generation cancelled.</div>`);
            } else {
                console.error('AI generation failed:', err);
                safe(output, `<div class="ai-error">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>AI analysis failed: ${esc(err.message || 'Unknown error')}</p>
                    <button class="btn btn-sm btn-outline-primary mt-2" onclick="this.closest('.ai-output').dispatchEvent(new CustomEvent('retry'))">Retry</button>
                </div>`);
            }
        } finally {
            btns.forEach(b => b.disabled = false);
        }
    }

    /* ---- Simple markdown-like renderer ---- */
    function renderAiText(text) {
        if (!text) return '';
        let html = esc(text);

        // Headings: ### text or ## text
        html = html.replace(/^### (.+)$/gm, '<h5>$1</h5>');
        html = html.replace(/^## (.+)$/gm, '<h5>$1</h5>');

        // Bold
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

        // Bullet lists
        html = html.replace(/^[\*\-] (.+)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

        // Numbered lists
        html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');

        // Paragraphs — double newlines
        html = html.replace(/\n\n+/g, '</p><p>');
        html = html.replace(/^(.+)$/gm, (m) => {
            if (m.startsWith('<') || m.startsWith('</')) return m;
            if (m.trim() === '') return m;
            // Already wrapped?
            if (m.includes('<h5') || m.includes('<li') || m.includes('<ul') || m.includes('</ul>')) return m;
            return m;
        });

        // Wrap loose text in <p>
        if (!html.startsWith('<')) {
            html = '<p>' + html + '</p>';
        }
        html = html.replace(/<\/p>\s*<p>/g, '</p><p>');

        return html;
    }

    /* ---- Render metrics + AI controls ---- */
    function renderMetrics(ins) {
        const td  = ins.techDebt;
        const ch  = ins.critHigh;
        const eol = ins.eolStats;

        const gradeColor = td.score100 >= 75 ? 'var(--color-green)' : td.score100 >= 55 ? 'var(--color-yellow)' : 'var(--color-red)';

        const kpiHtml = `
            <div class="ai-kpis">
                <div class="ai-kpi"><div class="val">${ins.totalRepos}</div><div class="lbl">Repos</div></div>
                <div class="ai-kpi"><div class="val">${ins.totalDeps}</div><div class="lbl">Deps</div></div>
                <div class="ai-kpi"><div class="val" style="color:${ch.total > 0 ? 'var(--color-red)' : 'var(--color-green)'}">${ch.total}</div><div class="lbl">C+H Vulns</div></div>
                <div class="ai-kpi"><div class="val" style="color:${eol.eolCount > 0 ? 'var(--color-red)' : 'var(--color-green)'}">${eol.eolCount}</div><div class="lbl">EOL</div></div>
                <div class="ai-kpi"><div class="val" style="color:${gradeColor}">${td.grade}</div><div class="lbl">Grade</div></div>
                <div class="ai-kpi"><div class="val">${td.score100}</div><div class="lbl">Health</div></div>
            </div>`;

        const aiAvailable = aiCapabilities && aiCapabilities.available !== 'no';

        const modeBtns = Object.entries(MODES).map(([key, m]) =>
            `<button class="ai-mode-btn" data-mode="${key}" ${aiAvailable ? '' : 'disabled'} onclick="document.getElementById('aiOutput').dispatchEvent(new CustomEvent('generate', {detail:{mode:'${key}'}}))">
                <i class="${m.icon}"></i>${esc(m.label)}
            </button>`
        ).join('');

        const controlsHtml = aiAvailable
            ? `<div class="ai-modes">${modeBtns}</div>`
            : `<div class="alert alert-warning text-center py-2 mb-4" style="max-width:500px;margin:0 auto;">
                <i class="fas fa-info-circle me-2"></i>
                AI analysis requires Chrome 128+ with <code>chrome://flags/#prompt-api-for-gemini-nano</code> enabled.
                <br><small class="text-muted">The deterministic dashboards (Pulse, Portfolio, Report, Snapshot) work without AI.</small>
               </div>`;

        const outputHtml = `<div class="ai-output empty" id="aiOutput">
            <div class="text-center">
                <div class="placeholder-icon"><i class="fas fa-robot"></i></div>
                <div class="placeholder-text">Select an analysis type above to generate AI insights</div>
            </div>
        </div>`;

        const detectNotice = aiAvailable
            ? `<div class="ai-detection-notice"><i class="fas fa-microchip me-1"></i>Analysis runs entirely on-device via Gemini Nano — zero data leaves your browser.</div>`
            : '';

        safe(content, kpiHtml + controlsHtml + outputHtml + detectNotice);

        // Wire up custom events
        const output = document.getElementById('aiOutput');
        output.addEventListener('generate', (e) => {
            generateAi(e.detail.mode);
        });
        output.addEventListener('retry', () => {
            const active = document.querySelector('.ai-mode-btn.active');
            if (active) generateAi(active.dataset.mode);
        });
    }

    selector.addEventListener('change', loadAnalysis);
    await checkAi();
    await loadAnalysesList();

})();
