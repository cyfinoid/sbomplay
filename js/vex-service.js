/**
 * VEX/VDR Service — parses user-supplied VEX documents and matches them
 * against dependency coordinates produced by `sbom-processor`.
 *
 * Supported input formats (auto-detected by parseDocument):
 *   - CycloneDX VEX 1.4/1.5 (`bomFormat === 'CycloneDX'` with `vulnerabilities[]`)
 *   - OpenVEX 0.2.0 (`@context` containing 'openvex' or `statements[]`)
 *   - CSAF 2.0 (`document.csaf_version` or `vulnerabilities[].product_status`)
 *
 * The service is deliberately read-only over user input. We never delete OSV
 * findings; we annotate them with the VEX status so the user retains full
 * provenance and can flip the suppression toggle without re-running enrichment.
 *
 * Identifier matching, per the plan:
 *   matchByPurl   — strict scheme://type/namespace/name@version equality, with
 *                   namespace + version optional on either side.
 *   matchByBomRef — CycloneDX bom-ref equality.
 *   matchByHash   — match against any algorithm/value pair on the dep.
 *
 * Matching is intentionally permissive on the dep side and strict on the
 * statement side, because users typically generate VEX with full PURLs but
 * SBOMs frequently lack one of {namespace, version, qualifiers}.
 */
class VexService {
    constructor() {
        // Statuses we accept downstream — anything else maps to 'unknown' so
        // the UI never displays a free-form vendor extension as an
        // authoritative status.
        this.knownStatuses = new Set([
            'affected', 'not_affected', 'fixed', 'under_investigation'
        ]);
    }

    /**
     * Parse a VEX document. Accepts either a parsed object or a raw JSON
     * string. Returns `{ format, statements, raw, vexId }` or throws on
     * unrecognized format.
     */
    parseDocument(input, options = {}) {
        const filename = options.filename || null;
        let doc = input;
        if (typeof input === 'string') {
            try {
                doc = JSON.parse(input);
            } catch (err) {
                throw new Error('VEX document is not valid JSON. XML CSAF is not yet supported in-browser; please convert to JSON first.');
            }
        }
        if (!doc || typeof doc !== 'object') {
            throw new Error('VEX document is empty or not an object.');
        }

        const format = this._detectFormat(doc);
        let statements = [];
        switch (format) {
            case 'cyclonedx-vex':
                statements = this._parseCycloneDxVex(doc);
                break;
            case 'openvex':
                statements = this._parseOpenVex(doc);
                break;
            case 'csaf':
                statements = this._parseCsaf(doc);
                break;
            default:
                throw new Error(`Unrecognized VEX format. Tried CycloneDX VEX, OpenVEX, and CSAF.`);
        }

        // Stable id derived from content so re-uploading the same file does
        // not double-count statements. Hash a canonical-ish JSON projection
        // (filename intentionally excluded so the same doc collapses across
        // renames).
        const vexId = this._computeVexId(doc, format);

        return {
            vexId,
            format,
            filename,
            statements,
            statementCount: statements.length,
            raw: doc,
            uploadedAt: new Date().toISOString()
        };
    }

    // ---------- format detection ----------

    _detectFormat(doc) {
        // CycloneDX VEX is a superset of CycloneDX BOM with a `vulnerabilities`
        // array. We check for the array because pure SBOMs share the same
        // `bomFormat` field but carry no vulnerabilities.
        if (doc.bomFormat === 'CycloneDX' && Array.isArray(doc.vulnerabilities)) {
            return 'cyclonedx-vex';
        }
        // OpenVEX: either an explicit @context or top-level statements array.
        const ctx = doc['@context'];
        const ctxString = Array.isArray(ctx) ? ctx.join(' ') : (typeof ctx === 'string' ? ctx : '');
        if (ctxString && ctxString.toLowerCase().includes('openvex')) {
            return 'openvex';
        }
        if (Array.isArray(doc.statements) && doc.statements.length > 0 && doc.statements[0].vulnerability) {
            return 'openvex';
        }
        // CSAF 2.0: `document.csaf_version` is the canonical marker.
        if (doc.document && (doc.document.csaf_version || doc.document.category)) {
            return 'csaf';
        }
        if (Array.isArray(doc.vulnerabilities) && doc.product_tree) {
            return 'csaf';
        }
        return null;
    }

