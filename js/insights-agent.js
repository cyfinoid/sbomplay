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
            let deps = va.vulnerableDependencies || [];
            let totalCrit = va.criticalVulnerabilities || 0;
            let totalHigh = va.highVulnerabilities || 0;
            let totalMed  = va.mediumVulnerabilities || 0;

            // Build expanded list with vuln details
            let items = [];
            for (const vDep of deps) {
                for (const v of (vDep.vulnerabilities || [])) {
                    const sev = (v.severity || '').toUpperCase();
                    if (filter && !sev.includes(filter) && !(v.id || '').toLowerCase().includes(filter)) continue;
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

            const summary = `${totalCrit} critical, ${totalHigh} high, ${totalMed} medium vulnerabilities across ${deps.length} packages`;
            return { summary, data: { totalCrit, totalHigh, totalMed, totalPackages: deps.length, items: items.slice(0, limit) } };
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

    /* ---- Build function declarations for the Prompt API ---- */
    function buildFunctionDeclarations() {
        // We expose a SINGLE unified function with a 'type' enum.
        // This is simpler for the model and more reliable.
        return [{
            name: 'query_sbom',
            description: 'Query SBOM analysis data. Call this to fetch any data you need to answer the user\'s question. Available data types: overview, vulnerabilities, dependencies, repositories, licenses, eol, versionDrift, malware, techDebt, supplyChain, perRepo, hygiene, vulnAge.',
            parameters: {
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
            }
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

        try {
            const decls = buildFunctionDeclarations();

            aiSession = await window.AiNano.createSession({
                systemPrompt: `You are a supply-chain security analyst AI. You can query SBOM analysis data using the query_sbom() function whenever you need information.

RULES:
1. Use query_sbom() to fetch data — don't make up numbers.
2. Call query_sbom() with the appropriate type for what you need.
3. After receiving data, synthesize a clear answer for the user.
4. Use plain language suitable for executives and M&A professionals.
5. If you need more detail, call query_sbom() again with different parameters.
6. Be concise but thorough — reference specific numbers.`,
                tools: [{ functionDeclarations: decls }],
                temperature: 0.2,
                topK: 15
            });

            return true;
        } catch (err) {
            console.error('Agent session creation failed:', err);
            // If tools aren't supported, the create() might fail
            if (err.message && (err.message.includes('tools') || err.message.includes('function'))) {
                toolsSupport = false;
            }
            aiSession = null;
            return false;
        }
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

        let statusHtml = '';
        if (aiStatus === 'ready') {
            statusHtml = `<span class="dot ready"></span> Gemini Nano <span class="ag-cap-badge">tools: ${toolsSupport ? '✓' : '✗'}</span>`;
        } else if (aiStatus === 'download') {
            statusHtml = `<span class="dot loading"></span> Gemini Nano (download on first use) <span class="ag-cap-badge">tools: ${toolsSupport ? '✓' : '✗'}</span>`;
        } else {
            statusHtml = `<span class="dot unsupported"></span> Gemini Nano not available`;
        }

        const metrics = currentIns ? buildMetrics(currentIns) : '';
        const available = aiAvailable && toolsSupport;
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
            ${!aiAvailable ? `
                <div class="ag-unavailable">
                    <div class="icon"><i class="fas fa-robot"></i></div>
                    <h5>AI Agent Unavailable</h5>
                    <p class="text-muted">Chrome's built-in Gemini Nano is not available on this browser.</p>
                </div>` : !toolsSupport ? `
                <div class="ag-unavailable">
                    <div class="icon"><i class="fas fa-tools"></i></div>
                    <h5>Tool-Use Not Supported</h5>
                    <p class="text-muted">Your Chrome version doesn't support function calling in the Prompt API. Try the <a href="insights-chat.html">Chat</a> page instead (uses pre-digested context).</p>
                </div>` : ''}
            <div class="ag-layout" id="agentLayout" style="display:${available ? 'flex' : 'none'}">
                <div class="ag-messages" id="agMessages">
                    <div class="ag-empty" id="agEmpty">
                        <div class="icon"><i class="fas fa-database"></i></div>
                        <h5>Agent ready — data loaded</h5>
                        <p>The AI can query 12 data categories. Ask anything about your SBOM analysis.</p>
                    </div>
                </div>
                <div class="ag-suggestions" id="agSuggestions">
                    ${suggested.map(q => `<span class="ag-suggestion" data-q="${esc(q)}">${esc(q)}</span>`).join('')}
                </div>
                <div class="ag-input-wrap">
                    <input type="text" id="agInput" placeholder="Ask the agent..." autocomplete="off" ${!available ? 'disabled' : ''}>
                    <button id="agSend" ${!available ? 'disabled' : ''}><i class="fas fa-arrow-up"></i></button>
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
        const msgArea = document.getElementById('agMessages');
        const empty   = document.getElementById('agEmpty');
        const text = input?.value.trim();
        if (!text || isGenerating || !aiSession) return;

        input.value = '';
        input.disabled = true;
        send.disabled = true;
        isGenerating = true;
        if (empty) empty.style.display = 'none';

        addUserMsg(text);

        // Show thinking indicator
        const thinkDiv = addAssistantMsg('');
        const thinkBubble = thinkDiv.querySelector('.bubble');

        try {
            // Agent loop: handle AI ↔ function call turns
            let responseText = '';
            const MAX_TOOL_TURNS = 6;
            let turn = 0;
            let currentPrompt = text;

            while (turn < MAX_TOOL_TURNS) {
                turn++;
                thinkBubble.innerHTML = turn === 1
                    ? '<span class="text-muted"><i class="fas fa-spinner fa-spin me-2"></i>Thinking...</span>'
                    : `<span class="text-muted"><i class="fas fa-spinner fa-spin me-2"></i>Analyzing data (turn ${turn})...</span>`;
                scrollBottom();

                const result = await aiSession.prompt(currentPrompt);

                // Check if result is a function call
                const fc = extractFunctionCall(result);
                if (!fc) {
                    // Normal text response — we're done
                    responseText = typeof result === 'string' ? result : (result.text || JSON.stringify(result));
                    break;
                }

                // Log the function call
                addToolCallMsg(`query_sbom(${fc.args.type}${fc.args.filter ? ', filter: ' + fc.args.filter : ''}${fc.args.limit ? ', limit: ' + fc.args.limit : ''})`);

                // Execute the query
                thinkBubble.innerHTML = `<span class="text-muted"><i class="fas fa-database me-2"></i>Querying ${fc.args.type}...</span>`;
                scrollBottom();

                const queryResult = executeQuery(fc.args.type, fc.args);
                const resultStr = JSON.stringify(queryResult);

                // Feed result back — next loop turn
                currentPrompt = `Here is the data from query_sbom("${fc.args.type}"):\n${resultStr}\n\nUse this data to answer the user's question. If you need more data, call query_sbom() again.`;
            }

            if (turn >= MAX_TOOL_TURNS) {
                responseText = 'I\'ve reached the maximum number of queries for this response. Based on what I\'ve gathered so far, here\'s my analysis...';
            }

            // Stream the final response
            thinkBubble.innerHTML = '<span class="chat-cursor"></span>';
            try {
                const stream = await aiSession.promptStreaming(responseText);
                let full = '';
                for await (const chunk of stream) {
                    full = chunk;
                    thinkBubble.innerHTML = renderText(full) + '<span class="ag-cursor"></span>';
                    scrollBottom();
                }
                thinkBubble.innerHTML = renderText(full || responseText);
            } catch (e) {
                // If streaming fails, just show the text we already have
                thinkBubble.innerHTML = renderText(responseText);
            }

        } catch (err) {
            console.error('Agent error:', err);
            const bubble = document.querySelector('#agMessages .ag-msg.assistant:last-child .bubble');
            if (bubble) {
                bubble.innerHTML = `<span class="text-danger"><i class="fas fa-exclamation-circle me-2"></i>${esc(err.message || 'Agent error')}</span>`;
            }
            // Try to recover session
            if (err.message?.includes('session') || err.message?.includes('context')) {
                destroySession();
                const ok = await createAgentSession();
                if (ok) addSystemMsg('Session re-created. Please try again.');
            }
        }

        input.disabled = false;
        send.disabled = false;
        isGenerating = false;
        input?.focus();
        scrollBottom();
    }

    /** Extract function call from AI response — handles multiple API shapes */
    function extractFunctionCall(result) {
        if (!result) return null;

        // Shape 1: { functionCall: { name, args } }
        if (result.functionCall && result.functionCall.name) {
            return { name: result.functionCall.name, args: result.functionCall.args || {} };
        }
        // Shape 2: { functionCalls: [...] }
        if (result.functionCalls && result.functionCalls.length > 0) {
            const fc = result.functionCalls[0];
            return { name: fc.name, args: fc.args || {} };
        }
        // Shape 3: String containing a function call marker (fallback parsing)
        if (typeof result === 'string') {
            // Check if the response is JUST a function call (some API versions return it as text)
            try {
                const parsed = JSON.parse(result);
                if (parsed.functionCall || parsed.functionCalls) {
                    return extractFunctionCall(parsed);
                }
            } catch (e) { /* not JSON */ }
            return null;
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
        if (currentData && aiAvailable && toolsSupport) {
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

    function addToolCallMsg(label) {
        const area = document.getElementById('agMessages');
        const div = document.createElement('div');
        div.className = 'ag-msg tool-call';
        div.innerHTML = `<div class="avatar"><i class="fas fa-database"></i></div><div class="bubble"><span class="ag-tool-chip">QUERY</span> ${esc(label)}</div>`;
        area.appendChild(div);
        scrollBottom();
    }

    function addSystemMsg(text) {
        const area = document.getElementById('agMessages');
        const div = document.createElement('div');
        div.className = 'ag-msg tool-call';
        div.innerHTML = `<div class="avatar"><i class="fas fa-info-circle"></i></div><div class="bubble">${text}</div>`;
        area.appendChild(div);
        scrollBottom();
    }

    function scrollBottom() {
        const area = document.getElementById('agMessages');
        if (area) area.scrollTop = area.scrollHeight;
    }

    /* ---- Text renderer ---- */
    function renderText(text) {
        if (!text) return '';
        let html = esc(text);
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
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
