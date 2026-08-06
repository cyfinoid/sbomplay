/**
 * AiNano — shared adapter for Chrome on-device Gemini Nano (Prompt API).
 * Prefers the modern LanguageModel API; falls back to legacy window.ai.languageModel.
 * Streaming helpers yield cumulative text so callers can assign fullText = chunk safely.
 */
(function () {
    'use strict';

    function hasModernApi() {
        return typeof globalThis.LanguageModel !== 'undefined';
    }

    function hasLegacyApi() {
        return !!(window.ai && window.ai.languageModel);
    }

    /**
     * @returns {Promise<{ available: 'readily'|'after-download'|'no', supportsTools: boolean }>}
     */
    async function getAvailability() {
        if (hasModernApi()) {
            try {
                const state = await LanguageModel.availability();
                const supportsTools = state !== 'unavailable';
                if (state === 'available') {
                    return { available: 'readily', supportsTools };
                }
                if (state === 'downloadable' || state === 'downloading') {
                    return { available: 'after-download', supportsTools };
                }
                return { available: 'no', supportsTools: false };
            } catch (err) {
                console.warn('AiNano: LanguageModel.availability failed', err);
            }
        }

        if (hasLegacyApi()) {
            try {
                const caps = await window.ai.languageModel.capabilities();
                let available = 'no';
                if (caps.available === 'readily') {
                    available = 'readily';
                } else if (caps.available === 'after-download') {
                    available = 'after-download';
                }
                const supportsTools = caps.supportsTools !== undefined ? !!caps.supportsTools : true;
                return { available, supportsTools };
            } catch (err) {
                console.warn('AiNano: legacy capabilities failed', err);
            }
        }

        return { available: 'no', supportsTools: false };
    }

    /**
     * @param {object} opts
     * @param {string} [opts.systemPrompt]
     * @param {number} [opts.temperature]
     * @param {number} [opts.topK]
     * @param {object[]} [opts.tools]
     * @param {(loaded: number) => void} [opts.onDownloadProgress]
     */
    async function createSession(opts) {
        const options = opts || {};
        const systemPrompt = options.systemPrompt || '';
        const temperature = options.temperature;
        const topK = options.topK;
        const tools = options.tools;
        const onDownloadProgress = options.onDownloadProgress;

        if (hasModernApi()) {
            const createOptions = {
                initialPrompts: systemPrompt
                    ? [{ role: 'system', content: systemPrompt }]
                    : [],
                monitor(m) {
                    if (!onDownloadProgress || !m || !m.addEventListener) {
                        return;
                    }
                    m.addEventListener('downloadprogress', (e) => {
                        const loaded = typeof e.loaded === 'number' ? e.loaded : 0;
                        onDownloadProgress(loaded);
                    });
                }
            };
            if (temperature !== undefined) {
                createOptions.temperature = temperature;
            }
            if (topK !== undefined) {
                createOptions.topK = topK;
            }
            if (tools) {
                createOptions.tools = tools;
            }
            const session = await LanguageModel.create(createOptions);
            return wrapSession(session, 'modern');
        }

        if (hasLegacyApi()) {
            const legacyOpts = { systemPrompt, temperature, topK };
            if (tools) {
                legacyOpts.tools = tools;
            }
            const session = await window.ai.languageModel.create(legacyOpts);
            return wrapSession(session, 'legacy');
        }

        throw new Error('Prompt API not available');
    }

    function wrapSession(session, kind) {
        return {
            prompt(text) {
                return session.prompt(text);
            },
            async *promptStreaming(text) {
                const stream = await session.promptStreaming(text);
                let full = '';
                for await (const chunk of stream) {
                    const piece = typeof chunk === 'string' ? chunk : String(chunk ?? '');
                    if (kind === 'legacy') {
                        if (piece.length >= full.length && piece.startsWith(full)) {
                            full = piece;
                        } else {
                            full += piece;
                        }
                    } else {
                        full += piece;
                    }
                    yield full;
                }
            },
            destroy() {
                try {
                    session.destroy();
                } catch (_) {
                    /* ignore */
                }
            }
        };
    }

    function isSupported() {
        return hasModernApi() || hasLegacyApi();
    }

    window.AiNano = {
        getAvailability,
        createSession,
        isSupported
    };
})();