    // ---------- CycloneDX VEX ----------

    _parseCycloneDxVex(doc) {
        const out = [];
        const vulns = Array.isArray(doc.vulnerabilities) ? doc.vulnerabilities : [];
        // CycloneDX optionally stores affected components in `metadata.component`
        // or in `components[]` so a statement with an empty `affects[]` can
        // still resolve to a single product.
        const fallbackComponents = this._collectCycloneDxComponents(doc);
        for (const v of vulns) {
            if (!v) continue;
            const vulnId = this._extractCycloneDxVulnId(v);
            if (!vulnId) continue;
            const analysis = v.analysis || {};
            const status = this._normalizeCycloneDxState(analysis.state);
            const justification = analysis.justification || null;
            const detail = analysis.detail || analysis.response || null;
            const affects = Array.isArray(v.affects) && v.affects.length > 0
                ? v.affects
                : fallbackComponents.map(c => ({ ref: c.bomRef }));
            for (const a of affects) {
                const identifiers = this._extractCycloneDxAffects(a, fallbackComponents);
                if (!identifiers) continue;
                out.push({
                    status,
                    vulnId,
                    justification,
                    impact: detail,
                    actionStatement: analysis.response ? this._joinResponses(analysis.response) : null,
                    identifiers,
                    source: 'cyclonedx-vex'
                });
            }
        }
        return out;
    }

    _extractCycloneDxVulnId(v) {
        if (typeof v.id === 'string' && v.id.trim()) return v.id.trim();
        if (v.source && typeof v.source.name === 'string' && typeof v.id === 'string') {
            return v.id.trim();
        }
        return null;
    }

    _normalizeCycloneDxState(state) {
        switch ((state || '').toLowerCase()) {
            case 'resolved':
            case 'resolved_with_pedigree':
            case 'fixed':
                return 'fixed';
            case 'not_affected':
            case 'false_positive':
                return 'not_affected';
            case 'in_triage':
            case 'in-triage':
            case 'under_investigation':
                return 'under_investigation';
            case 'exploitable':
            case 'affected':
                return 'affected';
            default:
                return 'unknown';
        }
    }

    _joinResponses(resp) {
        if (Array.isArray(resp)) return resp.join('; ');
        if (typeof resp === 'string') return resp;
        return null;
    }

    _collectCycloneDxComponents(doc) {
        const acc = [];
        const walk = (component) => {
            if (!component) return;
            const id = component['bom-ref'] || component.bomRef || null;
            const purl = component.purl || null;
            const hashes = Array.isArray(component.hashes) ? component.hashes : [];
            if (id || purl) acc.push({ bomRef: id, purl, hashes });
            if (Array.isArray(component.components)) {
                component.components.forEach(walk);
            }
        };
        if (doc.metadata && doc.metadata.component) walk(doc.metadata.component);
        if (Array.isArray(doc.components)) doc.components.forEach(walk);
        return acc;
    }

    _extractCycloneDxAffects(affects, components) {
        if (!affects) return null;
        const ref = affects.ref || affects['bom-ref'] || null;
        const matched = ref ? components.find(c => c.bomRef === ref) : null;
        return {
            purl: matched && matched.purl ? matched.purl : (affects.purl || null),
            cpe: affects.cpe || null,
            hashes: matched ? matched.hashes : null,
            bomRef: ref
        };
    }

    // ---------- OpenVEX ----------

