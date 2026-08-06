/**
 * AI Agent (insights-agent.js) — tool-use pattern.
 * Gemini Nano queries SBOM data on-demand via registered functions,
 * like an analyst running database queries. All on-device.
 *
 * Architecture:
 *   User question → AI decides what data it needs → calls query_sbom()
 *   → JS executes query against in-memory data → returns results
 *   → AI synthesizes answer → User sees final response
 *
 * The AI requests data as needed rather than having everything dumped upfront.
 */
(async function () {
    'use strict';

    const storageManager = window.storageManager || new StorageManager();
    if (!storageManager.initialized) await storageManager.init();

    const esc  = window.escapeHtml || (s => String(s));
    const safe = window.safeSetHTML || ((el, h) => { el.innerHTML = h; });
    const Agg  = window.InsightsAggregator;

    const selector = document.getElementById('analysisSelector');
    const content  = document.getElementById('content');
    const loading  = document.getElementById('loading');
    const noData   = document.getElementById('noDataMessage');

    /* ---- State ---- */
    let currentData  = null;   // raw data.data from IndexedDB
    let currentIns   = null;   // InsightsAggregator.buildInsights()
    let aiSession    = null;
    let aiAvailable  = false;
    let toolsSupport = false;
    let isGenerating = false;
    /** Active per-turn tool panel (queries shown before the assistant summary). */
    let activeToolPanel = null;

    /* ================================================================== */
    /*  FUNCTION DECLARATIONS — exposed to the AI as callable tools        */
    /* ================================================================== */

    /**
     * Each function: (args) => { data: ..., summary: "..." }
     * The AI calls these via query_sbom({type, filter, limit})
     */
    const DATA_QUERIES = {
        /** High-level org overview */
        overview() {
            if (!currentIns) return { data: null, summary: 'No data loaded.' };
            const ins = currentIns;
            return {
                summary: `${ins.totalRepos} repos (${ins.reposWithSbom} with SBOMs), ${ins.totalDeps} total deps (${ins.directCount} direct, ${ins.transitiveCount} transitive)`,
                data: {
                    totalRepos: ins.totalRepos,
                    reposWithSbom: ins.reposWithSbom,
                    reposWithoutSbom: ins.totalRepos - ins.reposWithSbom,
                    totalDeps: ins.totalDeps,
                    directDeps: ins.directCount,
                    transitiveDeps: ins.transitiveCount,
                    topLanguages: ins.languageStats.slice(0, 8).map(l => ({ language: l.language, refs: l.count }))
                }
            };
        },

        /** Vulnerabilities with optional severity filter */
        vulnerabilities(args) {
            if (!currentData) return { data: null, summary: 'No vulnerability data.' };
            const va = currentData.vulnerabilityAnalysis;
            if (!va) return { data: null, summary: 'No vulnerability analysis found.' };
            const filter = (args?.filter || '').toLowerCase();
            const limit  = args?.limit || 50;
            const sevFilters = new Set(['critical', 'high', 'medium', 'moderate', 'low']);
            let deps = va.vulnerableDependencies || [];
            let totalCrit = va.criticalVulnerabilities || 0;
            let totalHigh = va.highVulnerabilities || 0;
            let totalMed  = va.mediumVulnerabilities || 0;

            // Build expanded list with vuln details
            let items = [];
            for (const vDep of deps) {
                for (const v of (vDep.vulnerabilities || [])) {
                    const sev = (v.severity || '').toUpperCase();
                    const sevLower = sev.toLowerCase();
                    if (filter) {
                        if (sevFilters.has(filter)) {
                            // Severity filter must match severity (case-insensitive)
                            if (!sevLower.includes(filter)) continue;
                        } else if (!sevLower.includes(filter) && !(v.id || '').toLowerCase().includes(filter)
                            && !(vDep.name || '').toLowerCase().includes(filter)) {
                            continue;
                        }
                    }
                    items.push({
                        package: vDep.name,
                        version: vDep.version,
                        vulnId: v.id || 'N/A',
                        severity: sev,
                        published: v.published || null,
                        source: v.source || 'OSV',
                        type: v.kind || 'vulnerability'
                    });
                }
            }

            // Sort: critical first, then high
            const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, MODERATE: 3, LOW: 4 };
            items.sort((a, b) => (order[a.severity] ?? 99) - (order[b.severity] ?? 99));

            const filteredCount = items.length;
            const shown = items.slice(0, limit);
            const summary = filter && sevFilters.has(filter)
                ? `${filteredCount} ${filter} vulnerabilities (showing ${shown.length}) across ${deps.length} vulnerable packages; portfolio totals: ${totalCrit} critical, ${totalHigh} high, ${totalMed} medium`
                : `${totalCrit} critical, ${totalHigh} high, ${totalMed} medium vulnerabilities across ${deps.length} packages (showing ${shown.length} items)`;
            return {
                summary,
                data: {
                    totalCrit, totalHigh, totalMed,
                    totalPackages: deps.length,
                    filter: filter || null,
                    matchedCount: filteredCount,
                    items: shown
                }
            };
        },

        /** Dependencies search */
        dependencies(args) {
            if (!currentData) return { data: null, summary: 'No dependency data.' };
            const allDeps = currentData.allDependencies || [];
            const search  = (args?.search || '').toLowerCase();
            const limit   = args?.limit || 20;
            let filtered = allDeps;
            if (search) filtered = allDeps.filter(d => (d.name || '').toLowerCase().includes(search));

            const items = filtered.slice(0, limit).map(d => ({
                name: d.name,
                version: d.version,
                type: d.type || 'unknown',
                license: d.licenseFull || d.license || 'unknown',
                hasVuln: !!(d.vulnerability || (currentData.vulnerabilityAnalysis?.vulnerableDependencies || []).some(vd => vd.name === d.name))
            }));

            return {
                summary: `${allDeps.length} total dependencies${search ? `, ${filtered.length} matching "${search}"` : ''}`,
                data: { total: allDeps.length, matched: filtered.length, items }
            };
        },

        /** Repositories list */
        repositories(args) {
            if (!currentData) return { data: null, summary: 'No repository data.' };
            const repos = currentData.allRepositories || [];
            const filter = (args?.filter || '').toLowerCase();
            let filtered = repos;
            if (filter === 'archived') filtered = repos.filter(r => r.archived);
            else if (filter === 'active') filtered = repos.filter(r => !r.archived);
            else if (filter === 'no-sbom') filtered = repos.filter(r => !r.qualityAssessment);

            const items = filtered.map(r => ({
                name: r.name,
                owner: r.owner,
                archived: !!r.archived,
                totalDeps: r.totalDependencies || r.dependencies?.length || 0,
                grade: r.qualityAssessment?.grade || null,
                pushedAt: r.pushedAt || null
            }));

            return {
                summary: `${repos.length} repos (${items.length} after filter)`,
                data: { total: repos.length, filtered: items.length, items }
            };
        },

        /** License breakdown */
        licenses() {
            if (!currentIns) return { data: null, summary: 'No license data.' };
            const l = currentIns.licenseStats;
            return {
                summary: `${l.highRisk} high-risk, ${l.permissive.total} permissive, ${l.unknown.total} unknown`,
                data: {
                    highRisk: l.highRisk,
                    copyleft: l.copyleft,
                    permissive: l.permissive,
                    unknown: l.unknown,
                    conflicts: l.conflicts?.length || 0
                }
            };
        },

        /** EOL/EOS components */
        eol(args) {
            if (!currentIns) return { data: null, summary: 'No EOL data.' };
            const eol = currentIns.eolStats;
            const limit = args?.limit || 30;
            const items = eol.eolList.slice(0, limit).map(e => ({
                name: e.name,
                version: e.version,
                isEol: e.isEol,
                isEos: e.isEos,
                source: e.source,
                isDirect: e.isDirect
            }));
            return {
                summary: `${eol.eolCount} EOL, ${eol.eosCount} EOS components`,
                data: { eolCount: eol.eolCount, eosCount: eol.eosCount, items }
            };
        },

        /** Version drift */
        versionDrift(args) {
            if (!currentIns) return { data: null, summary: 'No drift data.' };
            const drift = currentIns.driftStats;
            const type = (args?.type || '').toLowerCase();
            const limit = args?.limit || 20;
            let items = drift.lagging;
            if (type === 'major') items = items.filter(i => i.type === 'major');
            else if (type === 'minor') items = items.filter(i => i.type === 'minor');

            return {
                summary: `${drift.buckets.major.total} major, ${drift.buckets.minor.total} minor lagging (${drift.coveragePct}% coverage)`,
                data: {
                    major: drift.buckets.major,
                    minor: drift.buckets.minor,
                    current: drift.buckets.current,
                    coveragePct: drift.coveragePct,
                    items: items.slice(0, limit)
                }
            };
        },

        /** Malware alerts */
        malware() {
            if (!currentIns) return { data: null, summary: 'No malware data.' };
            const sc = currentIns.supplyChain;
            return {
                summary: `${sc.malwareCount} malware advisories, ${sc.depConfusionCount} dependency confusion risks`,
                data: { malwareCount: sc.malwareCount, depConfusionCount: sc.depConfusionCount }
            };
        },

        /** Tech debt breakdown */
        techDebt() {
            if (!currentIns) return { data: null, summary: 'No tech debt data.' };
            const td = currentIns.techDebt;
            return {
                summary: `Grade ${td.grade}, score ${td.score100}/100`,
                data: {
                    grade: td.grade,
                    score100: td.score100,
                    components: Object.entries(td.components).map(([k, v]) => ({ name: k, debt: v.debt, weight: v.weight }))
                }
            };
        },

        /** Supply chain risks */
        supplyChain() {
            if (!currentIns) return { data: null, summary: 'No supply chain data.' };
            const sc = currentIns.supplyChain;
            return {
                summary: `${sc.malwareCount} malware, ${sc.depConfusionCount} dep confusion, ${sc.unpinnedActions} unpinned actions, ${sc.deadRepos} dead repos`,
                data: {
                    malwareCount: sc.malwareCount,
                    depConfusionCount: sc.depConfusionCount,
                    unpinnedActions: sc.unpinnedActions,
                    totalActions: sc.totalActions,
                    deadRepos: sc.deadRepos
                }
            };
        },

        /** Per-repository drill-down */
        perRepo(args) {
            if (!currentIns) return { data: null, summary: 'No per-repo data.' };
            const name = (args?.name || '').toLowerCase();
            let rows = currentIns.perRepo;
            if (name) rows = rows.filter(r => r.repoKey.toLowerCase().includes(name));
            const limit = args?.limit || 30;
            const items = rows.slice(0, limit).map(r => ({
                repoKey: r.repoKey,
                directDeps: r.directCount,
                transitiveDeps: r.transitiveCount,
                critHighVulns: (r.critDirect + r.highDirect + r.critTransitive + r.highTransitive),
                majorDrift: r.majorDriftDirect + r.majorDriftTransitive,
                grade: r.grade,
                archived: r.archived
            }));
            return {
                summary: `${currentIns.perRepo.length} repos (${items.length} shown)`,
                data: { total: currentIns.perRepo.length, items }
            };
        },

        /** Repo hygiene */
        hygiene() {
            if (!currentIns) return { data: null, summary: 'No hygiene data.' };
            const h = currentIns.repoHygiene;
            return {
                summary: `Grade distribution: A=${h.gradeDistribution.A || 0} B=${h.gradeDistribution.B || 0} C=${h.gradeDistribution.C || 0} D=${h.gradeDistribution.D || 0} F=${h.gradeDistribution.F || 0}`,
                data: {
                    gradeDistribution: h.gradeDistribution,
                    noSbom: h.noSbom,
                    archived: h.archived,
                    activityBuckets: h.activityBuckets
                }
            };
        },

        /** Vuln age analysis */
        vulnAge() {
            if (!currentIns) return { data: null, summary: 'No vuln age data.' };
            const va = currentIns.vulnAgeStats;
            return {
                summary: `${va.timeBombs.length} time bombs (C/H vulns >30d old), direct dwell median ${va.directDwellMedian !== null ? va.directDwellMedian + 'd' : 'N/A'}`,
                data: {
                    timeBombs: va.timeBombs.slice(0, 20),
                    directDwellMedian: va.directDwellMedian,
                    directDwellCount: va.directDwellCount,
                    ageBuckets: va.ageBuckets
                }
            };
        }
    };

    /* ---- Execute a function call from the AI ---- */
    function executeQuery(name, args) {
        const fn = DATA_QUERIES[name];
        if (!fn) return { error: `Unknown query: ${name}`, summary: '', data: null };
        try {
            return fn(args || {});
        } catch (e) {
            console.error('Query error:', e);
            return { error: e.message, summary: '', data: null };
        }
    }

    const QUERY_SBOM_SCHEMA = {
        type: 'object',
        properties: {
            type: {
                type: 'string',
                enum: ['overview', 'vulnerabilities', 'dependencies', 'repositories', 'licenses', 'eol', 'versionDrift', 'malware', 'techDebt', 'supplyChain', 'perRepo', 'hygiene', 'vulnAge'],
                description: 'The category of SBOM data to fetch'
            },
            filter: {
                type: 'string',
                description: 'Optional filter. For vulnerabilities: "critical" or "high". For repositories: "archived", "active", "no-sbom". For versionDrift: "major" or "minor". For dependencies/perRepo: a name to search for.'
            },
            limit: {
                type: 'number',
                description: 'Maximum items to return (default: 20, max: 100)',
                default: 20
            }
        },
        required: ['type']
    };

    const QUERY_SBOM_DESCRIPTION = 'Query SBOM analysis data. Call this to fetch any data you need to answer the user\'s question. Available data types: overview, vulnerabilities, dependencies, repositories, licenses, eol, versionDrift, malware, techDebt, supplyChain, perRepo, hygiene, vulnAge.';

    /* ---- Modern Prompt API tools (name/description/inputSchema/execute) ---- */
    function buildTools() {
        return [{
            name: 'query_sbom',
            description: QUERY_SBOM_DESCRIPTION,
            inputSchema: QUERY_SBOM_SCHEMA,
            async execute(args) {
                const a = args || {};
                const label = `query_sbom(${a.type}${a.filter ? ', filter: ' + a.filter : ''}${a.limit ? ', limit: ' + a.limit : ''})`;
                let item = null;
                try {
                    if (!activeToolPanel) beginToolPanel();
                    item = addToolCallItem(label);
                } catch (_) { /* DOM may not be ready during early probes */ }
                const result = executeQuery(a.type, a);
                try { completeToolCallItem(item, result); } catch (_) { /* ignore */ }
                return JSON.stringify(result);
            }
        }];
    }

    /* ---- Legacy functionDeclarations shape (older window.ai.languageModel) ---- */
    function buildFunctionDeclarations() {
        return [{
            name: 'query_sbom',
            description: QUERY_SBOM_DESCRIPTION,
            parameters: QUERY_SBOM_SCHEMA
        }];
    }

    /* ---- Check tools support ---- */
    async function checkToolsSupport() {
        try {
            if (!window.AiNano || !window.AiNano.isSupported()) {
                aiAvailable = false;
                toolsSupport = false;
                return 'unavailable';
            }
            const caps = await window.AiNano.getAvailability();
            if (caps.available === 'no') {
                aiAvailable = false;
                toolsSupport = false;
                return 'unavailable';
            }
            aiAvailable = true;
            toolsSupport = caps.supportsTools;
            return caps.available === 'readily' ? 'ready' : 'download';
        } catch (e) {
            console.warn('Tools check:', e);
            aiAvailable = false;
            return 'unavailable';
        }
    }

    /* ---- Create agent session with tools ---- */
    async function createAgentSession() {
        destroySession();
        if (!currentData || !aiAvailable) return false;

        // The app always pre-fetches query_sbom() results and injects them into the
        // user prompt. The model is a summarizer — native tool-calling is optional.
        const systemPrompt = `You are a supply-chain security analyst AI.

The application will provide authoritative SBOM query results (JSON) with each question.
Your job is to answer using ONLY those numbers.

RULES:
1. Cite specific counts, grades, and medians from the provided query results.
2. If something is not in the provided data, say it is not in the loaded analysis.
3. Never invent packages, CVEs, countries, or OpenSSL-style lookups.
4. Never emit tool_code, print(), query_sbom(), Python, or code fences.
5. Write clear executive language in 2–4 short paragraphs.`;

        // Prefer a tools-enabled session when the browser supports it; always fall
        // back to a plain session so pre-fetched-data answers still work.
        const attempts = [
            { tools: buildTools() },
            { tools: [{ functionDeclarations: buildFunctionDeclarations() }] },
            { tools: null }
        ];

        for (const opts of attempts) {
            try {
                const createOpts = {
                    systemPrompt,
                    temperature: 0.2,
                    topK: 15
                };
                if (opts.tools) createOpts.tools = opts.tools;
                aiSession = await window.AiNano.createSession(createOpts);
                if (!opts.tools) toolsSupport = false;
                return true;
            } catch (err) {
                console.warn('Agent session create attempt failed:', err);
                aiSession = null;
            }
        }

        return false;
    }

    function destroySession() {
        if (aiSession) {
            try { aiSession.destroy(); } catch (e) { /* ignore */ }
        }
        aiSession = null;
    }

    /* ================================================================== */
    /*  DATA LOADING                                                       */
    /* ================================================================== */

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
            console.error('Agent: load failed', err);
            selector.disabled = true;
            noData.classList.remove('d-none');
        }
    }

    async function loadAnalysis() {
        loading.classList.remove('d-none');
        content.classList.add('d-none');
        noData.classList.add('d-none');
        destroySession();

        const name = selector.value;
        let blob;
        if (!name || name === '') {
            blob = await storageManager.getCombinedData();
        } else {
            blob = await storageManager.loadAnalysisDataForOrganization(name);
        }

        if (!blob || !blob.data) {
            loading.classList.add('d-none');
            noData.classList.remove('d-none');
            return;
        }

        currentData = blob.data;
        currentIns  = Agg.buildInsights(currentData);
        await initAgent();
        loading.classList.add('d-none');
        content.classList.remove('d-none');
    }

    selector.addEventListener('change', loadAnalysis);

    /* ================================================================== */
    /*  UI                                                                 */
    /* ================================================================== */

    async function initAgent() {
        const aiStatus = await checkToolsSupport();

        // Session is required; native tool-calling is optional because we pre-fetch
        // query_sbom() results in-app and ask the model only to summarize them.
        let available = aiAvailable;
        if (available) {
            const ok = await createAgentSession();
            if (!ok) available = false;
        }

        let statusHtml = '';
        if (!available) {
            statusHtml = `<span class="dot unsupported"></span> AI not available`;
        } else if (aiStatus === 'ready') {
            statusHtml = `<span class="dot ready"></span> Gemini Nano <span class="ag-cap-badge">queries: app-driven</span>`;
        } else {
            statusHtml = `<span class="dot loading"></span> Gemini Nano (download on first use) <span class="ag-cap-badge">queries: app-driven</span>`;
        }

        const metrics = currentIns ? buildMetrics(currentIns) : '';
        const suggested = [
            'How is our overall security posture?',
            'List all critical vulnerabilities',
            'What EOL components are we running?',
            'Which repos have the worst SBOM quality?',
            'Give me an M&A due diligence summary',
            'What supply chain risks exist?',
            'How bad is our version drift?',
            'Which packages have the most vulns?'
        ];

        const html = `
            <div class="ag-header">
                <h2><i class="fas fa-microchip me-2"></i>SBOM Analyst Agent</h2>
                <div class="sub">AI queries your SBOM data on-demand via built-in tools</div>
            </div>
            <div class="ag-status">${statusHtml}</div>
            <div class="ag-toolbar">
                <select id="analysisSelector2" class="form-select">${selector.innerHTML}</select>
                <button class="btn btn-outline-secondary btn-sm btn-new" id="btnNewChat" ${!available ? 'disabled' : ''}><i class="fas fa-plus me-1"></i>New</button>
            </div>
            <div class="ag-metrics">${metrics}</div>
            ${!available ? `
                <div class="ag-unavailable">
                    <div class="icon"><i class="fas fa-robot"></i></div>
                    <h5>AI not available</h5>
                </div>` : ''}
            <div class="ag-layout" id="agentLayout" style="display:${available ? 'flex' : 'none'}">
                <div class="ag-messages" id="agMessages">
                    <div class="ag-empty" id="agEmpty">
                        <div class="icon"><i class="fas fa-database"></i></div>
                        <h5>Agent ready — data loaded</h5>
                        <p>Each question runs real SBOM queries first, then the on-device model summarizes the numbers.</p>
                    </div>
                </div>
                <div class="ag-suggestions" id="agSuggestions">
                    ${suggested.map(q => `<span class="ag-suggestion" data-q="${esc(q)}">${esc(q)}</span>`).join('')}
                </div>
                <div class="ag-input-wrap">
                    <input type="text" id="agInput" placeholder="Ask the agent..." autocomplete="off" ${!available ? 'disabled' : ''}>
                    <button type="button" id="agSend" ${!available ? 'disabled' : ''}><i class="fas fa-arrow-up"></i></button>
                </div>
            </div>`;

        safe(content, html);
        wireEvents();
    }

    function buildMetrics(ins) {
        const ch = ins.critHigh;
        const eol = ins.eolStats;
        const td = ins.techDebt;
        return `
            <div class="ag-metric"><div class="v">${ins.totalRepos}</div><div class="l">Repos</div></div>
            <div class="ag-metric"><div class="v">${ins.totalDeps}</div><div class="l">Deps</div></div>
            <div class="ag-metric"><div class="v" style="color:${ch.total > 0 ? 'var(--color-red)' : 'var(--color-green)'}">${ch.total}</div><div class="l">C+H Vulns</div></div>
            <div class="ag-metric"><div class="v" style="color:${eol.eolCount > 0 ? 'var(--color-red)' : 'var(--color-green)'}">${eol.eolCount}</div><div class="l">EOL</div></div>
            <div class="ag-metric"><div class="v" style="color:${td.score100 >= 55 ? 'var(--color-green)' : 'var(--color-red)'}">${td.grade}</div><div class="l">Grade</div></div>`;
    }

    function wireEvents() {
        const input = document.getElementById('agInput');
        const send  = document.getElementById('agSend');
        const newBtn = document.getElementById('btnNewChat');

        document.getElementById('analysisSelector2')?.addEventListener('change', function() {
            for (const opt of selector.options) { if (opt.value === this.value) { selector.value = this.value; break; } }
            loadAnalysis();
        });

        send?.addEventListener('click', () => sendMessage());
        input?.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
        newBtn?.addEventListener('click', startNewConversation);

        document.querySelectorAll('.ag-suggestion').forEach(el => {
            el.addEventListener('click', () => {
                if (input) { input.value = el.dataset.q; sendMessage(); }
            });
        });
    }

    /* ================================================================== */
    /*  AGENT LOOP                                                         */
    /* ================================================================== */

    async function sendMessage() {
        const input = document.getElementById('agInput');
        const send  = document.getElementById('agSend');
        const empty   = document.getElementById('agEmpty');
        const text = input?.value.trim();
        if (!text || isGenerating || !aiAvailable) return;

        // Lazily create the session if init skipped it or it was destroyed
        if (!aiSession) {
            const ok = await createAgentSession();
            if (!ok) {
                toolsSupport = false;
                await initAgent();
                return;
            }
        }

        input.value = '';
        input.disabled = true;
        if (send) send.disabled = true;
        isGenerating = true;
        if (empty) empty.style.display = 'none';

        addUserMsg(text);

        // Tool calls first (before summary); assistant bubble comes after queries finish.
        beginToolPanel();
        let thinkDiv = null;
        let thinkBubble = null;

        try {
            // App-driven queries: always fetch real SBOM slices first.
            // List-style questions ("List all critical vulnerabilities") get a
            // deterministic enumerated answer — Nano tends to narrate aggregates
            // instead of listing CVEs/packages when asked to summarize JSON.
            const queries = buildQueriesForQuestion(text);
            const gathered = [];
            for (const q of queries) {
                const label = q.filter ? `query_sbom(${q.type}, filter: ${q.filter})` : `query_sbom(${q.type})`;
                const item = addToolCallItem(label);
                const result = executeQuery(q.type, q);
                completeToolCallItem(item, result);
                gathered.push({ type: q.type, args: q, result });
            }
            collapseToolPanel();

            thinkDiv = addAssistantMsg('');
            thinkBubble = thinkDiv.querySelector('.bubble');

            let responseText = '';

            if (isListQuestion(text)) {
                safe(thinkBubble, '<span class="text-muted"><i class="fas fa-list me-2"></i>Building list from query results...</span>');
                scrollBottom();
                responseText = formatListAnswer(gathered, text);
            } else {
                let currentPrompt = buildDataPrompt(text, gathered);
                const MAX_TURNS = 3;
                let turn = 0;

                while (turn < MAX_TURNS) {
                    turn++;
                    safe(thinkBubble, turn === 1
                        ? '<span class="text-muted"><i class="fas fa-spinner fa-spin me-2"></i>Summarizing query results...</span>'
                        : `<span class="text-muted"><i class="fas fa-spinner fa-spin me-2"></i>Refining answer (turn ${turn})...</span>`);
                    scrollBottom();

                    const result = await aiSession.prompt(currentPrompt);
                    const resultStr = typeof result === 'string'
                        ? result
                        : (result?.text || (result ? JSON.stringify(result) : ''));

                    let fc = extractFunctionCall(result);
                    if (!fc && looksLikeToolDump(resultStr)) {
                        fc = parseTextToolCall(resultStr);
                    }

                    if (fc && fc.name === 'query_sbom') {
                        const args = normalizeQueryArgs(fc.args, text);
                        const already = gathered.some(g => g.type === args.type && (g.args?.filter || '') === (args.filter || ''));
                        if (!already) {
                            expandToolPanel();
                            const label = `query_sbom(${args.type}${args.filter ? ', filter: ' + args.filter : ''})`;
                            const item = addToolCallItem(label);
                            const qResult = executeQuery(args.type, args);
                            completeToolCallItem(item, qResult);
                            collapseToolPanel();
                            gathered.push({ type: args.type, args, result: qResult });
                            currentPrompt = buildDataPrompt(text, gathered);
                            continue;
                        }
                    }

                    if (looksLikeToolDump(resultStr) || looksLikeVagueAnswer(resultStr, text)) {
                        responseText = formatGatheredFallback(gathered, text);
                    } else {
                        responseText = resultStr;
                    }
                    break;
                }

                if (!responseText || looksLikeToolDump(responseText) || looksLikeVagueAnswer(responseText, text)) {
                    responseText = isListQuestion(text)
                        ? formatListAnswer(gathered, text)
                        : formatGatheredFallback(gathered, text);
                }
            }

            safe(thinkBubble, renderText(linkifyAnswerText(responseText || 'No response generated.')));

        } catch (err) {
            console.error('Agent error:', err);
            collapseToolPanel();
            if (!thinkBubble) {
                thinkDiv = addAssistantMsg('');
                thinkBubble = thinkDiv.querySelector('.bubble');
            }
            if (thinkBubble) {
                safe(thinkBubble, `<span class="text-danger"><i class="fas fa-exclamation-circle me-2"></i>${esc(err.message || 'Agent error')}</span>`);
            }
            // Try to recover session
            if (err.message?.includes('session') || err.message?.includes('context')) {
                destroySession();
                const ok = await createAgentSession();
                if (ok) addSystemMsg('Session re-created. Please try again.');
            }
        } finally {
            activeToolPanel = null;
        }

        if (input) input.disabled = false;
        if (send) send.disabled = false;
        isGenerating = false;
        input?.focus();
        scrollBottom();
    }

    const VALID_QUERY_TYPES = new Set([
        'overview', 'vulnerabilities', 'dependencies', 'repositories', 'licenses',
        'eol', 'versionDrift', 'malware', 'techDebt', 'supplyChain', 'perRepo',
        'hygiene', 'vulnAge'
    ]);

    /** True when the model emitted fake tool/Python syntax instead of an answer */
    function looksLikeToolDump(text) {
        if (typeof text !== 'string' || !text.trim()) return false;
        return /tool_code|function_call|print\s*\(\s*query_sbom|query_sbom\s*\(/i.test(text);
    }

    /** Infer a query_sbom type from the user's natural-language question */
    function inferQueryType(userText) {
        const t = (userText || '').toLowerCase();
        if (/supply\s*chain|red\s*flag|malware|dep(?:endency)?\s*confusion|unpinned/.test(t)) return 'supplyChain';
        if (/vulnerab|cve|crit(?:ical)?|severity/.test(t)) return 'vulnerabilities';
        if (/eol|end[\s-]?of[\s-]?life|end[\s-]?of[\s-]?support/.test(t)) return 'eol';
        if (/license|copyleft|compliance/.test(t)) return 'licenses';
        if (/drift|outdated|stale|major\s+update/.test(t)) return 'versionDrift';
        if (/hygiene|sbom\s*qual|archived/.test(t)) return 'hygiene';
        if (/tech[-\s]?debt|health\s*score|grade/.test(t)) return 'techDebt';
        if (/dwell|time\s*bomb|vuln\s*age/.test(t)) return 'vulnAge';
        if (/per[-\s]?repo|which\s+repos|worst\s+repo/.test(t)) return 'perRepo';
        if (/\brepos?\b/.test(t)) return 'repositories';
        if (/dependenc/.test(t)) return 'dependencies';
        if (/overview|overall|posture|how\s+.*(doing|we)/.test(t)) return 'overview';
        if (/m&a|due\s*diligence|diligence/.test(t)) return 'overview';
        return 'overview';
    }

    /** Parse "top 5" / "first 10" / "5 critical vulnerabilities" into a capped limit */
    function extractLimit(userText) {
        const t = userText || '';
        const m = t.match(/\b(?:top|first)\s+(\d{1,3})\b/i)
            || t.match(/\b(?:show|give|list|name)\s+(?:me\s+)?(\d{1,3})\b/i)
            || t.match(/\b(\d{1,3})\s+(?:critical|high|medium|low)?\s*(?:vulnerabilit|cve|ghsa|package|eol|repos?)/i);
        if (!m) return null;
        const n = parseInt(m[1], 10);
        if (!Number.isFinite(n) || n < 1) return null;
        return Math.min(n, 100);
    }

    function isListQuestion(userText) {
        const t = userText || '';
        if (/\b(list|enumerate|show\s+(?:me\s+)?all|name\s+all|which\s+packages|what\s+are\s+the|most\s+vulns?)\b/i.test(t)) {
            return true;
        }
        // "top 5 …", "first 10 …", "5 critical vulnerabilities"
        if (extractLimit(t) != null) return true;
        // "give/show me the critical vulnerabilities" — but not summary/overview asks
        if (/\b(?:give|show)\s+me\b/i.test(t)
            && !/\b(summary|overview|diligence|posture|assessment|grade)\b/i.test(t)) {
            return true;
        }
        return false;
    }

    function extractSeverityFilter(userText) {
        const t = (userText || '').toLowerCase();
        if (/\bcritical\b/.test(t)) return 'critical';
        if (/\bhigh\b/.test(t)) return 'high';
        if (/\bmedium\b|\bmoderate\b/.test(t)) return 'medium';
        if (/\blow\b/.test(t)) return 'low';
        return '';
    }

    /**
     * Build concrete query_sbom calls (type + filter/limit) for a question.
     * List questions get a focused filtered query — not a grab-bag of techDebt/vulnAge.
     */
    function buildQueriesForQuestion(userText) {
        const primary = inferQueryType(userText) || 'overview';
        const sev = extractSeverityFilter(userText);
        const list = isListQuestion(userText);
        const askedLimit = extractLimit(userText);

        if (primary === 'vulnerabilities') {
            return [{
                type: 'vulnerabilities',
                filter: sev || undefined,
                limit: askedLimit || (list ? 100 : 40)
            }];
        }

        if (list && (primary === 'eol' || primary === 'dependencies' || primary === 'repositories' || primary === 'perRepo')) {
            return [{ type: primary, filter: sev || undefined, limit: askedLimit || 100 }];
        }

        const queries = [{ type: primary }];
        if (primary === 'supplyChain') {
            queries.push({ type: 'malware' }, { type: 'eol' });
        } else if (primary === 'overview') {
            queries.push({ type: 'techDebt' }, { type: 'supplyChain' }, { type: 'vulnerabilities', filter: 'critical', limit: 15 });
        } else if (primary === 'versionDrift') {
            queries.push({ type: 'eol' });
        }
        return queries;
    }

    /** Build the summarization prompt with authoritative query JSON */
    function buildDataPrompt(userText, gathered) {
        const blocks = gathered.map(g => {
            const summary = g.result?.summary || 'No summary.';
            // For large item lists, keep items but cap serialization noise
            let data = g.result?.data;
            if (data && Array.isArray(data.items) && data.items.length > 40) {
                data = { ...data, items: data.items.slice(0, 40), truncated: true };
            }
            const dataStr = data != null ? JSON.stringify(data) : 'null';
            return `### query_sbom("${g.type}")\nsummary: ${summary}\ndata: ${dataStr}`;
        }).join('\n\n');

        const listHint = isListQuestion(userText)
            ? '- This is a LIST question: enumerate the concrete items (package, version, vuln id, severity). Do not write a general essay.'
            : '- Write 2–4 short paragraphs in plain executive language.';

        return `USER QUESTION:
${userText}

SBOM QUERY RESULTS (authoritative — use these numbers only):
${blocks}

INSTRUCTIONS:
- Answer the question using ONLY the query results above.
- Cite specific packages / CVE or GHSA ids when items are present.
- If a detail is missing, say it is not in the loaded analysis.
- Do NOT invent packages, CVEs, or tool calls. No tool_code / print() / query_sbom().
${listHint}`;
    }

    /** Vague/hallucinated answers that ignore the provided query JSON */
    function looksLikeVagueAnswer(text, userText) {
        if (typeof text !== 'string' || !text.trim()) return true;
        const t = text.toLowerCase();
        const vague = /lots of data|data indicates|available (?:data|information) (?:suggests|indicates)|based on (?:the )?(?:available |provided )?data|cannot determine|insufficient data|as an ai|concerning number|prevalence of vulnerabilities/i.test(t);
        const hasDigit = /\d/.test(text);
        if (vague && !hasDigit) return true;
        if (text.trim().length < 40 && !hasDigit) return true;
        // List questions that never mention a package/CVE id are not helpful
        if (isListQuestion(userText) && inferQueryType(userText) === 'vulnerabilities') {
            if (!/(cve-|ghsa-|mal-)/i.test(text) && !/\b[\w.-]+@\d/.test(text)) return true;
        }
        return false;
    }

    /* ---- Deep-link helpers (deps / repos / authors / OSV) ---- */
    let entityIndexCache = null;
    let entityIndexDataRef = null;

    function analysisOrgParam() {
        return selector?.value || '';
    }

    function depsPackageUrl(packageName, version) {
        if (!packageName) return null;
        const params = new URLSearchParams();
        const org = analysisOrgParam();
        if (org) params.set('org', org);
        params.set('search', version ? `${packageName}@${version}` : packageName);
        return `deps.html?${params.toString()}`;
    }

    function reposUrl(repoKey) {
        if (!repoKey) return null;
        const params = new URLSearchParams();
        const org = analysisOrgParam();
        if (org) params.set('org', org);
        params.set('search', repoKey);
        return `repos.html?${params.toString()}`;
    }

    function authorsUrl(authorName) {
        if (!authorName) return null;
        const params = new URLSearchParams();
        params.set('search', authorName);
        return `authors.html?${params.toString()}`;
    }

    function osvUrl(vulnId) {
        if (!vulnId || !/^(GHSA|CVE|MAL)-/i.test(vulnId)) return null;
        return `https://osv.dev/vulnerability/${encodeURIComponent(vulnId)}`;
    }

    function mdLink(label, href) {
        return href ? `[${label}](${href})` : `**${label}**`;
    }

    function packageListLabel(packageName, version) {
        const label = version ? `${packageName}@${version}` : (packageName || 'unknown');
        return mdLink(label, depsPackageUrl(packageName, version));
    }

    function repoListLabel(repoKey) {
        return mdLink(repoKey, reposUrl(repoKey));
    }

    function authorListLabel(authorName) {
        return mdLink(authorName, authorsUrl(authorName));
    }

    function vulnIdLabel(vulnId) {
        if (!vulnId || vulnId === 'N/A') return '`N/A`';
        const href = osvUrl(vulnId);
        return href ? mdLink(vulnId, href) : `\`${vulnId}\``;
    }

    function getEntityIndex() {
        if (entityIndexDataRef === currentData && entityIndexCache) return entityIndexCache;

        const packagesByName = new Map(); // lower -> canonical name
        const packageVersions = new Map(); // lower name@version -> { name, version }
        const repos = new Map(); // lower owner/name -> canonical
        const authors = new Map(); // lower -> canonical

        const addPackage = (name, version) => {
            if (!name || typeof name !== 'string') return;
            packagesByName.set(name.toLowerCase(), name);
            if (version) {
                packageVersions.set(`${name}@${version}`.toLowerCase(), { name, version: String(version) });
            }
        };

        for (const d of currentData?.allDependencies || []) {
            addPackage(d.name, d.version);
        }
        for (const vd of currentData?.vulnerabilityAnalysis?.vulnerableDependencies || []) {
            addPackage(vd.name, vd.version);
        }
        for (const r of currentData?.allRepositories || []) {
            if (!r?.owner || !r?.name) continue;
            const key = `${r.owner}/${r.name}`;
            repos.set(key.toLowerCase(), key);
            // also allow bare repo name when unique enough — only full owner/name for safety
        }
        for (const a of currentData?.authorAnalysis?.authors || []) {
            const name = a.author || a.name;
            if (name) authors.set(String(name).toLowerCase(), String(name));
            // Compact refs may only carry authorKey "ecosystem:name"
            if (a.authorKey && String(a.authorKey).includes(':')) {
                const n = String(a.authorKey).split(':').slice(1).join(':');
                if (n) authors.set(n.toLowerCase(), n);
            }
        }

        entityIndexDataRef = currentData;
        entityIndexCache = { packagesByName, packageVersions, repos, authors };
        return entityIndexCache;
    }

    /**
     * Auto-link packages, repos, authors, and vuln IDs in any agent answer.
     * Protects existing markdown links / code spans; only links entities present
     * in the loaded analysis (plus OSV ids).
     */
    function linkifyAnswerText(text) {
        if (!text || typeof text !== 'string') return text || '';
        const index = getEntityIndex();
        const placeholders = [];
        const protect = (m) => {
            placeholders.push(m);
            return `\u0000L${placeholders.length - 1}\u0000`;
        };

        let s = text;
        s = s.replace(/\[[^\]]+\]\([^)]+\)/g, protect);
        s = s.replace(/`[^`]+`/g, protect);

        // name@version (incl. scoped @scope/name@version)
        s = s.replace(/(@?[\w.-]+(?:\/[\w.-]+)?)@(\d[\w.+-]*)/g, (full, name, version) => {
            const hit = index.packageVersions.get(`${name}@${version}`.toLowerCase());
            if (!hit) return full;
            return protect(packageListLabel(hit.name, hit.version));
        });

        // owner/repo
        s = s.replace(/\b([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\b/g, (full, key) => {
            const canonical = index.repos.get(key.toLowerCase());
            if (!canonical) return full;
            return protect(repoListLabel(canonical));
        });

        // GHSA / CVE / MAL ids
        s = s.replace(/\b((?:GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4})|(?:CVE-\d{4}-\d{4,})|(?:MAL-\d{4}-\d+))\b/gi, (full) => {
            const href = osvUrl(full);
            return href ? protect(mdLink(full, href)) : full;
        });

        // "quoted" package or author names
        s = s.replace(/"([^"\n]{2,120})"/g, (full, inner) => {
            const key = inner.toLowerCase();
            const verHit = index.packageVersions.get(key);
            if (verHit) return protect(`"${packageListLabel(verHit.name, verHit.version)}"`);
            const pkg = index.packagesByName.get(key);
            if (pkg) return protect(`"${packageListLabel(pkg, null)}"`);
            const author = index.authors.get(key);
            if (author) return protect(`"${authorListLabel(author)}"`);
            const repo = index.repos.get(key);
            if (repo) return protect(`"${repoListLabel(repo)}"`);
            return full;
        });

        s = s.replace(/\u0000L(\d+)\u0000/g, (_, i) => placeholders[Number(i)] || '');
        return s;
    }

    /** Deterministic bullet list for "list / top N / give me …" questions */
    function formatListAnswer(gathered, userText) {
        const askedLimit = extractLimit(userText);
        const vulnGathered = gathered.find(g => g.type === 'vulnerabilities');
        if (vulnGathered) {
            const allItems = vulnGathered.result?.data?.items || [];
            const items = askedLimit ? allItems.slice(0, askedLimit) : allItems;
            const filter = vulnGathered.args?.filter || extractSeverityFilter(userText) || 'matching';
            const matched = vulnGathered.result?.data?.matchedCount ?? allItems.length;
            if (!items.length) {
                return `No ${filter} vulnerabilities found in the loaded analysis.`;
            }
            const header = askedLimit
                ? `**Top ${items.length} ${filter} vulnerabilit${items.length === 1 ? 'y' : 'ies'}** (${matched} total in the loaded analysis):`
                : `**${matched} ${filter} vulnerabilit${matched === 1 ? 'y' : 'ies'}** in the loaded analysis (showing ${items.length}):`;
            const lines = [header, ''];
            items.forEach((it) => {
                lines.push(`- ${packageListLabel(it.package, it.version)} — ${vulnIdLabel(it.vulnId)} (${it.severity || 'UNKNOWN'})`);
            });
            if (!askedLimit && matched > items.length) {
                lines.push('');
                lines.push(`_…and ${matched - items.length} more not shown. Open the Vulns page for the full table._`);
            } else if (askedLimit && matched > items.length) {
                lines.push('');
                lines.push(`_${matched - items.length} more ${filter} vulnerabilities not shown._`);
            }
            return lines.join('\n');
        }

        // Generic list fallback for other query types that return items[]
        for (const g of gathered) {
            const allItems = g.result?.data?.items;
            if (!Array.isArray(allItems)) continue;
            if (!allItems.length) return `No ${g.type} items found in the loaded analysis.`;
            const items = (askedLimit ? allItems.slice(0, askedLimit) : allItems).slice(0, 100);
            const header = askedLimit
                ? `**Top ${items.length} ${g.type} item(s):**`
                : `**${allItems.length} ${g.type} item(s):**`;
            const lines = [header, ''];
            items.forEach((it) => {
                if (it.package) {
                    const vuln = it.vulnId ? ` — ${vulnIdLabel(it.vulnId)}` : '';
                    lines.push(`- ${packageListLabel(it.package, it.version)}${it.severity ? ' — ' + it.severity : ''}${vuln}`);
                } else if (it.repoKey || (it.owner && it.name)) {
                    const key = it.repoKey || `${it.owner}/${it.name}`;
                    const extra = [];
                    if (it.grade) extra.push(`grade ${it.grade}`);
                    if (it.critHighVulns != null) extra.push(`${it.critHighVulns} C+H vulns`);
                    if (it.totalDeps != null) extra.push(`${it.totalDeps} deps`);
                    if (it.archived) extra.push('archived');
                    lines.push(`- ${repoListLabel(key)}${extra.length ? ' — ' + extra.join(', ') : ''}`);
                } else if (it.author) {
                    lines.push(`- ${authorListLabel(it.author)}`);
                } else if (it.name && it.version) {
                    lines.push(`- ${packageListLabel(it.name, it.version)}${it.isEol ? ' — EOL' : ''}${it.isEos ? ' — EOS' : ''}`);
                } else if (it.name) {
                    lines.push(`- ${packageListLabel(it.name, null)}`);
                } else {
                    lines.push(`- \`${JSON.stringify(it)}\``);
                }
            });
            return lines.join('\n');
        }

        return formatGatheredFallback(gathered, userText);
    }

    /** Coerce model-invented args into a valid query_sbom payload */
    function normalizeQueryArgs(args, userText) {
        const a = { ...(args || {}) };
        if (!a.type && a.query) a.type = a.query;
        if (!a.type && a.category) a.type = a.category;
        if (!a.type && a.data_type) a.type = a.data_type;
        if (!a.type && a.dataType) a.type = a.dataType;
        if (typeof a.type === 'string') a.type = a.type.trim();
        if (a.type && !VALID_QUERY_TYPES.has(a.type)) {
            // e.g. model passed type="OpenSSL" — drop and infer from the question
            delete a.type;
        }
        // Invented package lookups are not supported; fall back to question heuristics
        if (!a.type && (a.package_name || a.package || a.version || a.platform)) {
            a.type = inferQueryType(userText) || 'overview';
        }
        if (!a.type) a.type = inferQueryType(userText) || 'overview';
        return a;
    }

    /**
     * Parse text-form tool invocations Nano sometimes emits, e.g.
     * ``tool_code print(query_sbom(package_name='OpenSSL', ...)) ``
     */
    function parseTextToolCall(text) {
        if (typeof text !== 'string') return null;
        let s = text.trim();
        s = s.replace(/^`{1,3}(?:tool_code|python|javascript|js)?\s*/i, '');
        s = s.replace(/`{1,3}\s*$/g, '').trim();

        const printWrapped = s.match(/print\s*\(\s*(query_sbom\s*\([\s\S]*\))\s*\)\s*;?\s*$/i);
        if (printWrapped) s = printWrapped[1];

        const call = s.match(/query_sbom\s*\(([\s\S]*)\)\s*;?\s*$/i)
            || text.match(/query_sbom\s*\(([\s\S]*?)\)/);
        if (!call) return null;

        const inner = call[1].trim();
        const args = {};

        if (inner.startsWith('{')) {
            try {
                Object.assign(args, JSON.parse(inner));
            } catch (_) { /* ignore */ }
        } else if (inner) {
            const kv = /(\w+)\s*=\s*(['"])(.*?)\2|(\w+)\s*=\s*(-?\d+(?:\.\d+)?)/g;
            let m;
            while ((m = kv.exec(inner)) !== null) {
                if (m[1]) args[m[1]] = m[3];
                else if (m[4]) args[m[4]] = Number(m[5]);
            }
            if (!Object.keys(args).length) {
                const positional = inner.match(/^(['"])(.*?)\1$/);
                if (positional) args.type = positional[2];
            }
        }

        return { name: 'query_sbom', args };
    }

    /** Deterministic summary when the model fails to use the provided query JSON */
    function formatGatheredFallback(gathered, userText) {
        const parts = [
            `Here are the SBOM query results for: "${userText}"`,
            '',
            'I could not produce a clean narrative summary, so here are the authoritative numbers from the loaded analysis:'
        ];
        for (const g of gathered) {
            const summary = g.result?.summary || 'No summary.';
            parts.push('');
            parts.push(`**${g.type}** — ${summary}`);
            if (g.result?.data && typeof g.result.data === 'object') {
                for (const [k, v] of Object.entries(g.result.data)) {
                    if (v !== null && typeof v !== 'object') {
                        parts.push(`- ${k}: ${v}`);
                    }
                }
            }
        }
        return parts.join('\n');
    }

    /** Extract function call from AI response — structured API shapes + text dumps */
    function extractFunctionCall(result) {
        if (!result) return null;

        // Shape 1: { functionCall: { name, args } }
        if (result.functionCall && result.functionCall.name) {
            return { name: result.functionCall.name, args: result.functionCall.args || {} };
        }
        // Shape 2: { functionCalls: [...] }
        if (result.functionCalls && result.functionCalls.length > 0) {
            const fc = result.functionCalls[0];
            return { name: fc.name, args: fc.args || fc.arguments || {} };
        }
        // Shape 2b: modern tool-call objects { name, arguments } / { toolCalls: [...] }
        if (result.name && (result.arguments || result.args)) {
            return { name: result.name, args: result.arguments || result.args || {} };
        }
        if (Array.isArray(result.toolCalls) && result.toolCalls.length > 0) {
            const tc = result.toolCalls[0];
            return { name: tc.name, args: tc.arguments || tc.args || {} };
        }
        // Shape 3: string JSON or text tool dump
        if (typeof result === 'string') {
            try {
                const parsed = JSON.parse(result);
                if (parsed && typeof parsed === 'object') {
                    return extractFunctionCall(parsed);
                }
            } catch (e) { /* not JSON */ }
            return parseTextToolCall(result);
        }
        return null;
    }

    async function startNewConversation() {
        if (isGenerating) return;
        const msgArea = document.getElementById('agMessages');
        const empty = document.getElementById('agEmpty');
        if (msgArea) { while (msgArea.firstChild) msgArea.removeChild(msgArea.firstChild); }
        if (empty) { empty.style.display = 'flex'; msgArea?.appendChild(empty); }
        destroySession();
        if (currentData && aiAvailable) {
            await createAgentSession();
        }
        document.getElementById('agInput')?.focus();
    }

    /* ---- Message helpers ---- */
    function addUserMsg(text) {
        const area = document.getElementById('agMessages');
        const div = document.createElement('div');
        div.className = 'ag-msg user';
        div.innerHTML = `<div class="avatar"><i class="fas fa-user"></i></div><div class="bubble">${esc(text)}</div>`;
        area.appendChild(div);
        scrollBottom();
    }

    function addAssistantMsg(text) {
        const area = document.getElementById('agMessages');
        const div = document.createElement('div');
        div.className = 'ag-msg assistant';
        div.innerHTML = `<div class="avatar"><i class="fas fa-robot"></i></div><div class="bubble">${text || ''}</div>`;
        area.appendChild(div);
        scrollBottom();
        return div;
    }

    const TOOL_RESULT_MAX_CHARS = 12000;

    function formatToolResult(result) {
        let text;
        try {
            text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
        } catch (_) {
            text = String(result);
        }
        if (!text) return '(empty result)';
        if (text.length > TOOL_RESULT_MAX_CHARS) {
            return text.slice(0, TOOL_RESULT_MAX_CHARS) + '\n… (truncated)';
        }
        return text;
    }

    function updateToolPanelSummary() {
        if (!activeToolPanel) return;
        const count = activeToolPanel.queryCount || 0;
        const running = activeToolPanel.runningCount || 0;
        const labelEl = activeToolPanel.root.querySelector('.ag-tools-summary');
        if (!labelEl) return;
        if (running > 0) {
            labelEl.textContent = count === 1
                ? 'Running 1 query…'
                : `Running ${count} queries…`;
        } else {
            labelEl.textContent = count === 1
                ? '1 query · click to expand'
                : `${count} queries · click to expand`;
        }
    }

    function beginToolPanel() {
        const area = document.getElementById('agMessages');
        const div = document.createElement('div');
        div.className = 'ag-msg tool-calls';
        safe(div, `
            <div class="avatar"><i class="fas fa-database"></i></div>
            <div class="bubble ag-tools-panel">
                <button type="button" class="ag-tools-toggle" aria-expanded="true">
                    <span class="ag-tools-toggle-left">
                        <span class="ag-tool-chip">QUERIES</span>
                        <span class="ag-tools-summary">Running queries…</span>
                    </span>
                    <i class="fas fa-chevron-down ag-tools-chevron" aria-hidden="true"></i>
                </button>
                <div class="ag-tools-list"></div>
            </div>
        `);
        area.appendChild(div);

        const toggle = div.querySelector('.ag-tools-toggle');
        const list = div.querySelector('.ag-tools-list');
        toggle.addEventListener('click', () => {
            const open = toggle.getAttribute('aria-expanded') === 'true';
            toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
            list.classList.toggle('collapsed', open);
        });

        activeToolPanel = {
            root: div,
            list,
            toggle,
            queryCount: 0,
            runningCount: 0
        };
        scrollBottom();
        return activeToolPanel;
    }

    function expandToolPanel() {
        if (!activeToolPanel) beginToolPanel();
        const { toggle, list } = activeToolPanel;
        toggle.setAttribute('aria-expanded', 'true');
        list.classList.remove('collapsed');
    }

    function collapseToolPanel() {
        if (!activeToolPanel) return;
        const { toggle, list, root } = activeToolPanel;
        toggle.setAttribute('aria-expanded', 'false');
        list.classList.add('collapsed');
        root.querySelectorAll('.ag-tool-item').forEach(el => { el.open = false; });
        updateToolPanelSummary();
    }

    function addToolCallItem(label) {
        if (!activeToolPanel) beginToolPanel();
        expandToolPanel();

        const details = document.createElement('details');
        details.className = 'ag-tool-item';
        details.open = true;

        const summary = document.createElement('summary');
        summary.className = 'ag-tool-summary';
        safe(summary, `
            <span class="ag-tool-chip">QUERY</span>
            <span class="ag-tool-label">${esc(label)}</span>
            <span class="ag-tool-status running"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i></span>
        `);

        const pre = document.createElement('pre');
        pre.className = 'ag-tool-result';
        pre.textContent = 'Waiting for result…';

        details.appendChild(summary);
        details.appendChild(pre);
        activeToolPanel.list.appendChild(details);
        activeToolPanel.queryCount += 1;
        activeToolPanel.runningCount += 1;
        updateToolPanelSummary();
        scrollBottom();
        return details;
    }

    function completeToolCallItem(itemEl, result) {
        if (!itemEl) return;
        const status = itemEl.querySelector('.ag-tool-status');
        if (status) {
            status.classList.remove('running');
            status.classList.add('done');
            safe(status, '<i class="fas fa-check" aria-hidden="true"></i>');
        }
        const pre = itemEl.querySelector('.ag-tool-result');
        if (pre) pre.textContent = formatToolResult(result);
        itemEl.open = false;
        if (activeToolPanel && activeToolPanel.runningCount > 0) {
            activeToolPanel.runningCount -= 1;
        }
        updateToolPanelSummary();
    }

    function addSystemMsg(text) {
        const area = document.getElementById('agMessages');
        const div = document.createElement('div');
        div.className = 'ag-msg tool-call';
        safe(div, `<div class="avatar"><i class="fas fa-info-circle"></i></div><div class="bubble">${text}</div>`);
        area.appendChild(div);
        scrollBottom();
    }

    function scrollBottom() {
        const area = document.getElementById('agMessages');
        if (area) area.scrollTop = area.scrollHeight;
    }

    /* ---- Text renderer ---- */
    function renderMdLink(label, url) {
        if (/^(deps|repos|authors)\.html\?[^\s"'<>]*$/i.test(url)) {
            return `<a class="ag-entity-link" href="${url}">${label}</a>`;
        }
        // OSV advisory deep-links (GHSA / CVE / MAL) — external
        if (/^https:\/\/osv\.dev\/vulnerability\/[A-Za-z0-9_%.-]+$/i.test(url)) {
            return `<a class="ag-entity-link" href="${url}" target="_blank" rel="noreferrer noopener">${label}</a>`;
        }
        return `[${label}](${url})`;
    }

    function renderText(text) {
        if (!text) return '';
        let html = esc(text);
        // Markdown links — only agent-built deep-links (relative pages + OSV)
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => renderMdLink(label, url));
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        html = html.replace(/(^|[\s(])_([^_\n]+)_([\s).,]|$)/g, '$1<em>$2</em>$3');
        html = html.replace(/^[\*\-] (.+)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
        html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');
        html = html.replace(/\n\n+/g, '</p><p>');
        html = html.replace(/^(.+)$/gm, (m) => {
            if (m.startsWith('<') || m.startsWith('</') || m.trim() === '') return m;
            if (m.includes('<h') || m.includes('<li') || m.includes('<ul') || m.includes('</ul>')) return m;
            return m;
        });
        if (!html.startsWith('<')) html = '<p>' + html + '</p>';
        html = html.replace(/<\/p>\s*<p>/g, '</p><p>');
        return html;
    }

    /* ---- Start ---- */
    await loadAnalysesList();

})();
