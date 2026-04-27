/**
 * OPML Builder - Serializes a list of resolved dependency feeds into an
 * OPML 2.0 document that any feed reader (Feedly, NetNewsWire, Inoreader,
 * Thunderbird, Reeder, Miniflux, FreshRSS, etc.) can import directly.
 *
 * Outline structure:
 *   <opml version="2.0">
 *     <head>...</head>
 *     <body>
 *       <outline text="Direct dependencies">
 *         <outline text="PyPI">
 *           <outline type="rss" text="..." title="..." xmlUrl="..." htmlUrl="..."/>
 *           ...
 *         </outline>
 *         ...
 *       </outline>
 *       <outline text="Transitive dependencies">
 *         ...
 *       </outline>
 *     </body>
 *   </opml>
 *
 * A package that is both direct in repo A and transitive in repo B is listed
 * once under "Direct dependencies" (feed readers dedupe by xmlUrl regardless,
 * but this avoids a duplicated outline that imports a redundant subscription).
 *
 * Uncovered packages (no feed) are excluded from the OPML body but reported
 * via build() return value so callers can surface coverage info.
 */
console.log('🗂️ OPML Builder loaded');

class OPMLBuilder {
    constructor() {
        this.namespace = 'http://opml.org/spec2';
    }

    /**
     * Build an OPML 2.0 string.
     *
     * @param {Array<{dep: Object, feed: Object}>} entries - Output of
     *   FeedUrlBuilder.resolveAll(...).entries.
     * @param {Object} [options]
     * @param {string} [options.title] - OPML title (e.g., org or analysis name).
     * @param {string} [options.ownerName] - OPML <ownerName>.
     * @param {string} [options.ownerLink] - OPML <ownerLink>.
     * @returns {{ xml: string, included: number, skipped: number }}
     */
    build(entries, options = {}) {
        const title = options.title || 'SBOM Play - dependency feeds';
        const ownerName = options.ownerName || 'SBOM Play';
        const ownerLink = options.ownerLink || 'https://cyfinoid.github.io/sbomplay/';
        const dateCreated = new Date().toUTCString();

        const safeEntries = Array.isArray(entries) ? entries : [];

        // Bucket by direct/transitive (de-dupe by xmlUrl, preferring direct).
        const byUrl = new Map();
        for (const entry of safeEntries) {
            if (!entry || !entry.feed || entry.feed.status === 'uncovered') continue;
            if (!entry.feed.url) continue;
            const isDirect = this._isDirect(entry.dep);
            const existing = byUrl.get(entry.feed.url);
            if (!existing) {
                byUrl.set(entry.feed.url, { entry, isDirect });
            } else if (isDirect && !existing.isDirect) {
                byUrl.set(entry.feed.url, { entry, isDirect });
            }
        }

        const direct = [];
        const transitive = [];
        for (const value of byUrl.values()) {
            if (value.isDirect) direct.push(value.entry);
            else transitive.push(value.entry);
        }

        const directXml = this._buildSection('Direct dependencies', direct);
        const transitiveXml = this._buildSection('Transitive dependencies', transitive);

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>${this._xmlEscape(title)}</title>
    <dateCreated>${this._xmlEscape(dateCreated)}</dateCreated>
    <ownerName>${this._xmlEscape(ownerName)}</ownerName>
    <ownerLink>${this._xmlEscape(ownerLink)}</ownerLink>
    <docs>http://opml.org/spec2.opml</docs>
  </head>
  <body>
${directXml}
${transitiveXml}
  </body>
</opml>
`;

        return {
            xml,
            included: byUrl.size,
            skipped: safeEntries.length - byUrl.size
        };
    }

    /**
     * Convenience: build the OPML and trigger a browser download.
     * @param {Array} entries - FeedUrlBuilder.resolveAll(...).entries
     * @param {Object} options - Same as build(...) plus { filename }
     * @returns {{ included: number, skipped: number, filename: string }}
     */
    download(entries, options = {}) {
        const result = this.build(entries, options);
        const filename = (options.filename || 'sbomplay-feeds.opml').replace(/[\\/:*?"<>|]/g, '_');
        const blob = new Blob([result.xml], { type: 'application/xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        // Revoke after a brief delay so the browser has time to start the download.
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return { ...result, filename };
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    _buildSection(label, entries) {
        if (!entries.length) {
            return `    <outline text="${this._xmlEscape(label)}"/>`;
        }
        // Group by ecosystem within a section, ecosystem labels alphabetised.
        const byEcosystem = new Map();
        for (const entry of entries) {
            const eco = entry.feed.ecosystem || 'Unknown';
            if (!byEcosystem.has(eco)) byEcosystem.set(eco, []);
            byEcosystem.get(eco).push(entry);
        }
        const ecosystems = Array.from(byEcosystem.keys()).sort((a, b) => a.localeCompare(b));

        const ecosystemXml = ecosystems.map(eco => {
            const ecoEntries = byEcosystem.get(eco)
                .slice()
                .sort((a, b) => (a.dep.name || '').localeCompare(b.dep.name || ''));
            const outlines = ecoEntries.map(entry => this._buildLeafOutline(entry)).join('\n');
            return `      <outline text="${this._xmlEscape(eco)}">\n${outlines}\n      </outline>`;
        }).join('\n');

        return `    <outline text="${this._xmlEscape(label)}">\n${ecosystemXml}\n    </outline>`;
    }

    _buildLeafOutline(entry) {
        const { dep, feed } = entry;
        const name = dep.name || feed.title || 'unknown';
        const version = dep.version && dep.version !== 'unknown' ? dep.version : null;
        const sourceLabel = this._sourceLabel(feed.status);
        const textParts = [name];
        if (version) textParts.push(`(current ${version})`);
        if (sourceLabel) textParts.push(`– ${sourceLabel}`);
        const text = textParts.join(' ');
        const title = name;

        const attrs = [
            'type="rss"',
            `text="${this._xmlEscape(text)}"`,
            `title="${this._xmlEscape(title)}"`,
            `xmlUrl="${this._xmlEscape(feed.url)}"`,
        ];
        if (feed.htmlUrl) {
            attrs.push(`htmlUrl="${this._xmlEscape(feed.htmlUrl)}"`);
        }
        if (dep.ecosystem) {
            attrs.push(`category="${this._xmlEscape(dep.ecosystem)}"`);
        }
        return `        <outline ${attrs.join(' ')}/>`;
    }

    _sourceLabel(status) {
        switch (status) {
            case 'native': return 'native registry feed';
            case 'github-releases': return 'GitHub Releases';
            case 'github-tags': return 'GitHub Tags';
            default: return null;
        }
    }

    _isDirect(dep) {
        if (!dep) return false;
        if (dep.type === 'direct') return true;
        if (dep.type === 'transitive') return false;
        if (Array.isArray(dep.directIn) && dep.directIn.length > 0) return true;
        return false;
    }

    /**
     * Escape XML special chars. Keep this strict — OPML readers vary in how
     * forgiving they are with raw `&`, `<`, `>`, quotes, control chars.
     */
    _xmlEscape(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;')
            // Strip control chars that are illegal in XML 1.0 (except \t, \n, \r).
            .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
    }
}

window.OPMLBuilder = OPMLBuilder;
window.opmlBuilder = new OPMLBuilder();