    _parseOpenVex(doc) {
        const out = [];
        const statements = Array.isArray(doc.statements) ? doc.statements : [];
        for (const s of statements) {
            if (!s) continue;
            const vulnId = this._extractOpenVexVulnId(s);
            if (!vulnId) continue;
            const status = this._normalizeOpenVexStatus(s.status);
            const products = Array.isArray(s.products) && s.products.length > 0 ? s.products : [];
            // OpenVEX requires at least one product; a malformed statement
            // with no products is still recorded so the unmatched-statements
            // panel can flag it for the user.
            if (products.length === 0) {
                out.push({
                    status, vulnId,
                    justification: s.justification || null,
                    impact: s.impact_statement || null,
                    actionStatement: s.action_statement || null,
                    identifiers: { purl: null, cpe: null, hashes: null, bomRef: null },
                    source: 'openvex'
                });
                continue;
            }
            for (const p of products) {
                out.push({
                    status,
                    vulnId,
                    justification: s.justification || null,
                    impact: s.impact_statement || null,
                    actionStatement: s.action_statement || null,
                    identifiers: this._extractOpenVexIdentifiers(p),
                    source: 'openvex'
                });
            }
        }
        return out;
    }

    _extractOpenVexVulnId(s) {
        if (s.vulnerability && typeof s.vulnerability === 'object') {
            return s.vulnerability['@id'] || s.vulnerability.id || s.vulnerability.name || null;
        }
        if (typeof s.vulnerability === 'string') return s.vulnerability;
        return null;
    }

    _normalizeOpenVexStatus(status) {
        const lower = (status || '').toLowerCase();
        if (lower === 'not_affected' || lower === 'affected' || lower === 'fixed' || lower === 'under_investigation') {
            return lower;
        }
        return 'unknown';
    }

    _extractOpenVexIdentifiers(product) {
        if (!product) return { purl: null, cpe: null, hashes: null, bomRef: null };
        if (typeof product === 'string') {
            return this._classifyIdentifierString(product);
        }
        const id = product['@id'] || product.id || null;
        const subId = product.subcomponents ? null : id;
        const idents = subId ? this._classifyIdentifierString(subId) : { purl: null, cpe: null, hashes: null, bomRef: null };
        if (Array.isArray(product.identifiers)) {
            product.identifiers.forEach(i => {
                const c = this._classifyIdentifierString(i);
                if (c.purl) idents.purl = idents.purl || c.purl;
                if (c.cpe) idents.cpe = idents.cpe || c.cpe;
            });
        }
        const hashes = Array.isArray(product.hashes) ? product.hashes : null;
        if (hashes) idents.hashes = hashes;
        return idents;
    }

    _classifyIdentifierString(str) {
        const out = { purl: null, cpe: null, hashes: null, bomRef: null };
        if (!str || typeof str !== 'string') return out;
        if (str.startsWith('pkg:')) out.purl = str;
        else if (str.startsWith('cpe:')) out.cpe = str;
        else out.bomRef = str;
        return out;
    }

    // ---------- CSAF 2.0 ----------

    _parseCsaf(doc) {
        const out = [];
        const vulns = Array.isArray(doc.vulnerabilities) ? doc.vulnerabilities : [];
        const productMap = this._buildCsafProductMap(doc);
        for (const v of vulns) {
            if (!v) continue;
            const vulnId = (v.cve || (v.ids && v.ids[0] && v.ids[0].text) || null);
            if (!vulnId) continue;
            const ps = v.product_status || {};
            const flags = v.flags || [];
            const remediations = Array.isArray(v.remediations) ? v.remediations : [];
            // product_status keys map to canonical statuses one-to-many.
            this._csafEmit(out, vulnId, 'fixed', ps.fixed, productMap, v.threats, flags, remediations);
            this._csafEmit(out, vulnId, 'fixed', ps.first_fixed, productMap, v.threats, flags, remediations);
            this._csafEmit(out, vulnId, 'not_affected', ps.known_not_affected, productMap, v.threats, flags, remediations);
            this._csafEmit(out, vulnId, 'affected', ps.known_affected, productMap, v.threats, flags, remediations);
            this._csafEmit(out, vulnId, 'affected', ps.first_affected, productMap, v.threats, flags, remediations);
            this._csafEmit(out, vulnId, 'under_investigation', ps.under_investigation, productMap, v.threats, flags, remediations);
        }
        return out;
    }

