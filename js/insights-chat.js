/**
 * AI Chat (insights-chat.js) — conversational interface with Gemini Nano.
 * Multi-turn chat where the AI has full access to your SBOM analysis data.
 * All processing on-device — no data leaves your browser.
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
    let currentInsights = null;
    let aiSession = null;
    let aiAvailable = false;
    let aiDownloading = false;
    let isGenerating = false;
    let messageCount = 0;
    const MAX_MESSAGES = 30;

    /* ---- Allow navigation to other insight pages ---- */
    const NAV_LINKS = {
        'Pulse': 'insights2.html',
        'Portfolio': 'insights3.html',
        'Report Card': 'insights4.html',
        'Snapshot': 'insights5.html',
        'AI Reports': 'insights-ai.html'
    };

    /* ---- Bootstrap ---- */
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
            console.error('Chat: load failed', err);
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
        await initChat();
        loading.classList.add('d-none');
        content.classList.remove('d-none');
    }

    selector.addEventListener('change', loadAnalysis);

    /* ---- AI Availability ---- */
    async function checkAi() {
        try {
            if (window.ai && window.ai.languageModel) {
                const caps = await window.ai.languageModel.capabilities();
                if (caps.available === 'readily') {
                    aiAvailable = true;
                    return 'ready';
                } else if (caps.available === 'after-download') {
                    aiAvailable = true;
                    aiDownloading = true;
                    return 'download';
                } else {
                    aiAvailable = false;
                    return 'unavailable';
                }
            }
            aiAvailable = false;
            return 'unavailable';
        } catch (e) {
            console.warn('Chat AI check:', e);
            aiAvailable = false;
            return 'unavailable';
        }
    }

    /* ---- Build context data for AI ---- */
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

        const oldDepsPct = ins.totalDeps > 0
            ? Math.round(age.buckets.filter(b => b.maxMonths >= 24).reduce((s, b) => s + b.total, 0) / ins.totalDeps * 100)
            : 0;

        const avgGrade = ins.totalRepos > 0
            ? Object.entries(hyg.gradeDistribution)
                .reduce((s, [g, c]) => s + ({ A: 4, B: 3, C: 2, D: 1, F: 0 }[g] || 0) * c, 0) / ins.totalRepos
            : 0;

        const topLangs = ins.languageStats.slice(0, 5).map(l => `${l.language} (${l.count} refs)`).join(', ');

        // Build a clean, readable text summary for the AI
        return `ORGANIZATION SBOM ANALYSIS SUMMARY
=====================================

OVERVIEW
- Repositories analyzed: ${ins.totalRepos} (${ins.reposWithSbom} with SBOMs, ${ins.totalRepos - ins.reposWithSbom} without)
- Total dependencies: ${ins.totalDeps} (${ins.directCount} direct, ${ins.transitiveCount} transitive)
- Top languages: ${topLangs || 'N/A'}

SECURITY
- Critical vulnerabilities: ${ch.critical}
- High vulnerabilities: ${ch.high}
- Total critical+high: ${ch.total}
- Direct-dep CVE dwell time (median): ${dw !== null ? dw + ' days' : 'N/A'}
- Malware advisories: ${sc.malwareCount}
- Dependency confusion risks: ${sc.depConfusionCount}

MAINTENANCE & FRESHNESS
- Tech-Health Grade: ${td.grade} (score ${td.score100}/100)
- EOL components: ${eol.eolCount}
- End-of-support components: ${eol.eosCount}
- Dependencies with major updates available: ${dr.buckets.major.total}
- Version drift coverage: ${dr.coveragePct}%
- Dependencies over 2 years old: ${oldDepsPct}%

LICENSE COMPLIANCE
- High-risk / copyleft licenses: ${lic.highRisk} (${lic.copyleft.direct} direct, ${lic.copyleft.transitive} transitive)
- Unknown licenses: ${lic.unknown.total}
- Unpinned GitHub Actions: ${sc.unpinnedActions}

REPOSITORY HYGIENE
- Active repos (pushed within 6mo): ${activeRepos}
- Archived repos: ${hyg.archived}
- Average SBOM grade (A=4..F=0): ${avgGrade.toFixed(1)}
- SBOM quality distribution: A=${hyg.gradeDistribution.A || 0} B=${hyg.gradeDistribution.B || 0} C=${hyg.gradeDistribution.C || 0} D=${hyg.gradeDistribution.D || 0} F=${hyg.gradeDistribution.F || 0}

TECH-DEBT COMPOSITION
- Overall health score: ${td.score100}/100 (Grade ${td.grade})
- Component weights: Version Drift 30%, Vulnerabilities 30%, Package Age 15%, License Risk 10%, EOL Risk 10%, Repo Hygiene 5%`;
    }

    /* ---- Session management ---- */
    async function createSession() {
        destroySession();

        if (!currentInsights || !aiAvailable) return null;

        const contextData = buildAiContext(currentInsights);

        const systemPrompt = `You are a supply-chain security analyst assistant. You have been given SBOM (Software Bill of Materials) analysis data for an organization. Your role is to help executives, CISO, and M&A professionals understand this data.

RULES:
1. Answer based ONLY on the data provided below. If asked about something not in the data, say so honestly.
2. Use plain, clear language suitable for non-technical executives.
3. Reference specific numbers from the data when relevant (e.g., "There are 12 critical vulnerabilities").
4. Be concise — aim for 2-3 paragraphs unless asked for detail.
5. When giving recommendations, be specific and actionable.
6. If the data shows no issues in an area, say so positively.
7. Do not make up statistics or claims not supported by the data.

HERE IS THE ORGANIZATION'S SBOM ANALYSIS DATA:

${contextData}

Start each response by addressing what was asked. If someone asks "how are we doing?", give an overall assessment. If they ask about a specific area, focus on that area using the data.`;

        try {
            // If download needed, trigger it
            if (aiDownloading) {
                aiSession = 'downloading'; // placeholder
            }

            aiSession = await window.ai.languageModel.create({
                systemPrompt: systemPrompt,
                temperature: 0.3,
                topK: 20
            });
            messageCount = 0;
            return aiSession;
        } catch (err) {
            console.error('Session creation failed:', err);
            aiSession = null;
            return null;
        }
    }

    function destroySession() {
        if (aiSession && typeof aiSession !== 'string') {
            try { aiSession.destroy(); } catch (e) { /* ignore */ }
        }
        aiSession = null;
        messageCount = 0;
    }

    /* ---- Chat UI ---- */
    async function initChat() {
        const aiStatus = await checkAi();

        let statusHtml = '';
        if (aiStatus === 'ready') {
            statusHtml = `<span class="dot ready"></span> Gemini Nano ready`;
        } else if (aiStatus === 'download') {
            statusHtml = `<span class="dot downloading"></span> Gemini Nano available (download on first message)`;
        } else {
            statusHtml = `<span class="dot unavailable"></span> Gemini Nano not available`;
        }

        const metrics = currentInsights ? buildMetricsHtml(currentInsights) : '';

        const unavailableHtml = !aiAvailable ? `
            <div class="chat-unavailable">
                <div class="icon"><i class="fas fa-robot"></i></div>
                <h5>AI Chat Unavailable</h5>
                <p class="text-muted">Chrome's built-in Gemini Nano is not available on this browser. You need Chrome 128+ with <code>chrome://flags/#prompt-api-for-gemini-nano</code> enabled.</p>
                <div class="mt-3 d-flex gap-2 justify-content-center flex-wrap">
                    <a href="insights2.html" class="btn btn-outline-primary btn-sm">Try Pulse Dashboard</a>
                    <a href="insights-ai.html" class="btn btn-outline-primary btn-sm">AI Reports</a>
                </div>
            </div>` : '';

        const suggestedQuestions = [
            'How is our org doing overall?',
            'What are our biggest security risks?',
            'Which vulnerabilities should we fix first?',
            'Give me an M&A due diligence summary',
            'How is our license compliance?',
            'What needs immediate attention?',
            'Are there any supply chain red flags?',
            'Which repos have the worst hygiene?'
        ];

        const chatHtml = `
            <div class="chat-header">
                <h2><i class="fas fa-comment-dots me-2"></i>SBOM Analyst Chat</h2>
                <div class="sub">Ask questions about your SBOM analysis — AI answers using your data</div>
            </div>
            <div class="chat-ai-status">${statusHtml}</div>
            <div class="chat-toolbar">
                <select id="analysisSelector2" class="form-select">
                    ${selector.innerHTML}
                </select>
                <button class="btn btn-outline-secondary btn-sm btn-new" id="btnNewChat" ${!aiAvailable ? 'disabled' : ''}>
                    <i class="fas fa-plus me-1"></i>New
                </button>
            </div>
            <div class="chat-metrics">${metrics}</div>
            ${unavailableHtml}
            <div class="chat-layout" id="chatLayout" style="display:${aiAvailable ? 'flex' : 'none'}">
                <div class="chat-messages" id="chatMessages">
                    <div class="chat-empty" id="chatEmpty">
                        <div class="icon"><i class="fas fa-comments"></i></div>
                        <h5>Ask about your SBOM data</h5>
                        <p>Try one of the suggested questions below, or type your own.</p>
                    </div>
                </div>
                <div class="chat-suggestions" id="chatSuggestions">
                    ${suggestedQuestions.map(q =>
                        `<span class="chat-suggestion" data-question="${esc(q)}">${esc(q)}</span>`
                    ).join('')}
                </div>
                <div class="chat-input-wrap">
                    <input type="text" id="chatInput" placeholder="Ask about your SBOM data..." autocomplete="off" ${!aiAvailable ? 'disabled' : ''}>
                    <button id="chatSend" ${!aiAvailable ? 'disabled' : ''}><i class="fas fa-arrow-up"></i></button>
                </div>
                <div class="chat-data-ref">AI responses based on loaded SBOM analysis data &middot; on-device processing</div>
            </div>`;

        safe(content, chatHtml);
        wireChatEvents();
    }

    /* ---- Compact metrics row ---- */
    function buildMetricsHtml(ins) {
        const td = ins.techDebt;
        const ch = ins.critHigh;
        const eol = ins.eolStats;
        const lic = ins.licenseStats;

        return `
            <div class="chat-metric"><div class="v">${ins.totalRepos}</div><div class="l">Repos</div></div>
            <div class="chat-metric"><div class="v">${ins.totalDeps}</div><div class="l">Deps</div></div>
            <div class="chat-metric"><div class="v" style="color:${ch.total > 0 ? 'var(--color-red)' : 'var(--color-green)'}">${ch.total}</div><div class="l">C+H Vulns</div></div>
            <div class="chat-metric"><div class="v" style="color:${eol.eolCount > 0 ? 'var(--color-red)' : 'var(--color-green)'}">${eol.eolCount}</div><div class="l">EOL</div></div>
            <div class="chat-metric"><div class="v" style="color:${lic.highRisk > 0 ? 'var(--color-yellow)' : 'var(--color-green)'}">${lic.highRisk}</div><div class="l">High-Risk Lic</div></div>
            <div class="chat-metric"><div class="v" style="color:${td.score100 >= 55 ? 'var(--color-green)' : 'var(--color-red)'}">${td.grade}</div><div class="l">Grade</div></div>
        `;
    }

    /* ---- Wire events ---- */
    function wireChatEvents() {
        const input = document.getElementById('chatInput');
        const sendBtn = document.getElementById('chatSend');
        const newBtn = document.getElementById('btnNewChat');
        const msgArea = document.getElementById('chatMessages');

        // Secondary selector
        const sel2 = document.getElementById('analysisSelector2');
        if (sel2) {
            sel2.addEventListener('change', () => {
                // Sync main selector
                for (const opt of selector.options) {
                    if (opt.value === sel2.value) {
                        selector.value = sel2.value;
                        break;
                    }
                }
                loadAnalysis();
            });
        }

        if (sendBtn) {
            sendBtn.addEventListener('click', () => sendMessage());
        }
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });
        }
        if (newBtn) {
            newBtn.addEventListener('click', () => startNewChat());
        }

        // Suggested questions
        document.querySelectorAll('.chat-suggestion').forEach(el => {
            el.addEventListener('click', () => {
                const q = el.dataset.question;
                if (q && input) {
                    input.value = q;
                    sendMessage();
                }
            });
        });
    }

    /* ---- Send message ---- */
    async function sendMessage() {
        const input = document.getElementById('chatInput');
        const sendBtn = document.getElementById('chatSend');
        const msgArea = document.getElementById('chatMessages');
        const empty = document.getElementById('chatEmpty');
        const text = input?.value.trim();

        if (!text || isGenerating || !aiAvailable) return;

        // Reset suggest selection highlight
        document.querySelectorAll('.chat-suggestion').forEach(el => el.style.opacity = '0.4');

        // Ensure session exists
        if (!aiSession || aiSession === 'downloading') {
            // Show waiting
            addSystemMessage('Initializing AI session...');
            const session = await createSession();
            if (!session) {
                addSystemMessage('Failed to create AI session. Please try again.');
                return;
            }
            // Remove the system message
            const sysMsg = document.getElementById('sys-init-msg');
            if (sysMsg) sysMsg.remove();
        }

        input.value = '';
        input.disabled = true;
        sendBtn.disabled = true;
        isGenerating = true;

        if (empty) empty.style.display = 'none';

        // Add user message
        addUserMessage(text);

        // Add AI placeholder
        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-msg assistant';
        msgDiv.innerHTML = `
            <div class="avatar"><i class="fas fa-robot"></i></div>
            <div class="bubble" id="aiResponse"><span class="chat-cursor"></span></div>`;
        msgArea.appendChild(msgDiv);
        scrollToBottom();

        const bubble = document.getElementById('aiResponse');

        try {
            const stream = await aiSession.promptStreaming(text);
            let fullText = '';
            for await (const chunk of stream) {
                fullText = chunk;
                bubble.innerHTML = renderChatText(fullText) + '<span class="chat-cursor"></span>';
                scrollToBottom();
            }
            bubble.innerHTML = renderChatText(fullText);

            messageCount++;

            // Warn if approaching limit
            if (messageCount >= MAX_MESSAGES - 5) {
                addSystemMessage(`Conversation getting long (${messageCount} exchanges). Consider starting a <a href="#" onclick="document.getElementById('btnNewChat')?.click();return false;" style="color:var(--color-blue);text-decoration:underline;">new conversation</a> for best quality.`);
            }
        } catch (err) {
            console.error('Chat error:', err);
            if (err.name === 'AbortError' || err.message?.includes('abort')) {
                bubble.innerHTML = '<span class="text-muted">Generation cancelled.</span>';
            } else {
                bubble.innerHTML = `<span class="text-danger"><i class="fas fa-exclamation-circle me-1"></i>Error: ${esc(err.message || 'Unknown')}</span>`;
                // Try to re-create session on error
                destroySession();
            }
        }

        input.disabled = false;
        sendBtn.disabled = false;
        isGenerating = false;
        input.focus();
        scrollToBottom();

        // Restore suggestion opacity
        document.querySelectorAll('.chat-suggestion').forEach(el => el.style.opacity = '');
    }

    /* ---- Start new conversation ---- */
    async function startNewChat() {
        if (isGenerating) return;

        const msgArea = document.getElementById('chatMessages');
        const empty = document.getElementById('chatEmpty');

        // Clear messages
        if (msgArea) {
            while (msgArea.firstChild) msgArea.removeChild(msgArea.firstChild);
            if (empty) {
                empty.style.display = 'flex';
                msgArea.appendChild(empty);
            }
        }

        destroySession();

        // Re-create session in background
        if (aiAvailable) {
            addSystemMessage('Starting new conversation...');
            const session = await createSession();
            if (session) {
                const sysMsg = document.getElementById('sys-init-msg');
                if (sysMsg) sysMsg.remove();
            }
        }

        document.getElementById('chatInput')?.focus();
    }

    /* ---- Message helpers ---- */
    function addUserMessage(text) {
        const msgArea = document.getElementById('chatMessages');
        const div = document.createElement('div');
        div.className = 'chat-msg user';
        div.innerHTML = `<div class="avatar"><i class="fas fa-user"></i></div><div class="bubble">${esc(text)}</div>`;
        msgArea.appendChild(div);
        scrollToBottom();
    }

    function addSystemMessage(text) {
        const msgArea = document.getElementById('chatMessages');
        const div = document.createElement('div');
        div.className = 'chat-msg system';
        div.id = text.includes('Initializing') ? 'sys-init-msg' : '';
        div.innerHTML = `<div class="avatar"><i class="fas fa-info-circle"></i></div><div class="bubble">${text}</div>`;
        msgArea.appendChild(div);
        scrollToBottom();
    }

    function scrollToBottom() {
        const msgArea = document.getElementById('chatMessages');
        if (msgArea) {
            msgArea.scrollTop = msgArea.scrollHeight;
        }
    }

    /* ---- Text renderer ---- */
    function renderChatText(text) {
        if (!text) return '';
        let html = esc(text);

        // Bold
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Bullet lists
        html = html.replace(/^[\*\-] (.+)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

        // Numbered lists
        html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');

        // Paragraphs
        html = html.replace(/\n\n+/g, '</p><p>');
        html = html.replace(/^(.+)$/gm, (m) => {
            if (m.startsWith('<') || m.startsWith('</') || m.trim() === '') return m;
            if (m.includes('<h') || m.includes('<li') || m.includes('<ul') || m.includes('</ul>')) return m;
            return m;
        });

        if (!html.startsWith('<')) {
            html = '<p>' + html + '</p>';
        }
        html = html.replace(/<\/p>\s*<p>/g, '</p><p>');

        return html;
    }

    /* ---- Start ---- */
    await loadAnalysesList();

})();