    _csafEmit(out, vulnId, status, productIds, productMap, threats, flags, remediations) {
        if (!Array.isArray(productIds)) return;
        const justification = (flags && flags[0] && flags[0].label) || null;
        const impact = (threats && threats[0] && threats[0].details) || null;
        const action = (remediations && remediations[0] && remediations[0].details) || null;
        for (const pid of productIds) {
            const ident = productMap.get(pid) || { purl: null, cpe: null, hashes: null, bomRef: pid };
            out.push({
                status,
                vulnId,
                justification,
                impact,
                actionStatement: action,
                identifiers: ident,
                source: 'csaf'
            });
        }
    }

    _buildCsafProductMap(doc) {
        const map = new Map();
        const tree = doc.product_tree;
        if (!tree) return map;
        const walk = (branches) => {
            if (!Array.isArray(branches)) return;
            for (const b of branches) {
                if (b.product) {
                    const pid = b.product.product_id;
                    const helpers = (b.product.product_identification_helper) || {};
                    map.set(pid, {
                        purl: helpers.purl || null,
                        cpe: helpers.cpe || null,
                        hashes: Array.isArray(helpers.hashes) ? helpers.hashes : null,
                        bomRef: pid
                    });
                }
                if (Array.isArray(b.branches)) walk(b.branches);
            }
        };
        if (Array.isArray(tree.branches)) walk(tree.branches);
        if (Array.isArray(tree.full_product_names)) {
            for (const fp of tree.full_product_names) {
                const helpers = fp.product_identification_helper || {};
                map.set(fp.product_id, {
                    purl: helpers.purl || null,
                    cpe: helpers.cpe || null,
                    hashes: Array.isArray(helpers.hashes) ? helpers.hashes : null,
                    bomRef: fp.product_id
                });
            }
        }
        return map;
    }

    // ---------- matchers ----------

    /**
     * Strict-on-statement, lenient-on-dep PURL match. The statement's
     * namespace and version are optional, but if present they must match.
     * SBOM deps frequently omit qualifiers (`?type=jar`, etc.); we ignore
     * qualifiers when comparing.
     */
    matchByPurl(statementPurl, dep) {
        if (!statementPurl || !dep) return false;
        const a = this._parsePurl(statementPurl);
        const candidates = this._collectDepPurls(dep);
        for (const candidate of candidates) {
            const b = this._parsePurl(candidate);
            if (!a || !b) continue;
            if (a.type !== b.type) continue;
            if (a.name !== b.name) continue;
            if (a.namespace && b.namespace && a.namespace !== b.namespace) continue;
            if (a.version && b.version && a.version !== b.version) continue;
            return true;
        }
        return false;
    }

    matchByBomRef(statementRef, dep) {
        if (!statementRef || !dep) return false;
        const candidates = [
            dep.bomRef,
            dep['bom-ref'],
            dep.originalPackage && dep.originalPackage['bom-ref'],
            dep.originalPackage && dep.originalPackage.bomRef
        ].filter(Boolean);
        return candidates.includes(statementRef);
    }

    /**
     * Match if any (algorithm, value) pair on the statement matches a hash on
     * the dep. Algorithm comparison is case-insensitive; value comparison is
     * strict because hash digests are always rendered lowercase by SBOM tools.
     */
    matchByHash(statementHashes, dep) {
        if (!Array.isArray(statementHashes) || statementHashes.length === 0) return false;
        const depHashes = (dep.originalPackage && Array.isArray(dep.originalPackage.hashes))
            ? dep.originalPackage.hashes
            : (Array.isArray(dep.hashes) ? dep.hashes : []);
        if (depHashes.length === 0) return false;
        for (const sh of statementHashes) {
            const sa = (sh.alg || sh.algorithm || '').toUpperCase();
            const sv = sh.content || sh.value;
            if (!sa || !sv) continue;
            for (const dh of depHashes) {
                const da = (dh.alg || dh.algorithm || '').toUpperCase();
                const dv = dh.content || dh.value;
                if (sa === da && sv === dv) return true;
            }
        }
        return false;
    }

    /**
     * Try every available identifier in priority order: bomRef → purl → hash.
     * Returns the first matcher that fires so the UI can label the source.
     */
    matchStatementToDep(statement, dep) {
        if (!statement || !dep) return null;
        const ids = statement.identifiers || {};
        if (ids.bomRef && this.matchByBomRef(ids.bomRef, dep)) return 'bom-ref';
        if (ids.purl && this.matchByPurl(ids.purl, dep)) return 'purl';
        if (ids.hashes && this.matchByHash(ids.hashes, dep)) return 'hash';
        return null;
    }

    _collectDepPurls(dep) {
        const out = new Set();
        const orig = dep.originalPackage || {};
        if (orig.purl) out.add(orig.purl);
        if (dep.purl) out.add(dep.purl);
        if (Array.isArray(orig.externalReferences)) {
            for (const ref of orig.externalReferences) {
                if (ref && typeof ref.url === 'string' && ref.url.startsWith('pkg:')) {
                    out.add(ref.url);
                }
            }
        }
        // Synthesise a PURL from name+version+ecosystem so deps that arrive
        // from minimal SBOMs still match VEX statements that use full PURLs.
        const eco = (dep.ecosystem || '').toLowerCase();
        if (dep.name && eco) {
            const ecoMap = { npm: 'npm', pypi: 'pypi', maven: 'maven', cargo: 'cargo', nuget: 'nuget', go: 'golang', rubygems: 'gem' };
            const purlType = ecoMap[eco];
            if (purlType) {
                const ver = dep.version && dep.version !== 'unknown' ? `@${encodeURIComponent(dep.version)}` : '';
                if (purlType === 'maven' && dep.name.includes(':')) {
                    const [g, a] = dep.name.split(':');
                    out.add(`pkg:maven/${encodeURIComponent(g)}/${encodeURIComponent(a)}${ver}`);
                } else if (dep.name.startsWith('@') && dep.name.includes('/')) {
                    const [scope, nm] = dep.name.split('/');
                    out.add(`pkg:${purlType}/${encodeURIComponent(scope)}/${encodeURIComponent(nm)}${ver}`);
                } else {
                    out.add(`pkg:${purlType}/${encodeURIComponent(dep.name)}${ver}`);
                }
            }
        }
        return Array.from(out);
    }

    _parsePurl(purl) {
        if (typeof purl !== 'string' || !purl.startsWith('pkg:')) return null;
        try {
            const noQualifiers = purl.split('?')[0].split('#')[0];
            const rest = noQualifiers.slice(4);
            const slashIdx = rest.indexOf('/');
            if (slashIdx === -1) return null;
            const type = rest.slice(0, slashIdx).toLowerCase();
            const path = rest.slice(slashIdx + 1);
            const atIdx = path.lastIndexOf('@');
            const namePart = atIdx === -1 ? path : path.slice(0, atIdx);
            const version = atIdx === -1 ? null : decodeURIComponent(path.slice(atIdx + 1));
            const segs = namePart.split('/').map(s => decodeURIComponent(s));
            const name = segs.pop();
            const namespace = segs.length > 0 ? segs.join('/') : null;
            return { type, namespace, name, version };
        } catch (err) {
            return null;
        }
    }

    // ---------- ids ----------

    _computeVexId(doc, format) {
        // Prefer document-supplied ids when present so re-uploading a CSAF or
        // OpenVEX doc with a stable tracking id collapses to the same row.
        if (format === 'csaf' && doc.document && doc.document.tracking && doc.document.tracking.id) {
            return `csaf:${doc.document.tracking.id}`;
        }
        if (format === 'openvex' && (doc['@id'] || doc.id)) {
            return `openvex:${doc['@id'] || doc.id}`;
        }
        if (format === 'cyclonedx-vex' && doc.serialNumber) {
            return `cdxvex:${doc.serialNumber}`;
        }
        // Fallback to a synchronous hash of the JSON body. We use a small
        // FNV-1a so the service stays free of native-crypto async setup; the
        // intent is collision avoidance across one user's uploads, not
        // cryptographic uniqueness.
        let str;
        try {
            str = JSON.stringify(doc);
        } catch {
            str = String(Date.now());
        }
        let hash = 2166136261;
        for (let i = 0; i < str.length; i++) {
            hash ^= str.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return `${format}:${(hash >>> 0).toString(16)}`;
    }
}

if (typeof window !== 'undefined') {
    window.VexService = VexService;
    if (!window.vexService) window.vexService = new VexService();
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = VexService;
}
