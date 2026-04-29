# Changelog

All notable changes to SBOM Play will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **Insights "Supply-chain hygiene" column now has its own donut chart, mirroring "License risk"** (`js/insights-page.js`, `insights.html`): the third column of the *Supply-chain & M&A red flags* section was the only column in that section without a visualization — License risk had a CSS conic-gradient donut, Conflicts had a coloured alert, but Supply-chain hygiene was just a four-line bullet list (`malicious-package matches`, `dependency-confusion candidates`, `unpinned/mutable Actions out of N`, `EOL components / EOS`), which made the section feel asymmetric and made it harder to see at a glance which class of red flag dominated the portfolio. The column now leads with a five-slice donut (Malware = red, Dep-confusion = orange, Unpinned actions = warning yellow, EOL = purple, EOS = info cyan) sized by raw count, followed by a horizontal legend with per-slice counts and tooltips that preserve the exact context the bullet list used to carry (e.g. the Unpinned-actions tooltip still shows `N of M action references`, the EOL/EOS tooltips cite endoflife.date, the Malware tooltip names OSV.dev MAL-* / OpenSSF as the source). A subtitle line below the donut shows total findings and the total Actions scanned, so the "out of N" denominator is never lost. Icon colours from the original list (skull / dep-confusion / pin / skull-crossbones) are preserved as the slice colours so users transitioning from the v1 layout don't have to relearn semantics. The shared `renderConicDonut` helper now accepts an optional `centerLabel` argument (defaults to `"repos"` for backward compatibility with the SBOM-grade donut on the *Repository hygiene* section), and the *License risk* donut on the same page was also corrected to render `licensed deps` in the centre instead of the previously-misleading `repos` label that was a leftover from when the helper only had one caller. Cache-buster on `js/insights-page.js` was bumped on `insights.html` so the change takes effect on next load.

### Added
- **Unified, debounced loading indicator on every filterable page** (`js/common.js`, `js/findings-page.js`, `js/licenses-page.js`, `js/vuln-page.js`, `js/malware-page.js`, `js/audit-page.js`, `js/insights-page.js`, `js/authors-page.js`, `js/deps-page.js`, `js/repos-page.js`, `js/feeds-page.js`, plus matching cache-buster bumps on every HTML page that loads them): SBOM Play used to show a loading overlay only on `deps.html`, `repos.html`, and `feeds.html`, and only while the analysis selector was loading data — every other filter change (search input, severity dropdown, finding-type, repo, ecosystem, checkboxes, page-size) just briefly froze the UI with no visible feedback, and the Findings page (`findings.html`) had no spinner at all even though re-rendering its security-findings HTML can take noticeable time on large analyses with EOX / staleness lookups. Two new helpers in `js/common.js` — `showFilterLoading(containerId)` and `hideFilterLoading(containerId)` — schedule a Bootstrap `spinner-border` overlay over the given results container after a 150ms debounce, so instant filters never flash a spinner but anything that takes longer than ~150ms (Findings re-render, Audit re-render, License compliance, Vulnerability table, Insights, Authors, Deps with `Show All`, Repos pagination, etc.) shows progress until the work finishes. The helper reuses existing `.loading-overlay` markup on `deps.html` / `repos.html` / `feeds.html` so the visual stays identical there, and lazily injects an overlay (with `position: relative` on the container) for pages that didn't have one before. Every per-page filter handler is now wrapped with `try { showFilterLoading(...) } finally { hideFilterLoading(...) }`, so the spinner is guaranteed to clear even if rendering throws.
- **Confirmed EOL/EOS now surfaces on the Findings page with a citation back to endoflife.date** (`findings.html`, `js/findings-page.js`): packages whose runtime/framework/OS lifecycle is officially End-of-Life or End-of-Support per [endoflife.date](https://endoflife.date) used to be visible only as a small badge on the Deps page when the user enabled the "EOL" toggle; the Findings page silently skipped them for any analysis whose stored `dep.eoxStatus` had not been populated by enrichment. `findings.html` now loads `js/eox-service.js`, so the existing dynamic fallback in `findings-page.js` (`getEOXStatusDynamic`) actually fires for legacy analyses and confirmed EOL/EOS rows show up under the EOX category. Each EOL (high) and EOS (medium) row now also includes an explicit "Source:" line linking to `https://endoflife.date/{productMatched}` (e.g., `https://endoflife.date/python`, `https://endoflife.date/nodejs`) — built from the `productMatched` slug already returned by `EOXService.checkEOX` — so users can click through to verify the lifecycle claim against the upstream source rather than trusting the badge alone. Staleness-based "Probable EOL" / "Highly Likely EOL" rows are intentionally left without a source link because they are inferred from registry inactivity, not confirmed by endoflife.date.
- **New "Insights" page for engineering managers, CTOs, and M&A teams** (`insights.html`, `js/insights-page.js`, plus per-dep enrichment-export changes in `js/sbom-processor.js`, `js/enrichment-pipeline.js`, `js/version-drift-analyzer.js`, `js/github-client.js`, `js/app.js`, and an Insights nav link added to every existing HTML page): SBOM Play now has a single executive-style page that rolls up the data the per-page drill-downs already produce into the questions a non-engineer (or a head of engineering preparing for a board / M&A review) actually asks. The Insights page is reached from the new **Insights** tab between Findings and Deps on every page; it shares the standard analysis selector and reads the loaded analysis read-only — no new fetches at render time. Sections include: an 8-tile **KPI strip** (repos analysed, SBOM coverage %, total deps with direct/transitive split, open Critical+High CVEs, median CVE age, EOL/EOS components, high-risk licenses with conflict count, major-version drift %, and a Tech-Debt grade A–F with a 0–100 score); **Language & ecosystem stack** (portfolio language mix bar, polyglot repos callout for ≥3 ecosystems, per-repo language chips combining `allRepositories[].languages` with the new GitHub `primaryLanguage`); **Package age** with a portfolio age-bucket bar (`<6m / 6-12m / 1-2y / 2-3y / 3-5y / >5y`), oldest-dependency-per-repo table, probable-EOL leaderboard from `staleness.isProbableEOL`, and an explicit coverage badge so users see what fraction of deps have publish-date data; **Version drift** with a stacked per-repo `current/patch/minor/major` bar (drift now persisted on every dep, not just vulnerable ones — see Changed below) and a top-20 lagging-packages leaderboard ranked by `repoCount × major-vs-minor weight`; **Vulnerability age** with a severity-segmented age-bucket distribution (`<30d / 30-90d / 90d-1y / 1-2y / >2y` × Critical/High/Medium/Low) using OSV `published`, a "Time-bomb" table that lists Critical/High CVEs ≥ 90 days old where `versionDrift.latestVersion` already provides a fix (i.e. open delivery debt), and a Critical+High-by-repo bar; **Repository hygiene** with a CSS conic-gradient SBOM-grade donut (no chart library — keeps the airgapped allowlist unchanged), repo activity buckets from the new GitHub `pushedAt` field (`<30d / <90d / <1y / >1y / archived / unknown`), and a visibility-debt callout for repos missing dependency graph / archived / no SBOM grade; **Supply-chain & M&A red flags** with a license-risk donut and conflicts list, a copyleft-on-direct-deps table (GPL/AGPL/LGPL/MPL/EPL/CDDL/OSL/EUPL applied to packages with `directIn.length > 0` only — the genuine licensing-contamination signal for acquisitions), an EOL components table linking each row back to `https://endoflife.date/<product>`, plus tiles for malicious-package matches, dependency-confusion candidates, and unpinned/mutable Actions; and a **Tech-Debt composite** that combines drift (25%), vulnerability density weighted by severity (25%), aged packages (15%), license risk (10%), SBOM quality inverse (10%), EOL runtime exposure (10%), and supply-chain hygiene (5%) into a single transparent A–F grade per analysis, plus a per-repo ranking table with `Export CSV` so leaders can drop the rows into finance / M&A spreadsheets. Every section degrades gracefully on legacy analyses by labelling per-section coverage; a yellow "partial enrichment" banner appears at the top of the page when overall age or drift coverage is below 50%, telling users to re-run to populate the remaining metrics. All processing remains client-side; the page renders entirely with CSS bars and inline conic-gradient donuts (no Chart.js / D3 added).

### Changed
- **Filter handlers across Findings, Licenses, Vulnerabilities, Malware, Audit, Insights, Authors, Deps, Repos, and Feeds now show a debounced spinner during work** (`js/findings-page.js`, `js/licenses-page.js`, `js/vuln-page.js`, `js/malware-page.js`, `js/audit-page.js`, `js/insights-page.js`, `js/authors-page.js`, `js/deps-page.js`, `js/repos-page.js`, `js/feeds-page.js`): filter / search / dropdown / checkbox changes that previously appeared to freeze the UI now display the unified loading indicator (see new helper under Added) whenever the operation takes longer than ~150ms. The existing analysis-selector overlays on `deps.html`, `repos.html`, and `feeds.html` are reused, so behaviour on those pages stays identical for fast operations and only changes for slow ones.
- **Live GitHub rate-limit panel now lists each bucket separately instead of flipping** (`js/github-client.js`, `js/app.js`): The "Rate Limit: X/Y requests remaining" line on the scan progress card on `index.html` was overwriting a single slot for every REST response, but GitHub charges each request against one of several independent pools (`core`, `graphql`, `search`, `code_search`, `dependency_snapshots`, `integration_manifest`, …) and the response headers reflect *the pool that was charged*, not a single global counter. Different endpoints therefore made the displayed value flip between unrelated numbers (e.g. `4983/5000` for core REST and a much smaller `dependency_snapshots` count) depending on whichever response landed last. `extractRateLimitFromResponse` now reads the `X-RateLimit-Resource` response header to determine the actual bucket and stores per-bucket counters in `lastRateLimit`; `SBOMPlayApp` accumulates these into a new `rateLimitByBucket` map and `updateRateLimitInfo` renders one row per bucket in `#rateLimitInfo` (Core REST and GraphQL first, then alphabetical), each row showing `remaining/limit` and the per-bucket reset time. Friendly labels (`Core REST`, `GraphQL`, `Dependency Snapshots`, `Code Search`, `Search`, …) replace the raw bucket names; unknown buckets fall back to a title-cased version of the API name so future GitHub additions render sensibly without code changes. Buckets appear lazily — each row shows up the first time we make a call against that pool (Core REST lights up immediately because the scan-start `/rate_limit` request itself is a core call, GraphQL appears once author enrichment runs, Dependency Snapshots appears on the first SBOM fetch, etc.) — so the panel only ever lists pools the current session is actually using rather than the full catalogue of GitHub buckets.
- **Insights "Per-repository language stack" table is now collapsed by default** (`js/insights-page.js`, `insights.html`): the per-repository language-stack table at the bottom of the Language & ecosystem stack section can grow to 50 rows of repo names + ecosystem chips, which dominated the section's vertical space and pushed the more decision-relevant "Dependency mix by ecosystem" bars and "Polyglot repositories" callout off-screen on first load. The table is now wrapped in a Bootstrap collapse panel that starts closed; the section heading itself acts as the toggle (cursor-pointer + chevron, same `data-bs-toggle="collapse"` pattern used by Findings / Audit / Deps cards) and now also shows the repository count and "top 50 shown" qualifier inline so users can decide whether to expand without first opening the table. Cache-buster on `js/insights-page.js` was bumped on `insights.html`.
- **Version drift, staleness, and EOX status are now persisted on every dependency** (`js/sbom-processor.js`, `js/enrichment-pipeline.js`): until this release, `versionDrift` / `staleness` / `eoxStatus` only round-tripped to storage via `vulnerabilityAnalysis.vulnerableDependencies[]`, because `SBOMProcessor.exportData()` rebuilt `allDependencies` fresh from the in-memory `this.dependencies` Map on every save and `enrichment-pipeline.js` only mutated the array elements. Useful per-dep metrics like "is this package probable-EOL?" or "is there a major upgrade available?" silently disappeared for any dep that wasn't also a CVE hit. The processor's `exportData()` now emits `versionDrift`, `staleness`, `eoxStatus`, and `sourceRepoStatus` on every dep, and `enrichment-pipeline.js` mirrors each enrichment back onto `this.sbomProcessor.dependencies` via three new helpers (`syncDriftToProcessor`, `syncEOXToProcessor`, `syncSourceRepoStatusToProcessor`) so the next `saveProgress` re-export carries them. Existing pages (Findings, Deps, Vuln, Audit, Malware) are unaffected — they consume the same fields whether the data came from the array mutation or the Map; new pages (Insights) get full per-dep coverage instead of being limited to the vulnerable subset.
- **Version-drift / staleness ecosystem coverage broadened from 3 ecosystems to 8** (`js/version-drift-analyzer.js`): `fetchVersionPublishDate` previously returned a publish date only for `npm`, `pypi`, and `cargo`, so anything Maven / NuGet / Go / RubyGems / Composer never produced a `staleness` block — Insights and Findings showed those ecosystems as "no age data" by construction. The function now resolves publish dates for `maven`, `nuget`, and `go` via the existing deps.dev `publishedAt` field (already used by the license-fetcher; no new external host); for `gem` / `rubygems` via `https://rubygems.org/api/v1/versions/<name>.json`'s `created_at`; and for `composer` / `packagist` via `https://repo.packagist.org/p2/<vendor>/<name>.json`'s per-version `time` field. Go versions are auto-prefixed with `v` (per AGENTS.md "External APIs" rules) so deps.dev queries for SBOM-pinned `1.2.3` resolve correctly. The new code paths follow the same fetch-with-timeout / debug-URL-logging pattern as the existing npm / PyPI / crates.io implementations, are only invoked from `checkStaleness` (so version-range entries already short-circuit before they reach this layer), and silently return `null` on miss so the page-level coverage badges stay accurate.
- **GitHub user-repo GraphQL query now fetches `pushedAt`, `primaryLanguage`, and `defaultBranchRef`** (`js/github-client.js`, `js/sbom-processor.js`, `js/app.js`): repository hygiene metrics on the new Insights page (most importantly the "repo activity" buckets and the per-repo language stack) need each repository's last-push timestamp, GitHub-detected primary language, and default branch. The existing user GraphQL query in `getUserRepositoriesGraphQL` only requested `name`, `nameWithOwner`, `description`, `url`, `isArchived`, `licenseInfo`, and `owner` — so for any analysis fetched via GraphQL the Insights page would have shown "unknown" for activity and would have lacked GitHub's primary-language signal entirely. The query now also requests `pushedAt`, `primaryLanguage { name }`, and `defaultBranchRef { name }`, and the GraphQL→REST mapping normalises them onto the same `pushed_at` / `language` / `default_branch` keys the REST organization endpoint already returns, so the rest of the codebase reads a single shape. `SBOMProcessor.processSBOM` accepts a new `meta = { pushedAt, primaryLanguage, defaultBranch }` argument; `app.js` populates it from the REST/GraphQL repo objects on both the org-listing path and the single-repo path (and on the no-SBOM stub path so even repos without a dependency graph appear in the Insights "repos without dep graph" / "archived" / "stale push" buckets with real activity timestamps). `allRepositories[]` carries the new fields out via `exportData()`. Existing analyses without these fields still load — they show "unknown" activity until re-run.
- **Refreshed airgapped / self-host allowlist on the About page** (`about.html`): The "Paranoid Self-Host / Airgapped Deployment" section now reflects every domain SBOM Play actually fetches, so firewall/proxy operators can build an accurate allowlist without reverse-engineering the source. Two domains were previously missing — `packages.ecosyste.ms` (the ecosyste.ms registry aggregator used by `js/depconfuse-service.js` for dependency-confusion detection across 38+ registries, by `js/registry-utils.js` for the registry list and Maven/Go/Composer/NuGet version-drift fallback, by `js/dependency-tree-resolver.js` for the RubyGems / generic dep-tree fallback, and by `js/author-service.js` for maintainer/author metadata) and `endoflife.date` (queried by `js/eox-service.js` in Phase 5 for EOL/EOS lifecycle data on runtimes, frameworks, and OS components) — and have been added under the existing "Package Registries (Dependency Resolution)" group and a new "End-of-Life Data" group respectively. Two existing rows were also tightened: `cdnjs.cloudflare.com` now correctly notes that it serves both Font Awesome icons and Leaflet marker images (the latter pulled by `js/authors-page.js` for the Authors page map), and `raw.githubusercontent.com` now mentions both author `profile.json` and `FUNDING.yml` (both fetched by `js/author-service.js` for funding/profile enrichment).

### Fixed
- **Already-stored analyses now self-heal `versionDrift`, `staleness`, AND `eoxStatus` on every load — no re-scan required to populate the Insights "Package age", "Version drift", or "EOL components" sections** (`js/storage-manager.js`, plus storage-manager cache-buster bumped on `index.html`, `licenses.html`, `vuln.html`, `deps.html`, `settings.html`, `authors.html`, `repos.html`, `debug.html`, `audit.html`, `findings.html`, `malware.html`, `feeds.html`, `insights.html`): companion fix to the `runLicenseAndVersionDriftEnrichment` Map-sync fix above. Analyses saved before the Map-sync fix landed have `versionDrift: null` / `staleness: null` / `eoxStatus: null` on every entry of `data.allDependencies` even though the underlying enrichment did fetch the data correctly — only the array-vs-Map gap at save time nulled it out. Without this self-heal, users on those legacy analyses still see `Coverage: 0%`, "No drift data available", and an empty "EOL components (top 25)" table until they re-run every analysis from scratch. Two new helpers on `StorageManager` recover what's recoverable on every load: `_ensurePackageMap()` does a single `indexedDBManager.getAllPackages()` bulk read and indexes by `packageKey` (one IndexedDB transaction for the whole portfolio, not one per dep); `_hydrateDriftAndStaleness(entry, pkgMap)` then walks `entry.data.allDependencies[]` in four passes: (1) sync hydration from `vulnerabilityAnalysis.vulnerableDependencies[]`, whose `versionDrift` survived the broken export because its array shares references with the live `sbomProcessor` object (~5% coverage on typical analyses); (2) bulk hydration from the `packages` IndexedDB store, which `version-drift-analyzer.js` writes to via `saveVersionDriftToCache` independently of the export pipeline (typically 100% coverage on any analysis whose drift was ever fetched, since the packages store outlives `allDependencies` writes); (3) unconditional promotion of `dep.versionDrift.staleness` to `dep.staleness`, because the Insights / Findings pages read the canonical top-level `dep.staleness?.monthsSinceRelease` path; (4) re-derivation of `eoxStatus` via `EOXService.checkEOX` — endoflife.date data is cached by *product* (not by package@version) so we can't read the per-dep verdict back the way we read drift, but the cost is kept low by using `eoxService.findProduct(name, ecosystem)` (a sync hash-table lookup) as a pre-filter so only the handful of deps that actually map to a known runtime/framework/OS/server (typically 0–200 out of 6500+) ever pay the async `checkEOX` cost; the per-product `getProductEOX` call is itself memoised in `cacheManager.getEOXProduct` so all lookups after the first per product are O(1). Pass 4 is skipped silently on pages that don't load `eox-service.js` (i.e. anywhere except `insights.html`, `deps.html`, `findings.html`, `index.html` — sufficient because those are the pages that render EOX rows). `_hydrateDriftAndStaleness` is wired into `loadAnalysisData()`, `loadAnalysisDataForOrganization()`, and `getCombinedData()` (the latter shares one `_ensurePackageMap()` call across all entries via the optional `pkgMap` argument so a 3-org / 6500-dep portfolio still pays a single bulk IndexedDB read). Mutations are read-time only — the stored data is unchanged, so users who don't open a hydration-aware page see no behaviour change. Logs `💧 Drift hydration on "<name>": N from vulns, M from packages cache, K staleness records promoted, J EOX records recovered` when hydration actually fires. Same self-correcting pattern as `_invalidateStaleEOXStatus` (logic-version-stamped EOX) and `MalwareService.hydrateAffectedFromCache` (OSV per-package cache rehydration).
- **Deps page Major/Minor drift filters silently returned no rows for un-cached packages, with `⚠️ RegistryManager not available for fetchLatestVersion` in the console** (`deps.html`): every other page that loads `js/version-drift-analyzer.js` (`index.html`, `vuln.html`, `findings.html`, `malware.html`) also loads `js/registry-utils.js` first, which is what creates the `window.registryManager` instance the analyzer's `fetchLatestVersion` delegates to. `deps.html` was missing that script tag, so when a user toggled the **Has Major Update** / **Has Minor Update** filter on the Deps page and any visible dep didn't already have version-drift data in IndexedDB cache (rare but real for ecosystems where the initial scan couldn't pre-fetch, e.g. legacy analyses or transient registry failures), the fallback `versionDriftAnalyzer.checkVersionDrift(...)` path inside `filterTable` (`js/deps-page.js`) hit the `if (window.registryManager)` guard, logged the warning, and returned `null` — which the filter treated as "no drift," silently dropping the dep from the filtered set. Loading `js/registry-utils.js` on `deps.html` (between `js/version-utils.js` and `js/version-drift-analyzer.js`, matching the script order on the other pages) restores the live registry lookup so the fallback succeeds and the filter returns the correct rows. No data-shape changes; the underlying drift cache is already correctly populated by the initial scan, this just unblocks the deps-page-only fallback path. The new script tag carries its own `?cb=…` and `deps.html` is served fresh on every navigation, so users get the fix on next reload without a separate cache-buster bump.
- **Insights "Package age" / "Version drift" sections empty after a full GitHub-org/user/repo scan** (`js/app.js`, `index.html`): even after a fresh re-scan of a GitHub org, user, or single repo, the Insights page rendered `Coverage: 0% of deps have publish-date data`, an all-zero portfolio age distribution (`<6m: 0  6-12m: 0  1-2y: 0  …`), `No publish-date data available for any repository.`, `No probable-EOL packages detected.`, and `No drift data available.` for both the per-repo drift breakdown and the top-20 lagging packages list. The analyses themselves were correctly *fetching* drift / staleness / EOX from npm / PyPI / Maven / NuGet / Go / RubyGems / Composer and the deps.dev fallback — the data was just being silently dropped right before save. Two array-vs-Map gaps in the legacy GitHub-fetched enrichment path (`runLicenseAndVersionDriftEnrichment` in `js/app.js`, used by `analyzeOrganization`, `analyzeSingleRepository`, and the per-row "Rerun" button on `index.html`): (1) `fetchVersionDriftData` and `fetchEOXData` mutated only the previously-exported `results.allDependencies` array (`dep.versionDrift = driftData;`, `dep.eoxStatus = eoxStatus;`), but `runLicenseAndVersionDriftEnrichment` then re-ran `this.sbomProcessor.exportData()` which rebuilds `allDependencies` fresh from `this.dependencies` Map — and the Map's per-dep entries had never been touched, so the export wrote `versionDrift: null` / `staleness: null` / `eoxStatus: null` on every dep before persistence. (2) `fetchVersionDriftData` only attached drift via `dep.versionDrift = driftData` (with staleness nested at `driftData.staleness`), but the Insights / Findings pages read `dep.staleness?.monthsSinceRelease` — i.e. they expect staleness promoted to the canonical `dep.staleness` path. Fix mirrors the working contract from the SBOM-upload path (`EnrichmentPipeline.runFullEnrichment`, which has had this sync since the Insights page shipped): `fetchVersionDriftData` now also assigns `dep.staleness = driftData.staleness;` alongside the drift attachment, and at the end of both `fetchVersionDriftData` and `fetchEOXData` we call `EnrichmentPipeline.syncDriftToProcessor(dependencies)` / `syncEOXToProcessor(dependencies)` so the Map is up-to-date before the next `exportData()` re-build. Reuses the existing shared helpers (per AGENTS.md "use shared services") rather than duplicating the sync logic. Cache-buster on `js/app.js` was bumped on `index.html` so users get the fixed code on next reload. Vulnerability-derived pages (Vuln, Findings) are unaffected — they read from `vulnerabilityAnalysis.vulnerableDependencies`, which is shared by reference between the processor and the export and so already survived the rebuild. Existing stored analyses continue to render empty Insights distributions until the user re-runs the scan; on that next scan, the data now persists end-to-end and the Insights "Package age" coverage badge, age-bucket bar, oldest-dependency-per-repo table, probable-EOL leaderboard, per-repo drift stack, and top-20 lagging packages all populate correctly.
- **Insights "Portfolio language mix" relabelled so the count units are unambiguous** (`js/insights-page.js`, `insights.html`): the per-row counter on the language stack used the bare label `usages` (e.g. `JavaScript — 23,851 usages (89.8%)`), which several users read as "lines of JavaScript", "JS files", or "unique JS dependencies" — none of which the metric actually represents. The data comes from `SBOMProcessor.getLanguageStats()`, which sums `dep.count` across every dependency tagged to that ecosystem language (npm/Bower → JavaScript, pypi → Python, maven → Java, githubactions → YAML, …) where `dep.count` itself is the number of repositories that dep appears in. So `23,851 JavaScript` actually means 23,851 **package-manager dependency × repository pairs** sourced from npm/Bower — not LOC, not files, not unique packages. The section header was also generic ("Portfolio language mix"), and the page intro alert framed the metric as "what languages and ecosystems carry the most code", reinforcing the wrong reading. The header is now **"Dependency mix by ecosystem"**, immediately followed by an explanatory line: *"Each count is a package-manager dependency tagged to its ecosystem language, summed across every repository it appears in (a package used in 5 repos counts 5 times). YAML rows are GitHub Actions workflow steps. Not source-code line counts or file counts."* The per-row label changed from `… usages` to `… occurrences`, and a hover tooltip on the count now also shows the underlying unique-package count from `languageStats[].uniqueDependencies` (e.g. `23,851 dep×repo occurrences from 1,204 unique packages`) so power-users can sanity-check the ratio. The page header and tool-description alert were updated in tandem to drop the "carry the most code" framing in favour of "which package-manager ecosystems your dependencies come from". No data-shape changes — the underlying `languageStats` array is unchanged, so previously-stored analyses render correctly with the new wording on next page load. Cache-buster on `js/insights-page.js` was bumped on `insights.html`.
- **Insights "Tech-debt grade" KPI tile rephrased so its two numbers don't fight each other** (`js/insights-page.js`, `insights.html`): the v1 layout showed `B 88/100` as the headline value and `lower is better: 12/100 debt` as the subtitle on the same tile, which forced a reader to mentally reconcile two opposite orientations (88 = good vs 12 = better-when-lower) for what is fundamentally a single signal. The tile now leads with just the letter grade as a large coloured badge and uses a single subtitle: `health score 88/100 — higher is healthier`. The dedicated Tech-Debt section keeps the inverse "debt index" available for power-users (because the per-component contribution column is naturally additive in the debt orientation) but explicitly labels the headline as "Health score — higher is healthier" with the debt index as a small secondary line, plus an introductory paragraph above the breakdown table explaining that "Debt level" rows = "lower is healthier" and the Contribution column sums to the overall debt index. The "Score" column header in the breakdown was also renamed to "Debt" so it matches what the bar fills actually represent (0 = clean, 100 = max debt).
- **Insights page crashed with `(data.languageStats || []).slice is not a function` on the default "All Analyses" view** (`js/insights-page.js`, `insights.html`): the per-analysis SBOM processor returns `languageStats` as a sorted array (`[{language, count, uniqueDependencies}]`), but `StorageManager.getCombinedData()` — used whenever the user picks the default "All Analyses" entry in the analysis selector — aggregates it into an object map (`{language: count}`). The Insights page called `.slice()` directly on whatever shape arrived, which threw on the combined view and prevented any section after the KPI strip from rendering. `buildInsights` now passes `languageStats` through a new `normalizeLanguageStats()` helper that accepts both shapes and emits the canonical sorted array form, and `renderLanguageSection` reads from the normalised `ins.languageStats` instead of the raw `data.languageStats`. Same self-healing pattern as the existing storage-shape tolerance in `StorageManager` itself, so no enrichment re-run is required. Cache-buster on `js/insights-page.js` was bumped on `insights.html` so the fix takes effect on next load.
- **EOL false positive on scoped npm packages whose post-slash segment collides with a runtime/framework name** (`js/eox-service.js`, `js/storage-manager.js`, `js/findings-page.js`, plus cache-buster bumps on every page): `EOXService.findProduct` was generating a `normalizedName.split('/').pop()` variation and looking it up against a flat product table that mapped `'node' → 'nodejs'`, `'k8s' → 'kubernetes'`, etc. — so a scoped npm package like `@tailwindcss/node@4.2.4` collapsed to `node`, matched the Node.js runtime, and was reported as **Critical / End-of-Life (2018-04-30)** because Node.js 4.x reached EOL on that date — even though `@tailwindcss/node` is a Tailwind v4 build (Apr 2025+) and has nothing to do with the Node.js runtime. The same trap fired for `@types/node`, `@types/react`, `@nestjs/express`, `@types/jquery`, and any other `@scope/<runtime-or-framework-name>` package that any user's SBOM happened to include (notably across the juice-shop family). The matcher is now ecosystem-aware: `productMappings` entries carry `{ product, ecosystems }` where `ecosystems` is an allowlist (`'npm'`, `'PyPI'`, `'Maven'`, …, plus `'*'` for "SBOM-level / unspecified"). Runtimes/OSes/servers/databases/CLIs (`nodejs`, `python`, `kubernetes`, `mysql`, `nginx`, `npm` (the CLI), `git`, `linux`, `ubuntu`, …) are tagged `['*']` only — they can no longer match an npm/PyPI/Maven/etc. package, period. Frameworks distributed as packages (`react`, `vue`, `angular`, `next`/`nextjs`, `express`, `jquery`, `bootstrap` → `npm`; `django`, `flask`, `fastapi` → `PyPI`; `laravel`, `symfony` → `Composer`; `spring-boot`, `spring-framework`, `log4j` → `Maven`) are gated to the ecosystem they actually ship in. The `'node' → 'nodejs'`, `'k8s' → 'kubernetes'`, `'docker' → 'docker-engine'` shorthands were removed (the long-form keys still work for SBOM-level entries). `findProduct` also no longer strips the `@scope/` prefix for npm scoped names — `@scope/name` IS the package identity. The unscoped `split('/').pop()` fallback is preserved only for non-npm purl-shaped names (e.g. `golang.org/x/crypto`). To self-correct already-poisoned analyses on next load, every `eoxStatus` is now stamped with `EOXService.LOGIC_VERSION = 2`; `StorageManager.loadAnalysisData` / `loadAnalysisDataForOrganization` walk `allDependencies` / `topDependencies` / `vulnerableDependencies` / `highRiskDependencies` and drop any `dep.eoxStatus` whose `logicVersion` is missing or older than the current value (logged as `🧹 EOX: dropped N stale eoxStatus entries`). The Findings page re-derives its EOX rows via the dynamic `getEOXStatusDynamic` path whenever it sees a stale-versioned `dep.eoxStatus`, so users get the corrected verdict on the very next page load without re-running enrichment. Cache-busters on `js/eox-service.js`, `js/storage-manager.js`, and `js/findings-page.js` were bumped on `index.html`, `licenses.html`, `vuln.html`, `deps.html`, `settings.html`, `authors.html`, `repos.html`, `about.html`, `debug.html`, `audit.html`, `findings.html` so the fix takes effect on next load.
- **"Docker Floating Base Image" finding on the Findings page now points to the actual offending Dockerfile, not a 404** (`js/findings-page.js`, `js/audit-page.js`, `js/common.js`, `findings.html`, `audit.html`): the finding rule `DOCKERFILE_FLOATING_BASE_IMAGE` is emitted against a Dockerfile that lives **inside a third-party GitHub Action** the user's workflows depend on (e.g. `docker/build-push-action`'s own `Dockerfile`), not the user's repo. The Findings page was rendering it through the generic GitHub Actions row path: the "Action" column linked to the *action's repo home page* and the "Location" column built `https://github.com/<user-owner>/<user-repo>/blob/HEAD/Dockerfile#L<line>` against the **wrong repo** (the user's, not the action's), which 404s in practice. The line anchor (`#L<line>`) was therefore wasted because there was nothing to scroll to. Findings page now detects Docker rules (`DOCKER_*` / `DOCKERFILE_FLOATING_BASE_IMAGE`) and renders the full chain `User Repo → Workflow file:line → Action Repo → Dockerfile:line`, with the Dockerfile link pointing at `https://github.com/<actionOwner>/<actionRepo>/blob/<sha>/<actionDockerfile>#L<line>` — using the resolved 40-char commit SHA the analyzer recorded in the finding's `action` field (`owner/repo@<sha>`) so the line anchor matches the file content the analyzer actually read (falls back to `HEAD` if the stored ref isn't a SHA). The affected base image (e.g. `ubuntu:22.04`) is also surfaced in the row so it's no longer visually indistinguishable from an "Unpinnable Action" row. The Audit page already had the chain rendering but linked at `blob/HEAD/<file>`; it now uses the same SHA derivation so its Dockerfile links pin to the analysed commit too.
- **"Action's Dockerfile Floating Base Image" finding renamed and rewritten so users can tell what scenario it actually covers** (`js/common.js`): `getFindingName('DOCKERFILE_FLOATING_BASE_IMAGE')` was simply "Dockerfile Floating Base Image", which read as "your Dockerfile" even though the rule is only ever emitted against a third-party GitHub Action's own Dockerfile (the analyzer fetches the action's `Dockerfile` from its repo). Renamed to **"Action's Dockerfile Floating Base Image"** and rewrote `getFindingDescription` to spell out the scenario: a third-party action your workflow uses is built from a Dockerfile whose `FROM` is unpinned (floating tag like `ubuntu:22.04`, `latest`, or no tag — no `@sha256:` digest); when the workflow runs, the action's image is rebuilt against whatever the registry serves at that tag; fix lives in the action's repo (pin `FROM` by digest); the Findings page row links directly to the offending `FROM` line in the action's Dockerfile at the commit your workflow pins.
- **`UNPINNED_ACTION_REFERENCE` and `MUTABLE_TAG_REFERENCE` no longer double-fire for the same mutable-tag ref** (`js/github-actions-analyzer.js`, `js/findings-page.js`, `js/audit-page.js`, `js/common.js`): when an action was referenced by a known floating tag (`latest`, `main`, `master`, `dev`, `v1`, `v2`, …), `checkWorkflowLevel` pushed an `UNPINNED_ACTION_REFERENCE` (high) **and** `applyHeuristics` pushed a `MUTABLE_TAG_REFERENCE` (high) for the exact same `owner/repo@ref`, so the Findings and Audit pages showed two near-duplicate rows per such action. The analyzer now emits exactly one finding per unpinned ref: `MUTABLE_TAG_REFERENCE` (high) when the ref is on the floating-tag list, otherwise `UNPINNED_ACTION_REFERENCE` (medium) for specific version tags like `v1.2.3`. `applyHeuristics` no longer emits `MUTABLE_TAG_REFERENCE` (the function is preserved as a hook for future metadata-driven heuristics). For previously-stored analyses that already serialised both rows, `findings-page.js` and `audit-page.js` now also de-dup at read time — building a `Set` of `action` values that already have a `MUTABLE_TAG_REFERENCE` finding and dropping `UNPINNED_ACTION_REFERENCE` rows whose `action` is in that set — so legacy stored data self-declutters on next page load without requiring a re-enrichment (same self-correcting pattern used in the `[0.0.9]` malware-advisory hydration / OSSF `introduced: 0` fixes). The `getFindingDescription` text for both rules was also rewritten to make the distinction explicit: `UNPINNED_ACTION_REFERENCE` = a specific version tag (e.g. `v1.2.3`) that is technically movable but isn't a known floating tag — pin to a SHA; `MUTABLE_TAG_REFERENCE` = a known floating tag that the maintainer legitimately rolls forward — replace with a SHA.
- **EOL/EOS false positive on Composer (and other) version-range dependencies** (`js/eox-service.js`, `index.html`, `deps.html`, `findings.html`): Packages whose SBOM-recorded version is a *range* rather than a pinned version were being matched to the lowest cycle in the range, which is almost always the oldest and most-likely-EOL one. Concretely, a `composer.json` entry like `"symfony/symfony": "^7.0"` is serialised in the SBOM as the range `7.0,< 8.0`. The previous matcher in `EOXService.findVersionCycle` split that string by `.`, took the leading `7`, and matched cycle `7.0` (EOL 2024-07-31) — even though the same range also covers cycle `7.4` (LTS, security support through 2029-11-30 per [endoflife.date/symfony](https://endoflife.date/symfony)). The Findings page therefore showed `symfony/symfony` as confirmed EOL, contradicting endoflife.date's own data. `EOXService` now detects range syntax (comma-separated bounds, `^`, `~`, `>=`/`<`/`<=`/`>`/`=`, `*`/`x` wildcards, `||` OR-clauses, and whitespace-separated multi-clauses), parses it into structured `{lower, upper, lowerInclusive, upperInclusive}` bounds via the new `parseVersionRange`, finds every endoflife.date cycle that satisfies the range with `cycleSatisfiesRange`, and returns the **highest** matching cycle via `findLatestCycleInRange`. Pinned versions (e.g. `7.0.10`) keep their existing exact / major.minor / major matching path and still correctly map to the EOL `7.0` cycle. Net effect for the user's reported case: `symfony/symfony@7.0,< 8.0` now resolves to cycle `7.4` and is reported as **active** (with EOS 2028-11-30 / EOL 2029-11-30) instead of EOL, matching endoflife.date. Confirmed-EOL ranges still flag correctly — e.g. `^4.0` resolves to cycle `4.4` which IS past EOL — so no real EOL signal is lost. Cache-buster on `js/eox-service.js` was bumped on `index.html`, `deps.html`, and `findings.html` so the fix takes effect on next load.
- **Findings page Security Findings Summary tiles now line up in a single, consistent grid** (`js/findings-page.js`, `findings.html`): the two summary rows used mismatched Bootstrap column widths — severity tiles used `col-md-2` (5 × 2 = 10 of 12 columns, leaving dead space on the right and shrinking the cards), and the category tiles used `col-md-3` (5 × 3 = 15 columns, **overflowing** the 12-column grid so the fifth tile, "Dead Source Repos", wrapped onto a third line by itself). The result was tiles that visibly differed in width between the two rows and an orphaned card hanging below. Both rows now use `row row-cols-2 row-cols-sm-3 row-cols-md-5 g-2` with `card h-100`, so all 10 tiles are equal width on desktop, share one set of gutters, line up edge-to-edge, and stay equal-height when icons make a row taller. Also tightened the wrapping label "Dependency Confusion" to "Dep. Confusion" so it no longer wraps inside its tile, and the cache-buster on `js/findings-page.js` was bumped so the layout fix takes effect on next load.

## [0.0.9] - 2026-04-28

### Fixed
- **Stored malware-advisory records hydrate `affected[]` from the per-package OSV cache on read** (`js/malware-service.js`, `js/malware-page.js`, `js/findings-page.js`, `js/feeds-page.js`, `js/vuln-page.js`, `vuln.html`): closes the loop on the OSSF "trivial `introduced: 0`" fix below for **previously-stored** analyses. Stored vulnerability records produced before `affected: kind === 'malware' ? (vuln.affected || []) : undefined` started persisting on each `vulnerabilityAnalysis.vulnerableDependencies[*].vulnerabilities[*]` did not carry `affected[]` at all; without that metadata `OSVService.advisoryAppliesToVersion` / `MalwareService.advisoryAppliesToVersion` had to fall through to the conservative "match" branch (`if (affected.length === 0) return true;`), so legacy stored data still showed `importlib-metadata@2.0.0` / `@9.0.0` as malware on the Malware, Findings, Feeds, and Vulnerability pages even after the matcher itself was fixed. New `MalwareService.hydrateAffectedFromCache(vulnAnalysis)` walks every malicious advisory on `vulnerableDependencies[]`, looks up the per-package raw OSV response that `OSVService` already saves via `storageManager.saveVulnerabilityData(...)` (keyed `${name}@${version}`), matches by advisory id, and back-fills the missing `affected[]` arrays in-place. The Malware (`malware-page.js`), Findings (`findings-page.js`), Feeds (`feeds-page.js`), and Vulnerability (`vuln-page.js`) pages now `await` this hydration step before re-classifying / banner-counting / feed-injecting, so legacy analyses self-correct on the next page load with no full re-enrichment required. `vuln.html` now also loads `js/malware-service.js` so the hydration helper is reachable from the vulnerability page (used by `excludeMalwareFromVulnAnalysis`'s caller). The lookup is read-only IndexedDB, deduplicated per package within a single classify call, and silently no-ops if the OSV cache is empty (e.g. analyses that completed before per-package vulnerability caching existed) so the page never blocks waiting for unavailable data.
- **Malware false positives from OSSF "trivial" `introduced: 0` ranges** (`js/osv-service.js`, `js/malware-service.js`): the OSSF Malicious Packages dataset routinely emits an `affected[]` entry with both an authoritative `versions[]` enumeration AND a schema-required placeholder `ranges: [{events: [{introduced: "0"}]}]` (no `fixed` / `last_affected`). For example, `MAL-2024-2506` ("Malicious code in importlib-metadata (npm)") explicitly enumerates `versions: ["1.0.0", "10.1.1"]` but pads the entry with `introduced: "0"`. SBOM Play's `advisoryAppliesToVersion` was OR-ing `versions[]` with `ranges[]`, so the trivial open-ended range mass-flagged every installed version of the package (e.g. `importlib-metadata@2.0.0` and `@9.0.0` showing up as malware in user-reported analyses), even though OSV.dev itself only renders `1.0.0` and `10.1.1` as affected. The matcher now filters out trivial `{introduced: "0"}` ranges whenever the same `affected[]` entry already has a non-empty `versions[]` list, restoring "explicit enumeration is authoritative" semantics. When `versions[]` is empty, `introduced: 0` continues to mean "all versions affected" (covers fully-malicious typo-squat / takeover packages). The same `_isTrivialOpenRange` helper is added to both the primary `OSVService.advisoryAppliesToVersion` (which filters at fetch time before results enter `vulnerabilityAnalysis`) and the defensive `MalwareService.advisoryAppliesToVersion` (re-applied on read so previously-stored analyses self-correct on the next page load without a full re-enrichment).
- **Malware false positives for non-matching versions** (`js/osv-service.js`, `js/malware-service.js`, `js/malware-page.js`, `js/findings-page.js`, `js/feeds-page.js`, `js/vuln-page.js`, `feeds.html`): OSV-spec-strict version matching for `MAL-*` advisories. The OSV batch endpoint can return a malicious-package advisory whose `affected[].versions` pins a single version (e.g. `MAL-2025-6516` → `graphemer@3.1.2`) for queries about an unrelated version of the same package (e.g. `graphemer@1.4.0`); SBOM Play used to surface those hits as detected malware. A new `OSVService.advisoryAppliesToVersion(vuln, version, ecosystem)` matcher walks each `affected[]` entry and only keeps the advisory when the dep's version (a) appears in `versions[]`, (b) falls inside an OSV `ranges[]` (`introduced` / `fixed` / `last_affected`), or (c) the entry has no version constraints at all. The matcher intentionally does **not** consult `database_specific.malicious-packages-origins[].ranges` because that is import-source metadata, not OSV's `affected[].ranges`. The filter runs at the source in `OSVService.analyzeDependencies` / `analyzeDependenciesWithIncrementalSaving` so false positives never enter `vulnerabilityAnalysis`, and is applied defensively again in `MalwareService.analyzeFromProcessor` and `MalwareService.classifyFromVulnerabilityAnalysis`. The Malware, Findings, and Feeds pages now always re-derive their malware view from `vulnerabilityAnalysis` at read time so previously-stored analyses get cleaned up on the next page load without requiring a full re-enrichment; the Vulnerability page banner only counts MAL- advisories that actually apply to the installed version. Unknown/blank versions remain a conservative match (we keep the advisory and let the user verify) — same posture as OSV.dev itself.

### Added
- **Malicious package detection (new "Malware" page + Findings + Feeds)** (`malware.html`, `js/malware-service.js`, `js/malware-page.js`, `js/enrichment-pipeline.js`, `js/findings-page.js`, `js/feed-url-builder.js`, `js/feeds-page.js`, `js/osv-service.js`): SBOM Play now surfaces packages in your SBOM that match advisories from OSV.dev's malicious-package feed (`MAL-YYYY-NNN`) and the OpenSSF Malicious Packages dataset, in addition to the existing CVE-style vulnerability detection. A new enrichment phase (Phase 1.5 between Vulnerabilities and Licenses) reuses the OSV results already fetched in Phase 1 — no new external API calls — and re-classifies advisories with `id` starting `MAL-` (or carrying `affected[].database_specific.malicious-packages-origins`) into a dedicated `malwareAnalysis` collection. The new Malware page (`malware.html`, between Vulns and Audit in the nav on every page) lists each affected package with all detected advisories, links to the upstream OSV.dev report, ecosystem badge, and the repositories where the package was used; supports search and ecosystem filters. The Findings page gains a new `Malware` finding type with severity `critical` (above High) so malicious packages float to the top of the security findings summary, complete with category card and per-row advisory links. The Feeds/OPML export now prepends a global "OpenSSF Malicious Packages" advisory feed (`https://github.com/ossf/malicious-packages/commits/main.atom`) whenever the loaded analysis has at least one malicious-package match, so users get ongoing notifications in their RSS reader beyond a single scan. The Vulnerabilities page (`vuln.html`) shows a red banner when malware advisories exist and excludes `MAL-*` entries from the CVE table to keep severity charts clean. OSV results are backward-compatibly tagged with `kind: 'cve' | 'malware'` so downstream consumers can filter without re-parsing IDs. All processing remains client-side; no malicious package contents are ever fetched.

## [0.0.8] - 2026-04-28 

### Added
- **OPML feed export for direct and transitive dependencies** (new `feeds.html` page, `js/feed-url-builder.js`, `js/opml-builder.js`, `js/feeds-page.js`): SBOM Play now bundles every dependency in a stored analysis into a single OPML 2.0 file that can be imported into any RSS/Atom feed reader (Feedly, Inoreader, NetNewsWire, Thunderbird, FreshRSS, Miniflux, …) so users get notified the moment a new version of a dependency ships. The new "Feeds" page (linked between Authors and Settings on every page) lists each dependency with its resolved feed URL and a coverage badge — `Native` (registry's own RSS/Atom feed: PyPI `https://pypi.org/rss/project/{name}/releases.xml`, RubyGems `versions.atom`, Packagist package feed), `GitHub` (fallback to `https://github.com/{owner}/{repo}/releases.atom` when the SBOM externalRefs or PURL identify a GitHub source repo, including auto-detection for Go modules under `github.com/...` and parsed `owner/repo@ref` GitHub Actions), or `Uncovered` (no usable feed). Filters mirror the Deps page (search, direct/transitive, ecosystem, coverage), coverage stats are shown at the top, and a "Download OPML" button serializes the currently filtered set. The OPML body groups outlines by `Direct dependencies` / `Transitive dependencies` then by ecosystem; a package that is direct in repo A and transitive in repo B is listed once under Direct (feed readers dedupe by `xmlUrl` either way). A "Copy URLs" helper also dumps the visible feed URLs to the clipboard for users who manage subscriptions outside of OPML.
- **Quick "Export OPML" button on the Deps page** (`deps.html`, `js/deps-page.js`): Sits next to the existing Export CSV control and exports an OPML built from the currently filtered set (search + type + ecosystem + repository filters all apply), so users can drop a per-ecosystem or per-repository feed bundle into their reader without leaving the Deps view. Re-uses the new `FeedUrlBuilder` / `OPMLBuilder` services so feed-coverage parity with the Feeds page is automatic.
- **GitHub token input on Settings and Debug pages** (`settings.html`, `debug.html`): The same "Remove Rate Limit by GitHub Authentication" card from `index.html` now appears at the top of the Settings page (right under the page header) and the Debug Tools page (right under the advanced-tools warning). Users can paste / clear a GitHub Personal Access Token without going back to the home page, and the existing token-handling code in `js/settings.js` (`loadSavedToken` / `saveToken` / `toggleTokenSection` / `updateTokenStatus`) wires the new fields into `sessionStorage` and the shared `GitHubClient` automatically — no JS changes were needed. Sections start expanded so the input is immediately visible on configuration pages.
- **Per-entry "Rerun" action on the home page**: The "Stored Analyses" table on `index.html` now has an Actions column with a Rerun button on every row.
  - For GitHub-sourced analyses (organization, user, or `owner/repo`), Rerun re-fetches a fresh SBOM from GitHub and runs the full enrichment pipeline (vulnerabilities, licenses, version drift, authors, GitHub Actions). Stored data is overwritten on success; on failure the previous data is preserved.
  - In-memory GitHub client caches (`sbomCache`, `userCache`, `repoCache`) are cleared before rerun so the SBOM is genuinely re-fetched within the same session.
  - For analyses created from uploaded SBOM files, the action becomes "Re-upload" and switches the user to the Upload tab (the original file is not retained, so the user must re-supply it).
  - A confirmation prompt previews exactly what will happen before any work starts.
- **Country-only authors map (`authors.html`)**: The map now renders one marker per country at a static centroid rather than per-string lat/lng pins. A new `js/country-data.js` ships an embedded ISO 3166-1 alpha-2 → name + centroid table plus alias and US-state mappings, eliminating Nominatim calls for the vast majority of "city, country" / "city, state" location strings.
- **Static country resolver in `LocationService`**: `geocode()` now short-circuits via `window.CountryData.resolveCountry(...)` before touching Nominatim, populates a new in-memory `countryByString` cache on every successful resolution (static or API), and exposes `resolveCountryNoApi(...)` for synchronous lookups (used by the authors map).
- **Per-package GitHub contributor correlation toggle**: Settings → Analysis Settings now has an "Enable per-package GitHub contributor correlation" checkbox (default off). When off, the author pipeline skips the extra `/repos/<owner>/<repo>/contributors` request per unique repo; when on, the previous tentative-author correlation behavior is preserved.
- **Generic "Presented @ BlackHat" / "Presented @ Defcon" badges + consolidated Showcased page**: The single per-event "BlackHat EU 2025 Arsenal" badge across every page is replaced by two evergreen badges — `images/badge-blackhat.svg` ("Presented @ BlackHat") and a new `images/badge-defcon.svg` ("Presented @ Defcon") — both linking to a new `#showcased` anchor on `about.html`. The Showcased section now lists every venue in one place, including newly added entries for **Black Hat Asia 2026 Arsenal** ([sbom-play-50411](https://blackhat.com/asia-26/arsenal/schedule/index.html#sbom-play-50411)) and **DEF CON Singapore 2026 Demo Labs** (April 28–30, 2026, Marina Bay Sands), alongside the existing Black Hat Europe 2025, Peerlist Launchpad, and slides entries. Adding future venues no longer requires editing 11 HTML pages — only the `about.html#showcased` card grid.

### Changed
- **Live GitHub rate limit counter on the scan progress card**: The "Rate Limit: X/Y requests remaining" line on `index.html` now ticks down with every GitHub API call instead of only being set once at scan start. `js/github-client.js` reads `X-RateLimit-Limit` / `X-RateLimit-Remaining` / `X-RateLimit-Reset` from each REST response in `makeRequest()` (and from each GraphQL response in `makeGraphQLRequest()` for the separate GraphQL bucket) and emits a `rateLimitUpdate` event; `SBOMPlayApp` in `js/app.js` subscribes in its constructor and refreshes the existing `#rateLimitInfo` UI on every core (REST) update.
- **Author fetching pipeline performance overhaul** (`js/author-service.js`, `js/cache-manager.js`, `js/indexeddb-manager.js`): tiered optimizations to drastically reduce outbound HTTP and IndexedDB load during author analysis.
  - Reuse a single native-registry hit per package: `fetchFromNativeRegistry` now returns the discovered repository URL and `fetchAuthors` / `fetchAuthorsFromRepository` consume it instead of re-fetching the same JSON.
  - Removed per-author location fetch and entity re-read inside `saveAuthorsToCache`; the post-pipeline batch GraphQL `fetchAuthorLocationsBatch` already covers this in one request per 50 users.
  - Default contributor fetch no longer pulls 10 sequential `/users/{login}` profile calls per repo (now `fetchProfiles=false`); profiles arrive via the batch GraphQL pass.
  - Per-run dedupe of `fetchContributorsFromGitHub` calls so monorepo packages share one `/contributors` response.
  - Funding probes get a session + persistent negative cache (authors with no funding aren't re-probed every package) and now use a single `GET` for `profile.json` instead of HEAD-then-GET.
  - Per-run memoization of `findAuthorByEmail` / `findAuthorByGitHub` / `getAuthorEntity` collapses repeat IndexedDB lookups for shared authors across packages.
  - All author-service HTTP now flows through `requestQueueManager` lanes (`npm`, `pypi`, `cargo`, `gem`, `ecosystems`, `github`) so concurrency and 429/403 backoff are unified with the rest of the app.
  - `fetchAuthorsForPackages` now logs explicit phase boundaries (fetch + cache writes / aggregate / GraphQL enrichment) for easier observability.
  - Per-package writes are now committed in a single multi-store IndexedDB transaction via the new `cacheManager.savePackageAuthorBundle` / `indexedDBManager.batchSavePackageAuthorBundle` helpers, replacing the previous 1+N+N transaction-per-author pattern.

### Fixed
- **Licenses page no longer dumps recognisable licenses into "Unknown"** (`js/license-processor.js`, `js/view-manager.js`, `licenses.html`): `LicenseProcessor.parseLicense()` previously categorised by exact-string match against a small SPDX list, so common SBOM-shaped variants — `BSD`, `BSD License`, `New BSD`, `Apache Software License`, `Apache modified`, `MIT/X11`, `Expat (MIT/X11)`, `LGPLv3`, `LGPL-3.0+`, `GPLv2+`, `GNU GPL`, `GNU General Public License v2 or later (GPLv2+)`, `Public domain`, `ISC license`, `HPND`, `ZPL-2.1`, `Artistic License`, `PSFL`, `CC-BY-3.0`, `MIT -or- Apache License 2.0`, `LGPL/MIT`, `BSD, Public Domain`, `BSD-derived (http://www.repoze.org/LICENSE.txt)` — were all flagged as Unknown / high risk on the Licenses page even though they're well-known permissive, LGPL or copyleft licenses. Now `parseLicense()` (a) detects pasted copyright/license-text bodies via leading `Copyright`/`(c)` / `=====` / numbered legal-clause patterns and routes them to a new **Custom** medium-risk bucket for legal review instead of Unknown, (b) calls a substantially expanded `normalizeLicenseName()` that maps ~150+ variant strings (PyPI classifiers, npm/Cargo loose forms, GNU prose names, MIT/X11/Expat aliases, ZPL/HPND/PSFL/Artistic, etc.) to canonical SPDX ids, (c) normalises the SPDX `+` operator (`GPL-2.0+` → `GPL-2.0-or-later`, `LGPL-3.0+` → `LGPL-3.0-or-later`, `AGPL-3+` → `AGPL-3.0-or-later`), (d) splits non-SPDX separators (`/`, `,`, ` -or- `, ` -and- `) into proper `A OR B` / `A AND B` SPDX expressions when each component is itself a known license, and (e) falls back to a lowercase contains-based heuristic so any remaining recognisable string gets categorised as `permissive` / `lgpl` / `copyleft` / `proprietary` instead of `unknown`. Truly unmatched short strings (`non-standard`, `Dual License`) correctly remain Unknown. The Licenses page also gains a new 📝 **Custom** card and dropdown filter for the pasted-license-text bucket.
- **"Total packages processed" counter now reflects all ecosystems**: The progress card on `index.html` previously showed only the current ecosystem's running count because each `DependencyTreeResolver` instance in `js/sbom-processor.js` resets its own `totalPackagesProcessed` counter to 0 per ecosystem. `SBOMPlayApp.updateProgress()` in `js/app.js` now keeps a per-ecosystem map (`packageCountByEcosystem`, cleared on every `startTiming()`) and renders the sum across all ecosystems, so the displayed total truly accumulates across `npm`, `pypi`, `maven`, etc., regardless of whether they resolve sequentially or in parallel.
- Debug Tools page (`debug.html`) no longer throws `Cannot set properties of null (setting 'innerHTML')` on load. `SettingsApp.displayOrganizationsOverview()` now skips rendering when `#organizationsContent` / `#organizationsSection` are absent (e.g. on `debug.html`), matching the defensive pattern already used by the other init methods.
- GitHub token validation now accepts all documented token formats (classic PAT `ghp_`, fine-grained PAT `github_pat_`, OAuth `gho_`, GitHub App `ghu_` / `ghs_` / `ghr_`) instead of only `ghp_`. Shared `isValidGitHubTokenFormat()` in `js/common.js`; index and settings token UI updated accordingly.

### Security
- **Pin GitHub Actions to commit SHAs** (`.github/workflows/deploy-github-pages.yml`, `.github/workflows/validate-deployment.yml`): every `uses:` reference is now pinned to an immutable 40-char commit SHA, with the resolved release tag preserved as a trailing `# vX.Y.Z` comment, mitigating supply-chain risk from mutable tag refs (per OpenSSF Scorecard guidance). As a side effect, three actions were also bumped to their current latest majors:
  - `actions/checkout` → `de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2` (both workflows)
  - `actions/configure-pages` → `45bfe0192ca1faeb007ade9deae92b16b8254a0d # v6.0.0` (was `@v5`)
  - `actions/upload-pages-artifact` → `fc324d3547104276b827a68afc52ff2a11cc49c9 # v5.0.0` (was `@v4`)
  - `actions/deploy-pages` → `cd2ce8fcbc39b97be8ca5fce6e763baed58fa128 # v5.0.0` (was `@v4`)
  Re-pinning to newer SHAs is now a one-liner via the new global `pin-github-actions` Cursor skill (`~/.cursor/skills/pin-github-actions/`), which provides `pin_actions.sh --scan` to rewrite every `uses:` line under `.github/workflows/` and `--repos owner/repo …` to print `repo / tag / sha` for ad-hoc lookups.

## [0.0.7]

_No changelog entries were recorded for this release._

## [0.0.6] - 2025-12-31

### Added
- **Pre-Analysis Rate Limit Warning System**: Proactive warnings before starting GitHub analysis
  - Estimates number of API calls needed based on input type (single repo vs org/user)
  - Shows estimated time based on current rate limits (authenticated vs unauthenticated)
  - Warning modal displays when analysis may hit rate limits:
    - High call count without token (>50 calls)
    - Low remaining rate limit
    - Many repositories without authentication (>30 repos)
  - Three options in warning modal:
    1. **Add Token**: Opens token section for immediate authentication
    2. **Run in Background**: Starts analysis with floating progress banner, allows navigation
    3. **Proceed**: Continue with current settings
  - Background analysis mode shows persistent notification banner with progress
  - Completion notification when background analysis finishes

## [0.0.5] - 2025-12-15
### Added
- **Package Details Modal on Findings Page**: EOX-related findings now show clickable package names
  - Clicking a package name in EOX findings opens a detailed modal with full package information
  - Modal shows: package info, version drift status, registry links, repositories using the package
  - For transitive dependencies, modal shows full dependency chain paths from direct dependencies to the target package
  - Shared `package-details-modal.js` component eliminates code duplication between deps.html and findings.html
  - Same rich package details experience across Dependencies page and Findings page

- **Dead Source Repository Detection**: New finding type to detect when packages reference non-existent GitHub repositories
  - New `REPO_NOT_FOUND` finding type (medium severity) for packages with 404 source repos
  - Added `validateSourceRepos()` method to enrichment pipeline to check GitHub repos in SBOM externalRefs
  - Parses various Git URL formats: `git+ssh://`, `git+https://`, `ssh://`, plain GitHub URLs
  - New "Dead Source Repos" filter option in Findings page dropdown
  - Helps identify abandoned packages or potential supply chain risks from re-registrable repos
  
- **EOX Status Enrichment**: EOX data now persisted in analysis exports for reliable findings display
  - New Phase 5 in enrichment pipeline fetches EOX status from endoflife.date API
  - EOX status stored on dependency objects as `dep.eoxStatus`
  - Staleness data now also attached to dependencies during version drift phase
  
- **Backward Compatible EOX Findings**: EOX findings now work with existing exports
  - Findings page now looks up staleness from IndexedDB packages cache when not on dependency object
  - Falls back to dynamic computation via `eoxService` and `versionDriftAnalyzer` if cache miss
  - Works for both new exports (with attached data) and existing exports (with cache lookup)

### Fixed
- **License Change Detection False Positives**: Fixed bug where same-name packages from different ecosystems were incorrectly flagged as license changes
  - Now groups packages by `ecosystem:packageName` instead of just `packageName`
  - Example: `mime` (npm) and `mime` (PyPI) are now correctly treated as separate packages

- **GitHub Actions Line Number Tracking**: Workflow findings now include exact line numbers
  - New `extractUsesLineNumbers()` helper scans raw YAML for `uses:` statements
  - `parseYAMLWithLineNumbers()` combines parsed YAML with line number map
  - Line numbers now included in `workflowLocations` for accurate finding location display
  - Enhanced Findings page GitHub Actions display with clickable links to workflow files with line numbers

### Changed
- **Findings Page Enhancements**: Improved GitHub Actions findings display
  - New "Location" column replaces "Repository" for GitHub Actions findings
  - Shows full path: Repository → Workflow File:Line with clickable GitHub links
  - Action column now links directly to action repository
  - Multiple workflow locations displayed if action used in multiple places
  - Category breakdown now shows 4 categories: GitHub Actions, Dependency Confusion, EOX, Dead Source Repos
  
- **Enrichment Pipeline Optimization**: Adjusted phase percentages for new phases
  - 6 phases now: Vulnerabilities (60-68%), Licenses (68-76%), Version Drift (76-84%), Authors (84-90%), EOX Status (90-95%), Source Repos (95-98%)
  
- **Dependency Confusion Detection**: Reduced false positives for PyPI packages
  - PyPI packages not found in registry now marked as LOW severity with message: "Double-check if this dependency could be fulfilled via native OS installers (apt, dnf, brew)"
  - Finding type name updated to "Potential Dependency Confusion (Low Risk - Likely System Package)" for low severity findings
  - Added `confusionSeverity` and `confusionMessage` fields to dependency data for accurate severity tracking
- **Dependency Tree Resolution**: Performance optimization with parallel processing at deeper levels
  - At depth 4+ (configurable), dependencies are now resolved in parallel batches for faster npm resolution
  - Sequential processing retained at top levels (1-3) to avoid overwhelming APIs with concurrent requests
  - New settings in Settings page: "Parallel Processing Depth Threshold" (default: 4) and "Parallel Batch Size" (default: 10)
  - Significantly reduces scan time for large npm dependency trees
- **GitHub Author Location Fetching**: Bulk GraphQL queries for significant performance improvement
  - New `getUsersBatchGraphQL()` method fetches up to 50 users in a single GraphQL query using field aliasing
  - New `fetchAuthorLocationsBatch()` method in AuthorService processes authors in batch
  - Reduces GitHub API calls from N individual requests to ceil(N/50) batch requests
  - Especially beneficial when scanning organizations with many package authors
- **Audit Page Disclaimer**: Added experimental feature warning
  - Notes that SBOM compliance standards (CISA, BSI TR-03183, NTIA) are rapidly evolving
  - Advises users to consult official documentation for authoritative requirements
  - Clarifies the tool provides guidance only, not compliance certification

### Removed
- **Composer/Packagist Dependency Confusion**: Temporarily disabled to prevent false positives from platform packages (e.g., `php@8.2`)

### Security
- **URL Hostname Validation**: Fixed incomplete URL substring sanitization in `sbom-quality-processor.js`
  - Replaced insecure `.includes('github.com')` checks with `isUrlFromHostname()` for VCS URL validation
  - Prevents potential bypass where malicious URLs like `evil.com/github.com/fake` could be misidentified as valid source repos
  - Affects source code URI detection in SBOM completeness checks

### Fixed
- **SBOM File Upload**: Fixed `[object Object]` display and package count when uploading files
  - `parsed.format` is an object, not a string - now correctly accesses `parsed.format.format`
  - Better error messages when uploading non-SBOM files (shows actual parser error)
  - Fixed package count display: now correctly accesses `data.sbom.packages` (was showing 0)
  - Now shows format with version (e.g., "cyclonedx 1.5" instead of just "cyclonedx")
- **Dependency Resolution UI**: Ecosystem progress section now hides after resolution completes
  - "Dependency Resolution by Ecosystem" section was persisting after analysis moved to next phase
  - Now properly cleared when dependency tree resolution finishes (success or failure)
- **Staleness Badges**: Now show more specific EOL status instead of generic "Stale"
  - **Highly Likely EOL** (red badge): Packages with no updates for 3+ years
  - **Probable EOL** (orange badge): Packages with no updates for 2+ years
  - **Stale** (yellow badge): Packages with no updates for 6+ months (but less than 2 years)
  - Both table badges and detail popup now show the correct EOL status

### Added
- **EOX Findings on Findings Page**: End-of-Life/Support issues now appear as security findings
  - New "EOX (End-of-Life/Support)" filter option in Finding Type dropdown
  - Four EOX finding types grouped under EOX category:
    - **EOL** (high severity): Confirmed end-of-life from endoflife.date API
    - **EOS** (medium severity): Confirmed end-of-support from endoflife.date API
    - **Highly Likely EOL** (high severity): No updates for 3+ years (staleness-based detection)
    - **Probable EOL** (medium severity): No updates for 2+ years (staleness-based detection)
  - EOX findings show in summary stats with hourglass icon
  - Detail view includes EOL/EOS dates, last release date, and age since last release
- **Dependency Confusion Documentation**: Comprehensive methodology section added to About page
  - Explains what dependency confusion attacks are and their real-world impact
  - Details the detection approach: namespace not found vs package not found
  - Lists all 36+ supported registries across different ecosystems
  - Describes the detection process from PURL parsing to evidence collection
  - Includes mitigation strategies and reference links to original research

- **Enhanced Dependency Confusion Detection**: Ported detection capabilities from DepConfuse project
  - Created new `js/depconfuse-service.js` service with namespace and package existence checking
  - **Namespace Checking**: Detects when a package's namespace/organization doesn't exist in public registries (HIGH-CONFIDENCE risk)
  - **36 Registries + GitHub Actions**: Extended from ~10 to 36 package registries via ecosyste.ms API, plus GitHub Actions verification via GitHub API
    - New ecosystems: CocoaPods, Bower, Pub (Dart), CPAN, CRAN, Clojars, Hackage, Hex (Elixir), Julia, Swift Package Index, Conda, Homebrew, Puppet Forge, Deno, Elm, Racket, vcpkg, Bioconductor, and more
  - **Evidence URLs**: Findings now include proof links to the ecosyste.ms API response showing the package/namespace doesn't exist
  - **Separate Finding Types**: Distinguished between `NAMESPACE_NOT_IN_REGISTRY` (higher severity) and `PACKAGE_NOT_IN_REGISTRY`
  - Updated `js/ecosystem-utils.js` and `js/registry-utils.js` with ecosystem mappings
  - Integrated with `js/dependency-tree-resolver.js` for automatic checking during dependency resolution
  - Enhanced Audit page to display dependency confusion findings with evidence links

- **EOX (End-of-Life) Support**: New service to detect End-of-Life and End-of-Support packages
  - Created `js/eox-service.js` for integration with endoflife.date API
  - Automatically identifies packages that have reached EOL/EOS status
  - Added EOX checking during analysis phase for notable dependencies (runtimes, frameworks, databases)
  - New "EOX Dependencies" section in Audit page with high severity for EOL, medium for EOS
  - EOX badges displayed in Dependencies page table
  - EOX filter checkbox in Dependencies page filters
  - Cache support in IndexedDB for EOX data (7-day cache expiry)

- **Enhanced SBOM Audit**: Comprehensive SBOM quality assessment with new features
  - **CISA 2025 Compliance Check**: Validates SBOMs against CISA 2025 Minimum Elements (replaces NTIA 2021)
    - Checks 11 required elements (4 new from NTIA): Software Producer, Component Name, Version, Software Identifier, Component Hash (NEW), License Information (NEW), Dependency Relationship, SBOM Author, Timestamp, Tool Name (NEW), Generation Context (NEW)
    - 90% coverage threshold for package-level elements
    - Renamed fields: "Supplier Name" → "Software Producer", "Author of SBOM Data" → "SBOM Author"
  - **BSI TR-03183-2 v2.0 Compliance Check**: German/EU technical guideline validation
    - Checks SBOM and component-level requirements including SHA-256+ hashes, licenses, source URIs, unique identifiers
    - Supports CycloneDX 1.5+ and SPDX 2.2.1+
  - **SBOM Freshness Tracking**: Monitors SBOM generation date and age
    - Status levels: Very Fresh (≤7 days), Fresh (≤30 days), Recent (≤90 days), Aging (≤180 days), Old (≤365 days), Stale (>365 days)
  - **Completeness Score**: Percentage of packages with full metadata (name, version, PURL, license, supplier, download location, checksum)
  - **Comprehensive Audit Report**: `generateAuditReport()` method combines all assessments with risk scoring
    - Risk calculation: Quality (35%), CISA 2025 (25%), BSI (10%), Freshness (15%), Completeness (15%)
  - New "SBOM Audit" section in Audit page showing per-repository quality breakdown with dual compliance indicators

- **Version Drift Analyzer Enhancements**: Added EOX integration and package status methods
  - `checkEOX()`: Delegates to EOXService for EOL/EOS checking
  - `getPackageStatus()`: Returns combined drift, staleness, and EOX status
  - `getHighestSeverityStatus()`: Determines the most critical status for a package

- **Unified Enrichment Pipeline**: Created shared `EnrichmentPipeline` class (`js/enrichment-pipeline.js`) that orchestrates all data enrichment
  - Vulnerability analysis (OSVService)
  - License fetching (deps.dev API + GitHub fallback)
  - Version drift analysis (VersionDriftAnalyzer)
  - Author/maintainer information (AuthorService)
  - Used by both GitHub flow (`app.js`) and upload flow (`upload-page.js`)
  - Ensures identical enrichment results regardless of data source

- **Direct/Transitive Dependency Classification for Uploaded SBOMs**: Fixed CycloneDX SBOM parsing to correctly identify direct vs transitive dependencies
  - Added `_rootComponentSPDXID` tracking in sbom-parser.js
  - Added `_isDirectDependency` flag on relationships from root component
  - sbom-processor.js now uses these flags to correctly populate `directIn`/`transitiveIn` arrays
  - Previously all uploaded dependencies were marked as transitive with "unknown parent"

- **sbomqs v2.0 Alignment**: SBOM Quality Processor now fully aligned with sbomqs scoring methodology
  - **7 Categories** (was 6): Identification, Provenance, Integrity, Completeness, Licensing, Vulnerability, Structural
  - **New Integrity Category** (18% weight): Checksums presence, SHA-256+ strength, digital signatures
  - **New Structural Category** (10% weight): SPDX/CycloneDX spec compliance, version validation, schema validity
  - **Enhanced Completeness Category** (15% weight): Dependencies, supplier, source code URIs, component purpose, primary component identification
  - **Enhanced Provenance Category** (15% weight): Added supplier check, tool version validation, namespace URI validation, lifecycle support (CycloneDX 1.5+)
  - **Weight Rebalancing**: Aligned with sbomqs v2.0 weights (ID: 12%, Prov: 15%, Int: 18%, Comp: 15%, Lic: 18%, Vuln: 12%, Struct: 10%)
  - Backward compatible with existing stored assessments
  - Reference: [sbomqs v2.0 Specification](https://github.com/interlynk-io/sbomqs)

- **SBOM Format Display**: Audit page now shows SBOM format type and version
  - Detects SPDX (e.g., "SPDX 2.3") and CycloneDX (e.g., "CycloneDX 1.5") formats
  - New "Format" column in SBOM Audit table with color-coded badges
  - Format info stored in quality assessment for persistent display
  - Handles converted formats (CycloneDX uploaded and converted to internal SPDX-like format)

### Changed
- **Architecture Refactoring**: Consolidated duplicate enrichment code between `app.js` and `upload-page.js`
  - Created `runLicenseAndVersionDriftEnrichment()` helper in `app.js` to consolidate ~90 lines of duplicate code
  - `upload-page.js` now uses `EnrichmentPipeline` instead of reimplementing enrichment logic
  - Removed duplicate `fetchVersionDriftData()` and `fetchAuthorData()` from `upload-page.js`
  - Both flows now produce identical output data structures

- **Upload Page Dependencies**: Added missing shared services to `upload.html`
  - Added `author-service.js` for author analysis (was missing entirely)
  - Added `enrichment-pipeline.js` for unified enrichment
  - Upload flow now performs the same enrichment as GitHub flow

### Fixed
- **GitHub Actions Dependency Confusion Detection**: Fixed false positives and added proper GitHub API verification
  - **Issue**: Actions like `actions/setup-node@4.*.*` were incorrectly flagged because ecosyste.ms API doesn't properly check GitHub repos
  - **Fix**: Implemented GitHub API-based verification for GitHub Actions:
    - Checks if the repository exists using `api.github.com/repos/{owner}/{repo}`
    - Checks if the organization/user exists using `api.github.com/users/{owner}`
    - HIGH-CONFIDENCE risk: Organization/username doesn't exist (attacker can register it)
    - Lower risk: Org exists but repo doesn't (risk if org allows public repo creation)
  - Results are cached (24hr) to minimize API calls
  - Graceful handling of rate limits (fails safe, doesn't flag on errors)
  - Valid actions like `actions/setup-node` now correctly show as existing

- **No Direct Dependencies in Uploaded SBOMs**: Fixed issue where all dependencies from uploaded CycloneDX SBOMs showed as transitive
  - Root cause: sbom-parser.js wasn't passing root component's bom-ref to identify direct dependencies
  - Root cause: sbom-processor.js was looking for main package with wrong name pattern for uploaded files
  - Now correctly identifies 56 direct dependencies for proton-bridge SBOM (was 0 before)

- **Unknown Parent for Transitive Dependencies**: Fixed issue where transitive dependencies showed "unknown parent"
  - Root cause: Dependency relationships from root component weren't being marked as direct
  - `parents` array now correctly populated from dependency graph

### Updated
- **AGENTS.md**: Added comprehensive architecture documentation
  - Data flow diagram showing shared processing pipeline
  - EnrichmentPipeline usage examples
  - Anti-patterns to avoid (duplicate implementations)
  - Updated shared services table with EnrichmentPipeline

- **Workflow Validation**: Added `enrichment-pipeline.js` to required JS files in `validate-deployment.yml`

## [0.0.4] - 2025-12-10

### Added
- **Mobile-Responsive Navigation**
  - Added hamburger menu (navbar-toggler) for mobile devices
  - Navigation links now collapse into a dropdown menu on screens < 992px
  - Theme toggle button remains visible outside hamburger menu for easy access
  - Improved mobile navigation styling with proper padding, borders, and hover states
  - Navigation dropdown has a subtle box-shadow for better visibility

- **Mobile-Friendly UI Improvements**
  - Footer stacks vertically on mobile devices with centered content
  - Form layouts adapt to smaller screens
  - Tables support horizontal scrolling on small screens
  - iOS-specific fixes for viewport and input zoom prevention
  - Header buttons stack properly on very small screens

### Fixed
- **Vulnerability Page: Version Drift Badges Now Display from Cache**
  - **Issue**: Version drift badges (Major/Minor upgrade available) were not showing on `vuln.html`
  - **Root Cause 1**: `version-drift-analyzer.js` was not loaded on `vuln.html`, so `window.VersionDriftAnalyzer` was undefined and cache lookup was skipped
  - **Root Cause 2**: Version drift data was stored in IndexedDB cache but not attached to dependency objects
  - **Fix 1**: Added `version-drift-analyzer.js` script to `vuln.html`
  - **Fix 2**: Added debug logging to `view-manager.js` and `version-drift-analyzer.js` for cache lookup
  - **Files Modified**: `vuln.html`, `js/view-manager.js`, `js/version-drift-analyzer.js`
  - **Result**: Version drift badges now show correctly by retrieving data from IndexedDB cache

- **Vulnerability Page: Added Sorting by Severity, Count, and Repository Impact**
  - **Issue**: Vulnerabilities were displayed in arbitrary order (order of discovery)
  - **Fix**: Added multi-level sorting: 1) Severity (Critical → High → Medium → Low), 2) Vulnerability count (most first), 3) Repository impact (most repos first)
  - **Files Modified**: `js/view-manager.js`
  - **Result**: Critical vulnerabilities now appear at the top, followed by high-impact vulnerabilities

- **Repos Page: Author Counts Now Display Correctly**
  - **Issue**: Author count was showing 0 for all repositories on `repos.html`
  - **Root Cause**: `authorAnalysis.authors` was empty in stored data, but author data existed in the package-author cache
  - **Fix**: Added fallback in `repos-page.js` to rebuild author-repo mapping from IndexedDB package-author cache when `authorRefs` is empty
  - **Files Modified**: `js/repos-page.js`
  - **Result**: Author counts now populate correctly by querying the 1895+ package-author relationships stored in cache

- **Vulnerability Page: Version Drift Tags Now Display Correctly**
  - **Issue**: Vulnerable dependencies like `apache-airflow@2.8.0` with major/minor version drift didn't show upgrade badges on vuln.html
  - **Root Cause**: Version drift analysis runs AFTER vulnerability analysis (96% vs 90%), so vulnerable dependencies were saved without `versionDrift` data
  - **Fix 1**: After version drift is fetched, attach it to `vulnerableDependencies` in the results before final save
  - **Fix 2**: Improved version matching in view-manager.js to use flexible matching (`version`, `displayVersion`, `assumedVersion`)
  - **Files Modified**: `js/app.js` (both single repo and org analysis), `js/view-manager.js`
  - **Result**: Vulnerable dependencies now show "Major: X.Y.Z" or "Minor: X.Y.Z" badges when upgrades are available
  - **Cache Busting**: Updated `app.js` and `view-manager.js` to timestamp 1764053119788

- **License Fetching: Improved Version Handling and Ecosystem Support**
  - **Issue 1: Go packages returning 0 licenses fetched**
    - **Root Cause**: deps.dev API requires Go module versions to have "v" prefix (e.g., `v1.18.0` not `1.18.0`)
    - **Fix**: Added automatic "v" prefix to Go versions in `fetchGoLicenses()`
  - **Issue 2: Cargo/Packagist/RubyGems packages returning 0 licenses**
    - **Root Cause**: Version strings contained range specifiers (e.g., `1.0.108,< 2.0.0`) that deps.dev doesn't accept
    - **Fix**: Added version cleaning logic to extract base version before API calls (e.g., `1.0.108,< 2.0.0` → `1.0.108`)
  - **Issue 3: OSV service not resolving unknown versions**
    - **Root Cause**: Ecosystem detection only used `dep.category?.ecosystem` or PURL extraction, missing fallback to `dep.ecosystem` and name-based detection
    - **Fix**: Added multiple ecosystem detection fallbacks including `detectEcosystemFromName()` in OSV service
  - **Files Modified**: `js/app.js` (fetchGoLicenses, fetchLicensesForAllEcosystems), `js/osv-service.js`
  - **Result**: Go, Cargo, Packagist, and RubyGems packages now correctly fetch licenses from deps.dev
  - **Cache Busting**: Updated `app.js` and `osv-service.js` to timestamp 1764050304402

- **CRITICAL: OSV Batch Query Fails for Organization Scans (Invalid Ecosystem Error)**
  - **Issue**: Organization scans returned 0 vulnerabilities while single repo scans worked
  - **Error**: `OSV API error: 400 - {"code":3,"message":"Invalid ecosystem."}`
  - **Root Cause**: `mapToOSV()` in ecosystem-utils.js returned invalid ecosystem names (e.g., 'GitHub Actions', 'Docker', 'Helm', 'Terraform') instead of `null` for unsupported ecosystems
  - **Impact**: When ANY package in a batch had an invalid ecosystem, the ENTIRE batch query failed
  - **Fix**: 
    1. Updated `osvEcosystemMap` to only include OSV-supported ecosystems (Go, PyPI, npm, Maven, NuGet, crates.io, Packagist, RubyGems, Hex, Pub, CocoaPods, CRAN, Debian, Alpine)
    2. Changed `mapToOSV()` to return `null` for unsupported ecosystems instead of returning the original value
  - **Files Modified**: `js/ecosystem-utils.js` (lines 9-26, 53-56)
  - **Result**: Organization vulnerability scans now work correctly by excluding packages with unsupported ecosystems from OSV batch queries
  - **Cache Busting**: Updated `ecosystem-utils.js` to timestamp 1764049072342

- **Vulnerability Page: Repository Usage Display Fix for Transitive Dependencies**
  - **Issue**: Transitive dependencies on vuln.html showed "Repository usage information not available" despite having correct repository associations in IndexedDB
  - **Root Cause**: `buildDependencyPath()` in view-manager.js returned `null` for transitive dependencies that weren't in the original SBOM's `spdxPackages` (added during tree resolution)
  - **Fix**: Added fallback in `getVulnerableDepUsage()` - when `buildDependencyPath()` returns null, create a simple association showing the dependency is used in the repository (marked as transitive)
  - **Files Modified**: `js/view-manager.js` (lines 5155-5165)
  - **Result**: All vulnerable dependencies now correctly show their repository association
  - **Cache Busting**: Updated `view-manager.js` to timestamp 1764043076180

- **CRITICAL: Repository Association Fix for Transitive Dependencies**
  - **Issue**: Transitive dependencies were showing "0 repos" and "Repository usage information not available" on vuln.html
  - **Root Cause**: Newly discovered transitive dependencies from tree resolution weren't being associated with the repository
  - **Fix 1**: In `processDependencyTrees()`, ALL newly discovered dependencies (direct and transitive) now get repository associations
  - **Fix 2**: In `exportData()`, added safety check to ensure NO dependency is left without a repository
  - **Console Warnings Fixed**:
    - `⚠️ Dependency exceptiongroup@1.3.0 found but has no repositories linked`
    - `⚠️ Dependency pygments@2.19.2 found but has no repositories linked`
    - (and similar for other transitive dependencies)
  - **Files Modified**: `js/sbom-processor.js` (lines 808-835, 945-970)
  - **Result**: Every dependency (direct or nth-level transitive) is now properly tagged to its repository
  - **Cache Busting**: Updated `sbom-processor.js` to timestamp 1764042481675

- **CRITICAL: OSV Service Now Resolves Unknown Versions Before Scanning**
  - **Issue**: Packages with `version: unknown` (like `colorama`) were being skipped for vulnerability scanning
  - **Error Message**: `⚠️ Skipping vulnerability scan for colorama: no version available`
  - **Fix**: OSV service now resolves unknown versions to their latest before filtering
  - **Implementation**: Added version resolution using `DependencyTreeResolver.fetchLatestVersion()` in `analyzeDependenciesWithIncrementalSaving()`
  - **Files Modified**: `js/osv-service.js` (lines 378-410)
  - **Result**: All packages will now be scanned for vulnerabilities, even if SBOM didn't include version
  - **Cache Busting**: Updated `osv-service.js` to timestamp 1764041557320

- **CRITICAL: Vulnerability Scanning Order Fixed**
  - **Issue**: Vulnerability scanning ran BEFORE version resolution, causing 118 dependencies to be skipped
  - **Root Cause**: Version resolution phase was placed after vulnerability analysis in the execution flow
  - **Fix**: Moved version resolution phase to run at 88% (BEFORE vulnerability analysis at 90%)
  - **Impact**: All dependencies with unknown versions are now resolved before vulnerability scanning
  - **Files Modified**:
    - `js/app.js`: Moved version resolution from lines 752-793 to lines 688-738 (single repo analysis)
    - `js/app.js`: Moved version resolution from lines 1213-1254 to lines 1152-1202 (organization analysis)
  - **Result**: Vulnerability scanning can now check 111 additional packages (94% of previously skipped packages)
  - **Cache Busting**: Updated `app.js` to timestamp 1764033861125
  
- **PyPI License Classifier Parsing Fixed (colorama and similar packages)**
  - **Issue**: Packages like colorama showed "unknown" license despite having valid "License :: OSI Approved :: BSD License" classifier
  - **Root Cause**: PyPI regex captured "BSD" from classifier but conversion check looked for "BSD License" (full string), so conversion to SPDX never happened
  - **Example**: colorama has empty `license` field but valid classifier "License :: OSI Approved :: BSD License"
  - **Fix**: Added proper handling for short-form license names extracted from classifiers:
    - `'BSD'` → `'BSD-3-Clause'` (was only checking `'BSD License'`)
    - `'MIT'` → `'MIT'` (was only checking `'MIT License'`)
    - `'Apache Software'` → `'Apache-2.0'` (was only checking `'Apache Software License'`)
  - **Files Modified**: `js/app.js` (lines 3594-3600)
  - **Impact**: Fixes license detection for packages where PyPI has empty `license` field but valid classifier
  - **Affected Packages**: colorama, and potentially others with similar PyPI metadata patterns
  - **Cache Busting**: Updated `app.js` to timestamp 1764034629117

- **Cache Busting Updated for All Modified Files**
  - Updated all HTML files with new cache busting timestamp: `cb=1764035359174`
  - Files updated:
    - `js/app.js`: Colorama license fix + vulnerability scanning order fix
    - `js/sbom-processor.js`: Version resolver initialization + repository propagation
    - `js/osv-service.js`: Version validation before OSV queries
    - `js/dependency-tree-resolver.js`: Version resolution before API calls
    - `js/repos-page.js`: Debug logging for data flow diagnostics
  - Ensures all browsers load the latest code with all fixes applied

- **Repository Page Loading Fixed**
  - **Issue**: repos.html page showed "0 Total Repositories" despite data being available
  - **Fix**: Added debug logging to track data flow through loadAnalysis() and processData()
  - **Files Modified**: `js/repos-page.js` (lines 252-262, 269-277)
  - **Cache Busting**: Updated `repos-page.js` to timestamp 1764033861125
  - **Status**: Diagnosis in progress - debug logs added to identify root cause

- **Critical: Version Resolution and Data Quality Fixes**
  - **Root Cause**: Unknown versions were not being resolved to latest version from package registries, causing cascading failures across all analysis phases
  - **User Requirement**: "If version is unknown you need to consider that its latest version"
  - **Inconsistency Fixed**: Previously, `wrapt@unknown` would be queried (and fail with "No dependencies found") while `inspect2@unknown` would be skipped entirely - now both are handled consistently by resolving to latest version first
  - **Fixes Implemented**:
    - **SBOM Processing** (`js/sbom-processor.js`):
      - Added `versionResolver` instance to constructor for reuse across all packages
      - Initialize resolver once in `processSBOM()` instead of creating new instance per package
      - When version is missing, always attempt to fetch latest from registry
      - Store `'unknown'` string (not `null`) if resolution fails to enable downstream processing
      - Added repository propagation fallback: transitive dependencies inherit from first parent if no repos found
    - **Version Resolution Phase** (`js/app.js`):
      - Added new analysis phase (94-95%) to resolve unknown versions before license/vulnerability scanning
      - Runs after SBOM processing, before license fetching
      - Attempts to resolve all `version: 'unknown'` dependencies to latest version
      - Logs resolution progress: "Resolved X/Y unknown versions"
    - **License Fetching** (`js/app.js`):
      - Changed filter from `version !== 'version unknown'` to `version !== 'unknown'` in:
        - `fetchPyPILicenses()` (line 3427)
        - `fetchGoLicenses()` (line 3720)
        - `fetchLicensesForAllEcosystems()` (line 3920)
      - Now processes dependencies with resolved versions instead of skipping them
    - **Version Drift Analysis** (`js/app.js`):
      - Changed filter from `version === 'version unknown'` to `version === 'unknown'` (line 4059)
      - Sets empty drift data (`hasMajorUpdate: false`, `hasMinorUpdate: false`, `isStale: false`) for truly unknown versions
      - Logs warning for skipped packages instead of silently failing
    - **Vulnerability Scanning** (`js/osv-service.js`):
      - Added version validation before OSV API queries in `analyzeDependenciesWithIncrementalSaving()` (line 379-388)
      - Filters out dependencies with `version: 'unknown'` or no version
      - Logs skipped packages and shows valid dependency count: "X/Y dependencies have valid versions"
  - **Impact on sbomplay-demo scan**:
    - Expected: 199 unlicensed (8.8%) → < 10 (< 0.5%)
    - Expected: 924 without repos (40.9%) → < 50 (< 2%)
    - Expected: 2,261 missing drift data (100%) → < 100 (< 5%)
    - Expected: 0 vulnerabilities → Proper CVE detection
    - **Dependency Tree Resolution** (`js/dependency-tree-resolver.js`):
      - Added version resolution at the start of `resolvePackageDependencies()` function
      - When version is unknown/missing, fetches latest version BEFORE querying deps.dev/registries
      - Uses resolved version for all API calls (deps.dev, native registries, ecosyste.ms)
      - Updated safety check message to indicate version should have been resolved earlier
      - **Fixes Inconsistency**: `wrapt@unknown` and `inspect2@unknown` now both get resolved to latest version before queries
    - **Progress Display** (`js/app.js`):
      - Fixed dependency chain display in progress bar to always show full path
      - Changed from conditional logic (single vs multiple items) to always show full chain when available
      - **Before**: "Resolving npm dependencies (1/16 direct) → damerau-levenshtein (15 remaining)"
      - **After**: "Resolving npm dependencies (1/16 direct) → parent1 → parent2 → parent3 → damerau-levenshtein (15 remaining)"
      - Limits display to last 5 items if chain exceeds 5 for readability (shows "... → last4items")
      - Added `depChain` to progress object passed from dependency resolver callbacks
  - **Cache Busting**: 
    - `sbom-processor.js`, `osv-service.js` (timestamp: 1764029762283)
    - `dependency-tree-resolver.js` (timestamp: 1764030530262)
    - `app.js` (timestamp: 1764030740815)
    - Updated across all HTML files (index.html, debug.html, settings.html, audit.html, vuln.html, licenses.html, deps.html, repos.html)

### Added
- **Comprehensive License Fix Script**: Created one-time migration script to fix existing data with unknown versions and unlicensed dependencies
  - **Purpose**: Addresses the gap where old scans had `version: 'unknown'` before automatic version resolution was implemented
  - **Three-Phase Process**:
    - **Phase 1**: Resolves unknown versions to latest version using DependencyTreeResolver
    - **Phase 2**: Fetches licenses from deps.dev API for resolved versions
    - **Phase 3**: Applies repository license fallback for dependencies still missing licenses
  - **Results**: For anantshri-clones org (3,158 dependencies):
    - Found 134 dependencies with unknown versions
    - Resolved 127 versions (95% success rate)
    - Fetched 125 licenses from deps.dev API
    - Applied 200 repository license fallbacks
    - **Reduced unlicensed count from 290+ to just 2 (99.3% reduction!)**
  - **Usage**: Run once in browser console: Load `dependency-tree-resolver.js`, then load and execute `comprehensive-license-fix.js`
  - **Future Scans**: Not needed - new scans automatically handle version resolution and license fetching
  - **Location**: `js/comprehensive-license-fix.js` (new file), documented in `test-results/repository-license-fallback-fix.md`
- Maven version drift support via ecosyste.ms API
  - Added `fetchMavenLatestVersion()` to dependency-tree-resolver.js
  - Added `fetchMavenLatestVersion()` to version-drift-analyzer.js
  - Enables version checking for Maven packages without CORS issues
- **Debug Tools Page**: Created new `debug.html` page for advanced debugging and data management tools
  - **Moved from Settings**: License Management, Author Detection Settings, and Debug URL Logging
  - **Purpose**: Separates advanced/debug features from everyday settings for better UX
  - **Access**: Available at `/debug.html` (not linked in main navigation to avoid clutter)
  - **Location**: `debug.html` (new file)
  - **Workflow Updates**: Updated both deployment and validation workflows to include debug.html
- **Enhanced Logging**: Added console logging in vuln-page.js to help debug vulnerability data loading issues
  - Shows which analysis is being loaded (specific org or aggregated)
  - Displays count of vulnerable packages when rendering
  - Helps identify if data exists but isn't rendering correctly
  - **Location**: `js/vuln-page.js` lines 7-22
- **Manual License Re-fetch Button**: Added UI button in Settings page to manually re-fetch missing licenses for existing analysis data
  - Displays count of unknown licenses by ecosystem before re-fetching
  - Shows real-time progress during license fetching
  - Queries deps.dev API, PyPI API (with PEP 639 support), and other registries
  - Updates IndexedDB with newly fetched licenses without requiring full re-scan
  - Useful for updating old scans or fixing license detection issues
  - **Impact**: Allows users to fix ~1500+ "unknown" licenses (npm, PyPI, Go) without 10+ minute rescan
  - **Location**: `settings.html` lines 59-93, `js/license-refetch.js` (new file)
- **Total Packages Processed Counter**: Added real-time counter showing cumulative packages processed during dependency resolution
  - Displays below elapsed time during dependency tree resolution
  - Shows total count of all packages processed (direct + transitive)
  - Increments for each package resolved from any ecosystem
  - Uses comma-separated formatting for readability (e.g., "1,234")
  - **Impact**: Better visibility into scan progress and total dependency tree size
  - **Location**: `index.html` lines 165-167, `js/app.js` lines 1324-1332, `js/dependency-tree-resolver.js` lines 20, 157, 226

### Changed
- **Staleness Checking Moved to Analysis Phase**: Staleness data now fetched during initial analysis instead of lazily in UI
  - **Previous Behavior**: Staleness checked on-demand when opening deps.html, causing 50+ console messages
  - **New Behavior**: Staleness checked during initial analysis alongside version drift data
  - **Benefits**: Faster UI loading, complete data upfront, eliminates console spam
  - **Performance**: Staleness data cached in IndexedDB during analysis, not when viewing pages
  - **Console**: Changed "Saved staleness for" from `console.log` to `console.debug` (only shows in verbose mode)
  - **Files Changed**: `js/app.js` (fetchVersionDriftData function), `js/version-drift-analyzer.js` (logging)
- **Cache Busting Updated**: Updated all JavaScript cache busting timestamps from `cb=1732345678901` to `cb=1732460000000` across all HTML files
  - Ensures browsers load the latest versions of modified JavaScript files
  - Applies to all pages: index, deps, licenses, vuln, audit, repos, authors, settings, about
  - Updated 100+ script tag references across 9 HTML files
  - **Location**: All HTML files
- **License Changes Section Dependency Display**: Dependencies now show ecosystem prefix (e.g., `npm:express`, `pypi:requests`)
  - Changed from displaying just package name (e.g., `express`) to ecosystem:package format
  - Makes it easier to identify which ecosystem each dependency belongs to
  - Helps distinguish packages with same name across different ecosystems
  - **Impact**: Clearer dependency identification in license change detection
  - **Location**: `js/view-manager.js` lines 3575-3593, 3621-3635, 4281-4292

### Fixed
- **Repositories Without Dependency Graph Now Listed**: Fixed issue where repositories without SBOMs were silently skipped
  - **Problem**: Only repositories with SBOM/Dependency Graph enabled were stored and displayed (e.g., 5 out of 42 repos shown for anantshri-clones org)
  - **Root Cause**: `app.js` processRepository function returned `null` for repos without SBOMs, causing them to be discarded
  - **Solution**: Now stores ALL repositories with `hasDependencyGraph: false` flag for repos without SBOMs
  - **UI Marker**: Repos without dependency graph show `<i class="fas fa-ban"></i> No Dependency Graph` badge in SBOM Grade column  
  - **Dropdown Filtering**: Repositories without SBOMs (0 dependencies) are filtered from dropdown selectors on deps.html, vuln.html, licenses.html, etc. They ONLY appear in repos.html
  - **Data Structure**: Repos without SBOMs stored with minimal data: 0 dependencies, N/A quality, but preserve repository metadata (license, archived status, description, language)
  - **Benefits**: Complete visibility of all public repositories in repos.html, identifies which repos need dependency graph enabled in GitHub settings
  - **Files Changed**: `js/app.js` (processRepository), `js/repos-page.js` (processData, renderTable), `js/page-common.js` (loadAnalysesList), `deps.html` (inline loadAnalysesList)
- **Repository License Fallback for Unlicensed Dependencies**: Fixed issue where dependencies showed as "unlicensed" even though their repository had a clear license
  - **Problem**: 290+ dependencies from repositories like `dgraph-io/badger` (Apache-2.0) showed as unlicensed in BOTH licenses.html AND deps.html
  - **Root Cause**: THREE separate issues:
    - `getDependencyLicenseInfo()` in view-manager.js (used by licenses.html) - didn't check repository license
    - `getLicenseInfo()` inline in deps.html - didn't check dep.licenseFull, dep.license, OR repository license
    - **`exportData()` in sbom-processor.js - dependencies were exported WITHOUT `repositoryLicense` field**
  - **Impact**: Many SBOMs don't include license info for individual packages, but the repository itself has a license file; Go modules (e.g., `github.com/modern-go/concurrent`) had no license fallback
  - **Solution**: 
    - Updated `getDependencyLicenseInfo()` in view-manager.js to add repository license fallback
    - Updated `getLicenseInfo()` in deps.html to match the same comprehensive checking logic
    - **Modified `exportData()` in sbom-processor.js to include `repositoryLicense` field for each dependency (uses first repository's license)**
    - **Created comprehensive-license-fix.js migration script to backfill existing data**
  - **Inference Chain**: Both functions now check: dep.licenseFull → dep.license → dep.raw.licenseFull → dep.raw.license → GitHub Actions metadata → SBOM originalPackage → **repository license (NEW)**
  - **Files Modified**: js/view-manager.js (line ~2890), deps.html (line ~1147), **js/sbom-processor.js (lines 904-930)**, **js/comprehensive-license-fix.js (new migration script)**
  - **Source Tracking**: License source marked as 'repositoryLicense' to indicate it was inferred from repository, not declared in package metadata
  - **Results**: Unlicensed count reduced from 290+ to just 2 dependencies (99.3% reduction for existing data)
  - **Files Changed**: `js/view-manager.js` (getDependencyLicenseInfo function, lines 2746-2775), **`js/sbom-processor.js` (exportData function)**, **`js/comprehensive-license-fix.js` (new file)**
- **Maven Version Drift CORS Errors**: Fixed "Failed to fetch" errors for Maven packages by switching to ecosyste.ms API
  - **Problem**: Maven Central Search API (`search.maven.org`) blocks cross-origin requests from browsers (CORS policy)
  - **Impact**: 50+ Maven packages (spring-boot, hibernate, jakarta, etc.) showed "Failed to fetch" in console logs
  - **Solution**: Replaced Maven Central Search API with ecosyste.ms Maven registry API (`packages.ecosyste.ms/api/v1/registries/repo1.maven.org`)
  - **Result**: Maven packages now support version drift analysis and latest version checks without CORS errors
  - **Files Changed**: `js/dependency-tree-resolver.js`, `js/version-drift-analyzer.js`
- **Vuln Page Shows 0 Stats Instead of Message**: Changed vuln.html to display vulnerability stats with 0 counts when no analysis exists
  - **Previous Behavior**: Showed "No Vulnerability Analysis Yet" message with explanation
  - **New Behavior**: Shows stats cards (Critical: 0, High: 0, Medium: 0, Low: 0, Packages: 0)
  - **Rationale**: Consistency with dropdown selection behavior - always show stats, even when zero
  - **Impact**: Users see consistent UI whether selecting specific org or viewing aggregated data
  - **Fix**: Modified `generateVulnerabilityAnalysisHTML` else block to render empty stats instead of info message
  - **Location**: `js/view-manager.js` lines 5402-5424
- **Vuln Page Not Showing Content**: Fixed critical bug where vuln.html showed blank page even when data was available
  - **Root Cause**: `loadVulnerabilityData()` didn't pass `noDataSection` parameter to `loadOrganizationData()`
  - **Impact**: When no vulnerability analysis exists, the "No Data Available" section wasn't shown; users saw blank page
  - **Fix**: Added `noDataSection: document.getElementById('noDataSection')` to options in vuln-page.js line 55
  - **Result**: vuln.html now correctly shows either vulnerability data OR "No Data Available" message
  - **Location**: `js/vuln-page.js` line 55
- **Audit Page Not Loading By Default**: Fixed critical bug where audit.html would not load data on initial page load
  - **Root Cause**: Line 185 checked `if (analysisSelector && analysisSelector.value)` before loading data
  - **Impact**: When value is empty string `''` (for aggregated view), the condition was falsy and data never loaded
  - **Fix**: Changed to `if (analysisSelector)` to load data even when value is empty string
  - **Result**: audit.html now correctly loads aggregated audit findings by default
  - **Location**: `js/audit-page.js` lines 185-187
- **Page Loading Issues**: Fixed multiple issues preventing pages from loading aggregated data by default:
  - **audit.html Not Loading**: Removed early return that prevented audit page from loading with aggregated data (empty selector value)
  - **view-manager.js Early Return**: Fixed `updateLicenseCardCounts` to allow empty string for aggregated view
  - **Zero Repos in deps.html**: Added defensive code in storage-manager.js to ensure repositories array is always properly initialized during data merging
  - **License Display Logic**: Enhanced `getDependencyLicenseInfo` to check `dep.raw.license` and `dep.raw.licenseFull` fields for stored license data
    - Now checks 6 license sources: dep.licenseFull, dep.license, dep.raw.licenseFull, dep.raw.license, GitHub Actions metadata, and SBOM originalPackage
    - Should significantly reduce false "unlicensed" counts by properly retrieving stored license data
  - **Vulnerability Loading**: Added logging to vuln-page.js to help identify why vulnerability data may not be showing
  - All pages (audit, vuln, licenses, deps, repos) now properly load and display aggregated data when no specific analysis is selected
- **License Re-fetch Zero Licenses Fetched**: Fixed critical issue where manual license re-fetch was fetching 0 licenses despite 227 unknown licenses
  - **Root Cause**: Dependencies stored in IndexedDB had `version: 'unknown'`, causing deps.dev API to return 404 errors for all requests
  - **Impact**: Manual re-fetch was completely non-functional - all 211 processed dependencies resulted in 0 licenses fetched
  - **Solution**: Added version resolution step BEFORE fetching licenses (same as initial scan)
    - Uses `DependencyTreeResolver.fetchLatestVersion()` to resolve unknown versions
    - Updates `version`, `displayVersion`, and `assumedVersion` fields before API calls
    - Only resolves versions for ecosystems with valid registries (skips GitHub Actions)
    - Added `dependency-tree-resolver.js` to `settings.html` (was missing, causing "not a constructor" error)
  - **Result**: Now properly resolves ~150 PyPI "unknown" versions, enabling successful license fetching
  - **Superseded By**: `js/comprehensive-license-fix.js` (more comprehensive solution combining version resolution, license fetching, and repository fallback)
  - **Location**: `js/license-refetch.js` lines 140-164, `settings.html` line 645
- **License Re-fetch Constructor Error**: Fixed "window.App is not a constructor" error when clicking re-fetch button
  - **Root Cause**: Class is named `SBOMPlayApp` but was not exposed on window object
  - **Fix**: Exposed `SBOMPlayApp` on window and updated license-refetch.js to use `new window.SBOMPlayApp()`
  - **Location**: `js/app.js` line 4430, `js/license-refetch.js` line 131
- **License Re-fetch Data Structure Issue**: Fixed "No analysis data found" error in manual license re-fetch
  - **Root Cause**: `getCombinedData()` returns nested structure `{ data: { allDependencies } }` but code expected flat `{ allDependencies }`
  - **Fix**: Updated license-refetch.js to correctly access `combinedData.data.allDependencies`
  - **Also Fixed**: License updates now properly saved back to IndexedDB using license map to update original entries
  - **Location**: `js/license-refetch.js` lines 32-34, 89-91, 178-213
- **PyPI License Detection Enhanced with PEP 639 Support**: Fixed ~220 PyPI packages incorrectly showing as "unlicensed" when they have valid licenses
  - **Root Cause**: Modern PyPI packages use PEP 639 format with `license_expression` field instead of `license` field, which we weren't checking
  - **Impact**: Before fix, ~220 dependencies (~9.7%) were incorrectly marked as unlicensed, affecting license compliance statistics
  - **Solution Implemented**:
    - **Phase 1 - Enhanced deps.dev parsing**: Filter out unhelpful values like "non-standard", "NOASSERTION", "UNKNOWN"
    - **Phase 2 - PyPI JSON API fallback**: When deps.dev returns no valid license, query PyPI directly and check:
      - `license_expression` field (PEP 639 modern format) - e.g., typing-extensions, urllib3
      - `license` field (older format) - extract SPDX identifiers from full text (e.g., BSD-3-Clause from numpy's license text)
      - License classifiers - convert to SPDX format (e.g., "License :: OSI Approved :: MIT License" → "MIT")
  - **Result**: Expected reduction from 220 unlicensed to ~50-80, improving accuracy from 90.3% to ~96-97% correctly licensed
  - **Verified Examples**:
    - numpy: ✅ BSD-3-Clause (extracted from full license text)
    - typing-extensions: ✅ PSF-2.0 (from `license_expression`)
    - urllib3: ✅ MIT (from `license_expression`)
    - packaging: ✅ Apache-2.0 OR BSD (from classifiers)
    - certifi: ✅ MPL-2.0 (from `license` field)
    - wcwidth: ✅ MIT (from `license` field)
  - **Location**: `js/app.js` lines 3340-3540
  - **Documentation**: `mdfiles/LICENSE_DETECTION_ISSUE.md` - detailed analysis with curl verification examples
- **Dependency Resolution Progress Counter Wrong**: Fixed progress showing incorrect counts like "283/35 direct"  when resolving dependencies
  - **Root Cause**: All ecosystems (npm, PyPI, RubyGems, etc.) were sharing a single `DependencyTreeResolver` instance and resolving in parallel
  - **Impact**: Counter was being incremented by multiple ecosystems simultaneously, showing cumulative count instead of per-ecosystem count
  - **Solution**: Create a new resolver instance for each ecosystem so counters don't interfere
  - **Result**: Progress now correctly shows "1/35 direct", "2/35 direct", etc. for each ecosystem independently
  - **Also Fixed**: Added `depChain` to progress callback so dependency chains display properly
  - **Location**: `js/sbom-processor.js` lines 665-692
- **Unknown Version Dependencies Not Resolved**: Fixed dependencies with missing versions not being properly resolved to latest version
  - **Root Cause**: When latest version was successfully fetched from registry, it was only stored in `displayVersion` and `assumedVersion` fields, but the actual `version` field remained `null`
  - **Impact**: Dependencies with missing versions in SBOM now properly use the resolved latest version for:
    - License fetching (deps.dev API requires version)
    - Vulnerability scanning (OSV API requires version)
    - Version drift analysis (requires version to compare)
    - Dependency keys and display (no more "version unknown" in most cases)
  - **Solution**: When latest version is successfully fetched, update the `version` field to use it (not just `displayVersion`)
  - **Result**: Significantly reduces "version unknown" entries in dependency listings and enables proper license/vulnerability analysis
  - **For New Scans**: Automatic version resolution in `js/sbom-processor.js` lines 316-342
  - **For Existing Data**: Use `js/comprehensive-license-fix.js` migration script to backfill resolved versions
- **License Rendering Inconsistency Between Pages**: Fixed `licenses.html` showing GitHub Actions (e.g., `actions/checkout`) as "unlicensed" when `deps.html` correctly shows MIT license
  - **Root Causes**: 
    - `generateUnlicensedTableData()` and `calculateLicenseCounts()` weren't using unified license info method
    - `getEnrichedGitHubActionLicense()` had incorrect data structure navigation bugs:
      - Looked for `action.metadata.license` instead of `action.license`
      - Looked for `repoData.owner/repo` instead of parsing `repoData.repository`
      - Looked for `repoData.nestedActions` instead of recursively checking `action.nested`
  - **Solution**: 
    - Updated `generateUnlicensedTableData()` and `calculateLicenseCounts()` to use `getDependencyLicenseInfo()`
    - Fixed `getEnrichedGitHubActionLicense()` to correctly navigate GitHub Actions analysis structure
    - Fixed property access: `action.license` (not `action.metadata.license`)
    - Fixed repository matching: parse `repoData.repository` string (`"owner/repo"` format)
    - Fixed nested action search: recursively traverse `action.nested` arrays
  - **Impact**: All pages now show consistent license information for GitHub Actions dependencies
    - Stats cards at top of `licenses.html` now reflect correct counts
    - License Types table shows correct categorization  
    - Unlicensed table no longer falsely includes GitHub Actions with valid licenses
  - **Affected Pages**: `licenses.html` (Stats cards, License Types table, Unlicensed table)
  - **Location**: `js/view-manager.js` lines 2766-2810 (getEnrichedGitHubActionLicense), 3132-3360 (calculateLicenseCounts), 3499-3510 (generateUnlicensedTableData)
- **Vulnerability Page Load More Button**: Changed "Load More" to show all remaining entries at once
  - Button now says "Show All Remaining (X)" instead of "Load More (X remaining)"
  - Clicking button loads all remaining vulnerabilities in one batch instead of 25 at a time
  - **Rationale**: Similar to deps page improvement - users either want quick overview (first 25) or complete list
  - **Impact**: Faster access to full vulnerability list without multiple clicks
  - **Location**: `js/view-manager.js` lines 5360-5370, 5654, 5713
- **Dependencies Page Navigation**: Replaced pagination with simpler "Show Top 25 / Show All" dropdown
  - Removed Previous/Next buttons and page size selector (10/25/50/100/250/500 options)
  - Added simple dropdown: "Show Top 25" (default) or "Show All" dependencies
  - **Rationale**: Pagination with incremental loading (25 at a time) is tedious; users either want quick overview (top 25) or complete list
  - **Impact**: Cleaner, more intuitive UI; faster access to full dependency list
  - **Location**: `deps.html`
- **Dependency Resolution Progress Display**: Improved clarity and removed duplicate UI elements
  - Progress now shows which direct dependency is being processed (e.g., "1/6 direct", "2/6 direct")
  - Added full dependency chain from direct dependency to current package (e.g., "express → body-parser → raw-body → bytes")
  - Shows transitive depth visually: "Resolving npm dependencies (1/6 direct) → A → B → C → ansi-styles"
  - Removed duplicate secondary progress bar (`dependencyProgressSection`)
  - Progress updates show complete dependency path with visual chain representation
  - **Impact**: Clearer progress tracking, shows exact resolution depth and path, better understanding of transitive dependencies
- **Simplified Analysis Selection**: Removed confusing "__ALL__" identifier from UI
  - All pages now show aggregated data by default (labeled as "All Analyses")
  - Dropdown allows filtering to specific organization/repository
  - Removed "All Projects (Combined)" option from dropdowns
  - Empty dropdown value = show aggregated data from all analyses
  - Cleaner, simpler UX with no special internal identifiers exposed to users
  - **Impact**: Simplified interface, clearer data presentation, better user experience

### Fixed
- **Licenses Page Issues**: Fixed __ALL__ appearing in dropdown and aggregated view not loading
  - **Problem 1**: `__ALL__` legacy identifier was showing in analysis selector dropdown
  - **Problem 2**: "All Analyses" option didn't load data - showed "Please select an analysis" message
  - **Root Cause 1**: `page-common.js` wasn't filtering out `__ALL__` entries when populating dropdowns
  - **Root Cause 2**: `licenses-page.js` had `if (!analysisName) return;` check preventing empty string (aggregated view) from loading
  - **Solution**: Added filter to exclude `__ALL__` in `page-common.js`; removed early return check in `licenses-page.js`
  - **Impact**: Licenses page now shows cumulative data by default without `__ALL__` clutter
  - **Location**: `js/page-common.js` lines 31-33, `js/licenses-page.js` lines 32-36
- **Version Upgrade Badges Not Showing in Vulnerability Page**: Fixed missing version drift badges and archived tags in vulnerability analysis
  - **Problem**: Version upgrade badges (major/minor) and archived repository tags were not appearing for vulnerable dependencies
  - **Root Cause**: Vulnerable dependencies created in `osv-service.js` only included name, version, and vulnerabilities - missing version drift and other metadata
  - **Solution**: Added full metadata (versionDrift, ecosystem, category) when creating vulnerable dependencies; updated view-manager to use this data directly
  - **Impact**: Vulnerable dependencies now show version upgrade badges and archived tags correctly
  - **Location**: `js/osv-service.js` lines 345-361 (2 occurrences), `js/view-manager.js` lines 5238-5267
- **Function Call Parameter Mismatch**: Fixed incorrect function calls to `loadAnalysesList()` across multiple pages
  - **Problem**: Pages were calling `loadAnalysesList()` with extra boolean parameter that doesn't exist in function signature
  - **Root Cause**: Function signature is `loadAnalysesList(selectorId, storageManager, noDataSection)` but calls had 4 parameters including a boolean
  - **Solution**: Removed extra parameter from function calls in `licenses-page.js`, `audit-page.js`, and `vuln-page.js`
  - **Impact**: Fixes "Cannot set properties of undefined (setting 'display')" error on page load
  - **Location**: `js/licenses-page.js` line 17, `js/audit-page.js` line 49, `js/vuln-page.js` line 40
- **Vulnerability Page Not Showing Aggregated Data**: Fixed vuln.html requiring organization selection instead of showing cumulative data by default
  - **Problem**: Similar to deps.html issue - `if (!analysisName) return;` check prevented loading when empty string is selected for aggregated view
  - **Root Cause**: Empty string is falsy in JavaScript, causing early return
  - **Solution**: Removed early return check since empty string is valid for aggregated view
  - **Impact**: Vulnerability page now shows cumulative data from all analyses by default
  - **Location**: `js/vuln-page.js` lines 46-49
- **Dependency Resolution Progress Display Issues**: Fixed wrong ecosystem and counter display during transitive dependency resolution
  - **Problem 1**: Progress showed wrong ecosystem (e.g., "Resolving npm dependencies" when scanning Go packages)
  - **Problem 2**: Counter showed nonsensical values (e.g., "339/133 direct" where processed > total)
  - **Root Cause**: `updateProgress()` method didn't pass `ecosystem` parameter, causing app.js to reuse cached ecosystem from previous packages
  - **Solution**: Added `currentEcosystem` and `currentDirectDep` tracking, ensured ecosystem is always passed in progress updates
  - **Impact**: Progress now correctly shows current ecosystem and accurate direct dependency counter (e.g., "Resolving go dependencies (12/133 direct)")
  - **Location**: `js/dependency-tree-resolver.js` lines 21-22, 132-144, 167-187, 228
- **Legacy __ALL__ Entries in Dropdowns**: Filtered out `__ALL__` entries from analysis selector dropdowns
  - **Problem**: After removing `__ALL__` identifier, old database entries still contained `__ALL__` as an organization name
  - **Solution**: Added filter to exclude `__ALL__` entries when populating analysis selector dropdowns
  - **Impact**: Cleaner dropdowns without legacy internal identifiers
  - **Location**: `deps.html` lines 475-490, `js/repos-page.js` lines 99-120
- **Critical: Pages Not Loading Tables**: Fixed `deps.html` and `repos.html` not displaying tables when aggregated view is selected
  - **Problem**: After removing `__ALL__` and using empty string `''` for aggregated view, pages had `if (!analysisName) return;` check that prevented data loading
  - **Root Cause**: Empty string is falsy in JavaScript, so the condition returned early without loading any data
  - **Solution**: Removed the early return check since empty string is a valid value for aggregated view
  - **Impact**: Fixes complete failure to display any data on deps and repos pages
  - **Location**: `deps.html` line 646, `js/repos-page.js` line 221
- **Transitive Dependency Parent Display**: Fixed missing parent information for transitive dependencies in `deps.html`
  - **Problem**: Transitive dependencies showed "Unknown" for parents even though parent data was correctly stored in IndexedDB
  - **Root Cause**: `processData()` function created a new `parents` Set but only populated it from SBOM relationships and GitHub Actions analysis, never using the `dep.parents` array from dependency tree resolution
  - **Solution**: Added code to merge `dep.parents` from stored data into the parents Set
  - **Impact**: All transitive dependencies now correctly display their parent packages (e.g., "1 parent", "3 parents")
  - **Location**: `deps.html` lines 1048-1055
- **Scoped Package Name Parsing (CRITICAL)**: Fixed transitive dependencies with scoped names having empty name field
  - **Problem**: Scoped npm packages (e.g., `@jest/core@29.7.0`, `@babel/parser@7.23.6`) discovered during dependency tree resolution had empty names
  - **Root Cause**: `packageKey.split('@')` on `@jest/core@29.7.0` produced `['', 'jest/core', '29.7.0']`, setting `name = ''` and `version = 'jest/core@29.7.0'`
  - **Solution**: Now uses `lastIndexOf('@')` to find version separator for scoped packages
  - **Impact**: Fixes ~324 transitive dependencies per typical npm project, resolves "Version Sprawl" empty package name display issue
  - **Location**: `js/sbom-processor.js` lines 732-750
- **Geocoding Performance**: Integrated geocoding with GitHub profile fetching instead of bulk processing
  - Geocoding now happens inline when fetching GitHub profiles for authors (with visible logging)
  - Previously: bulk geocoded 181 locations as separate phase at 95% progress
  - Now: geocodes during GitHub data extraction phase (faster, better progress tracking)
  - Also geocodes authors who have location from package registries but need country code
  - Batch geocoding at end remains as failsafe for locations from non-GitHub sources
  - **Impact**: Eliminates large bulk geocoding phase, improves performance and UX
  - **Added**: Console logging to show when geocoding happens during GitHub fetch (e.g., `📍 Geocoded location during GitHub fetch for author: "San Francisco" → US`)
- **License Data Persistence (CRITICAL)**: Fixed key format mismatch preventing license data from being saved to database
  - License fetching was successful (1200+ licenses fetched from APIs) but updates failed due to key mismatch
  - Updated `fetchLicensesForAllEcosystems()`, `fetchPyPILicenses()`, and `fetchGoLicenses()` to use correct dependency key format (`name@version` instead of `ecosystem:name@version`)
  - Licenses now properly persist to IndexedDB and display correctly on all pages
  - **Impact**: Resolves 100% license data loss issue
- **Statistics Count Accuracy**: Fixed mismatch between reported and actual dependency counts
  - `statistics.totalDependencies` now uses actual global dependency count (includes transitive dependencies)
  - Previously showed only direct SBOM dependencies (e.g., 126) instead of full count including deep resolution (e.g., 1888)
  - Updated `getRepositoryStats()` to use `this.dependencies.size` instead of stale per-repository counts
  - **Impact**: Resolves 93% undercounting of dependencies in reports and logs
- **Audit Page UI Improvements**: Enhanced "more items" display with interactive modals
  - Multiple locations (2-3): Now shows all locations inline instead of "+ X more location(s)" text
  - Many locations (4+): Displays clickable link that opens modal with complete list
  - Repository lists: Shows all repos (≤3) or modal with all repos (>3)
  - Version drift: Button to view all packages when more than 100 results
  - **Impact**: Eliminates non-interactive "+ X more" text, improves UX with proper modals
- **Authors Page Profile URLs**: Fixed 404 errors on npm, RubyGems, Cargo, and PyPI profile links
  - Profile URLs now only generated when verified username is available in metadata
  - Previously fell back to display names (e.g., "Sindre Sorhus") which caused 404s
  - Now requires `npm_username`, `rubygems_username`, `cargo_username`, or `pypi_username` from metadata
  - Ecosyste.ms links also require verified usernames
  - **Impact**: Eliminates broken profile links, shows only valid URLs that work

### Fixed
- **PyPI Username Extraction (CRITICAL)**: Fixed incorrect PyPI profile URLs (404 errors)
  - **Problem**: PyPI usernames were incorrectly extracted from email addresses (e.g., "marcelo" from "marcelo@trylesinski.com")
  - **Example**: Marcelo Trylesinski's profile generated as `/user/marcelo/` instead of correct `/user/Kludex/`
  - **Root Cause**: PyPI JSON API doesn't provide usernames, code was inferring from email prefix (unreliable)
  - **Solution**: Removed email-based username extraction, only use verified usernames from ecosyste.ms API
  - PyPI profile links now only appear when ecosyste.ms has provided the actual PyPI username
  - **Impact**: Eliminates all PyPI profile 404 errors, ensures only working links are shown
- **Authors Page Function Call Error**: Fixed `authorService.isUrlFromHostname is not a function` error
  - Changed `authorService.isUrlFromHostname()` to `isUrlFromHostname()` (utility function from utils.js)
  - Affects funding URL validation in author details modal and table cells
  - **Impact**: Funding platform detection now works correctly without console errors

### Changed
- **Authors Page Display**: Replaced pagination with simple "Show Top 25 / Show All" toggle
  - Removed complex pagination controls (page size selector, prev/next buttons)
  - Default shows top 25 authors (by repository usage and package count)
  - Toggle buttons in filter section with clear icons and labels
  - Quick-access "Show All X Authors" button appears directly in results when limited
  - Clicking quick-access button switches to "All Authors" view and scrolls to top
  - Preference saved to localStorage
  - **Impact**: Simpler, cleaner UI with faster access to all authors

### Added
- **Analysis Timing and Statistics Tracking**: Comprehensive metadata now saved with every analysis
  - **Timing Data**: startTime, endTime, durationMs, durationFormatted (human-readable)
  - **Ecosystem Statistics**: Dependency count per ecosystem (npm, PyPI, Maven, Go, etc.)
    - Total count, direct count, transitive count, unique packages per ecosystem
  - **Repository Statistics**: Count and dependency totals grouped by language
  - **License Statistics**: Total licenses, licensed vs unlicensed counts, top licenses by frequency
  - **Phase Timing**: Duration breakdown by analysis phase (SBOM processing, dep resolution, vulnerability analysis, etc.)
  - All metadata accessible via IndexedDB for historical analysis
  - Console logs display: `⏱️ Total Time: Xm Ys` and `⏱️ Duration (ms): XXXXms`
  - **Impact**: Full visibility into analysis performance and dependency composition
- **Enhanced Dependency Resolution Progress**: Secondary progress bar now displays detailed package-level progress during dependency tree resolution
  - Shows current package name being processed (extracted from package key)
  - Displays countdown with "X/Y processed" badge and "(Z remaining)" count
  - Progress bar fills incrementally as each package completes
  - Shows ecosystem name (e.g., npm, PyPI, RubyGems) being processed
  - Real-time feedback during dependency resolution phase
- **Latest Version Fallback**: When package version is missing from SBOM, automatically fetch and use latest version from registry
  - Stores both `version` (null) and `assumedVersion` (latest) in dependency objects
  - Displays "latest (assumed)" instead of "version unknown" for better data completeness
  - Ensures depth information is captured during dependency tree resolution
- **Version Drift Analysis During Scan**: Version drift data is now fetched and stored during initial analysis phase
  - Version drift information available immediately after analysis completes
  - No longer requires visiting deps.html page to trigger version drift calculation
- **RubyGems ecosyste.ms Integration**: Added ecosyste.ms API support for RubyGems dependencies and author data
  - Uses `https://packages.ecosyste.ms/api/v1/registries/rubygems.org/packages` as primary source
  - Bypasses RubyGems API CORS limitations (verified via HEAD requests) by using ecosyste.ms proxy
  - Improved RubyGems dependency resolution and author information
- **GitHub Actions License Extraction**: Enhanced license detection for GitHub Actions
  - Fetches license from GitHub repository API (similar to Go modules)
  - Attempts to extract license from LICENSE file at specific tag/ref when available
  - Falls back to default branch if tag doesn't exist
  - Improved license coverage for GitHub Actions dependencies
- **Bot Account Detection**: Separate handling and display of bot accounts in author analysis
  - Detects bot accounts based on name patterns (e.g., `[bot]` suffix) and metadata
  - New "Active Bots in the Environments" table in authors.html
  - Bot accounts excluded from regular author statistics
  - Bot-specific metadata and purpose tracking
- **Dual License Support**: Enhanced license processing to detect and classify dual licenses
  - Detects dual licenses containing "OR", "|", or "/" separators
  - Classifies under least restrictive license from the set
  - Marks dependencies with `isDualLicense: true` flag
  - Displays both licenses in UI with "Dual" badge and full license text in tooltips
- **Independent Entity Detection**: Identifies and marks dependencies with no dependencies of their own
  - Independent entities marked with special flag and "Independent" badge
  - Stale independent entities styled with blue color (instead of red/yellow) to indicate different risk profile
  - Independent entities can remain stale longer without concern
- **GitHub Actions Dependency Graph**: Enhanced workflow parsing to capture complete dependency graph
  - Tracks action lineages (which actions use which other actions)
  - Captures reusable workflows in addition to action steps
  - Stores complete dependency graph with direct dependencies, transitive dependencies, lineage, ancestors, and descendants
  - Improved nested action detection and tracking
- **License Normalization**: Fixed false positives in license change detection
  - Added `normalizeLicenseName()` function to handle license variants (e.g., "GPL-3" vs "GPL-3-only" vs "GPL-3.0")
  - Maps license variants to canonical forms before comparison
  - Prevents false positives when comparing similar license versions

### Changed
- **Default API Timeout**: Increased default API request timeout from 5 seconds to 10 seconds
  - Updated in `js/utils.js`, `settings.html`, and `js/settings.js`
  - Reduces timeout errors during dependency resolution
  - Still configurable via Settings page

### Fixed
- **deps.html Load More Button**: Fixed null reference error when loadMoreBtn element doesn't exist
  - Added defensive null check before attaching event listener
  - Prevents JavaScript errors when button is not present in DOM

## [0.0.3] - 2025-11-17

### Added
- **Repository View Page**: New `repos.html` page for repository-focused statistics and analysis
  - Repository statistics table with SBOM status, vulnerability counts, dependency counts, author counts, and license info
  - Clickable columns navigate to respective pages with repository filter applied
  - Search, sorting, CSV export, and URL parameter support (`org`, `search`)
- **Unified Audit Findings**: Consolidated GitHub Actions and SBOM Deficiencies into single audit findings section
  - Collapsible accordion sections with finding type descriptions shown once per type
  - Direct links to GitHub files with line numbers for audit findings
  - Repository links in SBOM findings navigate to dependency view with filters applied
- **Repository Filter Parameter**: Added `repo` URL parameter support across `deps.html`, `vuln.html`, `licenses.html`, and `authors.html` for deep linking and cross-page navigation

### Changed
- **Code Organization**: Extracted all inline JavaScript and CSS from HTML files to separate files
  - Created `js/utils.js` for shared utility functions
  - Created `js/index-page.js` for index.html-specific functionality
  - Consolidated CSS into utility classes and removed redundant rules
- **Navigation Menu**: Streamlined menu labels ("Vulnerabilities" → "Vulns", "Dependencies" → "Deps", "Analysis" → "Home") and added "Repos" link
- **Theme Support**: Enhanced dark mode with theme-aware CSS variables for table headers, footers, stat boxes, badges, and Bootstrap utility classes
- **Progress Tracking**: Implemented phase-based progress tracking with weighted phases and enhanced status messages
- **Audit Findings Display**: Streamlined display by removing redundant columns and consolidating finding descriptions

## [0.0.2] - 2025-11-08

### Added

#### New Major Features (Pages)
- **Author Analysis**: New author analysis page (`authors.html`) with funding detection (did not exist in v0.0.1)
  - Author deduplication across multiple repositories
  - Funding/sponsorship opportunity detection (GitHub Sponsors, Patreon, Open Collective, Tidelift)
  - Author profile pages with associated repositories and dependencies
  - Filter to show only authors with sponsorship opportunities
  - Cross-repository author identification

- **SBOM Quality Assessment**: New experimental SBOM quality analysis page (`quality.html`) (did not exist in v0.0.1)
  - Quality scoring based on 5 categories: Identification (25%), Provenance (20%), Dependencies (10%), Metadata (10%), Licensing (10%), Vulnerability (25%)
  - Repository-level quality grades (A-F scale)
  - Category breakdown with individual scores
  - Repositories needing attention (top 5)
  - Average category scores visualization
  - Experimental feature marking

#### Enhanced Features
- **Vulnerability Analysis**: Enhanced vulnerability analysis page (`vuln.html`) with OSV.dev integration
  - Vulnerability severity filtering (Critical, High, Medium, Low)
  - Pagination support (25 entries per page with "Load More" functionality)
  - Safe markdown rendering for vulnerability descriptions using `marked.js` and `DOMPurify`
  - Links in vulnerability descriptions open in new tabs with `rel="noreferrer noopener"` for security
  - Combined view showing vulnerabilities across all analyzed organizations
  - Individual vulnerability details with references and external links

- **License Compliance**: Enhanced license compliance page (`licenses.html`)
  - License categorization (proprietary, copyleft, LGPL, permissive, unknown)
  - Risk assessment (low, medium, high)
  - License conflict detection
  - High-risk dependency identification
  - License family grouping
  - Combined view across all organizations
  - Category filtering for license types

- **Dependency Management**: Enhanced dependency view (`deps.html`)
  - **Transitive Dependencies**: Added support for identifying and displaying transitive dependencies (experimental feature, may not cover all ecosystems)
  - Unified table view replacing multiple visualization options
  - Pagination (top 25 entries initially, with "Load More" option)
  - Package name and version merged into clickable `name@version` format
  - Detailed package modal showing:
    - Repository usage
    - Sponsorship opportunities
    - Author information
    - SBOM Quality scores (repository-level)
  - Vulnerability count display (High, Medium, Low) with color coding
  - License markers (5 characters with full name on hover)
  - Sponsorship column with platform-specific icons (GitHub, Patreon, Open Collective, Tidelift)
  - Multiple filters:
    - Organization/analysis selector
    - Search by package name
    - Direct dependencies only
    - Vulnerable dependencies only
    - Sponsorship opportunities only
  - Hash version truncation (first 5 characters with full hash on hover)
  - URL parameter support (`org`, `search`, `ecosystem`, `direct`, `funding`, `vulnerable`)
  - Performance optimizations with lazy loading for funding data and deferred license parsing

- **Statistics Dashboard**: Integrated statistics on main page (`index.html`)
  - Top 5 Ecosystems with dependency counts and icons (clickable links to dependency view)
  - Issues by Severity (Critical, High, Medium, Low) with color coding and links to vulnerability page
  - License Distribution pie chart with tooltips and category links
  - Top 5 Most Commonly Used Dependencies (by `name@version`)
  - Top 5 Dependencies with Version Sprawl (highlighting multi-version dependencies)
  - Collapsible sections for better organization
  - Author funding statistics with links to author page

#### Storage & Data Management
- **IndexedDB Migration**: Migrated from localStorage to IndexedDB for better storage capacity
  - Separate object stores for organizations, repositories, vulnerabilities, and authors
  - Efficient data retrieval and querying
  - Storage compression and optimization
  - Storage usage monitoring in Settings page

- **Data Import/Export**: Enhanced data management capabilities
  - Export all analysis data as JSON
  - Import all data from JSON file
  - Individual organization data export
  - Bulk operations for data management
  - **Granular Export/Import Options** (new):
    - Export/Import all data (analysis + cached databases)
    - Export/Import cached databases only (authors, packages, vulnerabilities)
    - Export/Import analysis data only (organization/repository analysis)
    - Export/Import individual caches (authors, packages, vulnerabilities separately)
    - **Checksum Validation**: All exports include SHA-256 checksums for integrity verification
    - Imports verify checksums before importing to prevent tampering
    - Checksum calculation excludes the checksum field itself for consistency

- **Combined Data View**: Ability to view aggregated data across all organizations
  - Combined vulnerability analysis
  - Combined license analysis
  - Combined author analysis
  - Combined dependency view

#### UI/UX Improvements
- **Theme Support**: Light and dark theme toggle
  - Theme persistence across sessions
  - Consistent theming across all pages
  - Theme toggle button in navigation bar

- **Consistent Layout**: Standardized page layouts and styling
  - Uniform container width (`max-width: 1200px`)
  - Consistent navigation menu across all pages
  - Standardized footer on all pages
  - Consistent spacing and margins (`mb-4` for sections)
  - Bootstrap card-based filter sections

- **Navigation Enhancements**
  - "Back to Analysis" button on detail pages
  - Clickable organization names linking to dependency view
  - Ecosystem cards linking to filtered dependency views
  - Severity cards linking to filtered vulnerability views
  - License category links to filtered license compliance views

- **Loading Indicators**: Improved user feedback
  - Loading spinners during data processing
  - Progress indicators for long-running operations
  - Loading states for pagination

#### Performance Optimizations
- **Lazy Loading**: Deferred data processing for better initial load times
  - Funding data loaded in batches for visible rows only
  - License parsing deferred until needed
  - SBOM quality calculations deferred for dependencies
  - Pagination reduces initial data processing

- **Caching**: Implemented caching mechanisms
  - Cache manager for external API calls
  - Registry data caching
  - Funding data caching

#### Security Enhancements
- **XSS Prevention**: Enhanced security measures
  - Safe markdown rendering with DOMPurify sanitization
  - Proper HTML escaping throughout the application
  - JavaScript string escaping for onclick handlers
  - Secure URL validation using URL constructor
  - Safe link handling with `rel="noreferrer noopener"`

- **Input Validation**: Improved input handling
  - GitHub URL parsing and validation
  - Secure hostname matching for funding URLs
  - Proper escaping of user-provided data

#### Infrastructure
- **GitHub Actions**: Automated deployment workflows
  - Deployment validation workflow
  - GitHub Pages deployment automation
  - File validation checks

- **Dependency Resolution**: Enhanced dependency tree resolution
  - Transitive dependency identification (experimental)
  - Multi-ecosystem support
  - Dependency deduplication across repositories

- **Ecosystem Support**: Improved ecosystem detection and handling
  - Ecosystem icons and display
  - Ecosystem-specific filtering
  - Registry mapping utilities

- **Version Utilities**: Enhanced version handling
  - Hash version detection and truncation
  - Version comparison utilities
  - Version normalization

#### License Compliance Enhancements
- **Expanded License Recognition**: Added support for 40+ additional licenses
  - Permissive licenses: MIT-0, MIT-CMU, 0BSD, Python-2.0, Python-2.0.1, PSF-2.0, CNRI-Python, CC-BY-4.0, OFL-1.1, BlueOak-1.0.0, AFL-2.1, CDDL-1.0, CDDL-1.1, Unicode-DFS-2016, and more
  - LGPL variants: LGPL-2.1-only, LGPL-2.1-or-later, LGPL-2.0-only, LGPL-2.0-or-later, LGPL-3.0-only, LGPL-3.0-or-later
  - Copyleft licenses: EPL-1.0, GPL-1.0-or-later, MPL-1.1, GPL-2.0-only WITH Classpath-exception-2.0
  - LicenseRef-scancode references: public-domain, other-permissive, jsr-107-jcache-spec-2013
- **License Re-processing**: License compliance now re-processes licenses from raw dependency data
  - Ensures latest license classifications are used even for older stored data
  - High-risk dependencies are re-evaluated using current license processor
  - License counts and displayed entries now use consistent, up-to-date classifications

#### Storage Management Improvements
- **Enhanced Storage Status Display**: Improved clarity of storage usage information
  - Changed "total" to "quota" for better clarity
  - Added precise percentage display (e.g., 0.004%)
  - Added informational note when storage includes entity caches after clearing analysis data
  - Better explanation of what storage includes (entity caches vs analysis data)

#### Deployment & Infrastructure
- **GitHub Release-Based Deployment**: Migrated to automated GitHub Actions deployment
  - Deployment now triggered automatically on GitHub release creation
  - Updated `deploy-github-pages.yml` workflow to deploy all required files
  - Fixed deployment workflow to include `quality.html` and remove non-existent `stats.html`
  - Enhanced `validate-deployment.yml` to check all JavaScript modules
  - Updated deployment documentation in `DEPLOY.md`
- **Cache Busting**: Updated all JavaScript and CSS references to use version `v=0.0.2`
  - All HTML files now reference assets with version string for cache invalidation
  - Ensures users always get latest files after deployment

- **License Filtering in Dependency View**: Added license filtering capability to `deps.html`
  - New `license` URL parameter support for filtering dependencies by specific license
  - License filtering logic integrated into `filterTable()` function
  - `getLicenseInfo()` helper function moved to global scope for accessibility
  - View button in License Types table now includes license parameter in URL to filter results

### Changed

- **Statistics Page**: Integrated statistics dashboard into main page
  - Removed: `stats.html` (functionality moved to `index.html`)
  - Statistics now display automatically when analysis results are available

- **SBOM Quality Categories**: Streamlined quality assessment categories
  - Updated weights: Identification (25%), Provenance (20%), Dependencies (10%), Metadata (10%), Licensing (10%), Vulnerability (25%)

- **Storage Architecture**: Migrated from localStorage to IndexedDB
  - Improved storage capacity (from ~5-10MB to gigabytes)
  - Better data organization with separate object stores
  - More efficient querying and retrieval

- **UI Consistency**: Standardized styling across all pages
  - Consistent container width
  - Uniform spacing and margins
  - Standardized filter sections using Bootstrap cards
  - Consistent footer content

- **CSS Loading Order**: Fixed CSS loading order to ensure consistent styling
  - Bootstrap CSS loaded first
  - Font Awesome loaded second
  - Custom `style.css` loaded third (contains max-width override)
  - `themes.css` loaded last

- **License Processing**: License compliance now processes licenses on-the-fly from raw dependency data
  - No longer relies solely on stored license analysis data
  - Ensures consistency between counts and displayed entries
  - Automatically applies latest license classifications to all data

- **License**: Migrated from MIT License to GNU General Public License v3 (GPLv3)
  - Changed to GPL-3.0 to align with project goals and community standards
  - See LICENSE file for full license text

- **License Types Table**: Enhanced View button functionality
  - View button now filters `deps.html` to show only packages with the specific license
  - URL includes `&license={licenseName}` parameter for precise filtering
  - Improved user experience when exploring packages by license type

### Fixed

#### Typography & Text Issues
- **Fixed Typos**: Corrected spelling errors throughout the application
  - Fixed "repositoryy" → "repositories" in vulnerability analysis page
  - Fixed "vulnerabilityies" → "vulnerabilities" in vulnerability count display
  - Improved pluralization logic for better text consistency

#### Display & Formatting Issues
- **License Abbreviation**: Fixed license display in dependencies table
  - Changed "Apach" → "Apache" for Apache licenses
  - Improved handling of compound licenses (e.g., "Apache-2.0 AND MIT")
  - License abbreviations now display correctly while maintaining readability

#### Theme & Color Issues
- **Table Headers in Dark Mode**: Fixed white background issue in dark mode
  - Table headers now use theme-aware `var(--bg-tertiary)` instead of hardcoded light color
  - Text color now uses `var(--text-primary)` for proper theme adaptation
  - Added explicit dark mode override in `themes.css` with `!important` for consistency

- **Footer Backgrounds**: Fixed footer backgrounds not adapting to themes
  - All footers now use theme-aware `var(--bg-secondary)` via CSS override
  - Consistent appearance across all pages in both light and dark modes

- **Stat Box Colors**: Fixed hardcoded colors in statistics boxes
  - Headings now use `var(--color-blue)` for theme adaptation
  - Paragraphs now use `var(--text-secondary)` for proper contrast

- **Badge and Link Colors**: Fixed hardcoded colors for better theme support
  - Badge colors (`.badge-direct`, `.badge-transitive`) now use CSS variables
  - Clickable cell links now use theme-aware colors
  - Vulnerability page links now adapt to themes properly

- **Bootstrap Utility Classes**: Added theme support for Bootstrap classes
  - `bg-light` now uses `var(--bg-secondary)` for theme adaptation
  - `text-dark` now uses `var(--text-primary)` with exception for warning badges that need dark text for contrast

- **Vulnerability Filter**: Fixed issue where vulnerable dependencies filter showed zero results when no organization was selected
  - Now automatically loads combined data when filter is active and no data is loaded

- **Combined Data Loading**: Fixed issues with combined data views
  - Vulnerability analysis now correctly aggregates across all organizations
  - License analysis now correctly combines conflicts, recommendations, and high-risk dependencies
  - Author analysis correctly deduplicates across organizations

- **URL Parameter Handling**: Fixed URL parameter parsing and filtering
  - `search` parameter now correctly filters dependencies
  - `ecosystem` parameter correctly filters by ecosystem
  - `direct` parameter correctly sets direct-only filter
  - `funding` parameter correctly sets sponsorship filter
  - `vulnerable` parameter correctly sets vulnerability filter
  - `severity` parameter correctly filters vulnerabilities

- **Funding Data**: Fixed issue where multiple funding platforms showed same URL
  - Now correctly stores and displays platform-specific URLs (GitHub, Patreon, Open Collective, Tidelift)
  - Each platform icon links to its respective URL

- **Author Funding Count**: Fixed discrepancy between author funding count on index page and authors page
  - Now uses consistent logic for detecting authors with funding opportunities

- **License Status Display**: Fixed issue where license data was not displayed until organization was selected
  - Now shows combined license data by default

- **Vulnerability Pagination**: Fixed issue where only top 10 vulnerabilities were shown
  - Now shows top 25 with "Load More" functionality
  - Fixed "Load More" button error when loading combined data

- **Markdown Rendering**: Fixed plain text rendering of markdown in vulnerability descriptions
  - Now safely renders markdown with proper sanitization
  - Links open in new tabs with security attributes

- **Storage Manager Access**: Fixed `loadMoreVulnerabilities` error where `storageManager` was not accessible
  - Made `storageManager` globally available as `window.storageManager`
  - Fixed inconsistent naming for combined data identifiers

- **CSS Width Issues**: Fixed inconsistent page widths across different pages
  - Standardized container width using consistent CSS loading order
  - All pages now follow uniform `max-width: 1200px` guideline

- **Filter Notice Positioning**: Fixed mispositioned funding filter notice
  - Now correctly displays after the main header row

- **Hash Version Display**: Fixed display of hash versions in dependency table
  - Now shows first 5 characters with full hash on hover and in modal

- **SBOM Quality Display**: Removed incorrect SBOM quality scores from dependency table
  - Quality is now only shown at repository level (as intended)
  - Removed quality column from dependency table and package modal

- **XSS Vulnerabilities**: Fixed multiple XSS vulnerabilities identified by CodeQL
  - Replaced unsafe `innerHTML` assignments with `safeSetHTML` method in `view-manager.js`
  - Fixed unsafe HTML insertion in dependency details, repository details, error messages, and alerts
  - Fixed unsafe modal creation using `insertAdjacentHTML` (now uses safer DOM manipulation)
  - Fixed unsafe pagination HTML concatenation (now uses proper node appending)
  - All user-controlled data now properly escaped before DOM insertion

- **URL Substring Sanitization**: Fixed incomplete URL substring sanitization vulnerabilities
  - Replaced insecure `.includes()` checks for hostname matching with secure `isUrlFromHostname()` method
  - Fixed Patreon, GitHub Sponsors, and Open Collective URL validation in `authors.html`
  - Fixed Go package name parsing in `author-service.js` to use regex matching instead of substring checks
  - Prevents malicious URL bypasses (e.g., `evil.com/patreon.com`)

- **Search Parameter Behavior**: Fixed search parameter behavior in dependency view
  - URL `search` parameter now performs exact match (as intended for hyperlinks)
  - In-page search input retains fuzzy matching behavior
  - Search behavior automatically switches based on input source

- **SBOM Quality Processor**: Fixed parameter mismatch in `generateSummary` method
  - Corrected function signature to match actual parameters (dependencies, metadata)
  - Resolved "ReferenceError: dependencies is not defined" error
  - SBOM quality assessment now works correctly for all repositories

- **License Classification**: Fixed issue where old stored license data showed incorrect classifications
  - Licenses are now re-parsed from `originalPackage` data using current processor
  - Previously unknown licenses (e.g., Python-2.0, CC-BY-4.0, LGPL-2.1-or-later) now correctly classified
  - High-risk dependency lists now reflect accurate license categories

- **Storage Status Display**: Fixed confusing storage usage message
  - Clarified that "total" refers to browser quota, not stored data
  - Added helpful note explaining entity caches persist after clearing analysis data

### Removed


- **Statistics Page**: Removed standalone statistics page
  - `stats.html` (functionality integrated into `index.html`)

- **SBOM Quality Categories**: Removed redundant categories
  - "Structural" category (always SPDX compatible)
  - "Integrity" category (always 0, not supported)

- **Quick Analysis Access Section**: Removed from index page
  - Replaced by integrated statistics dashboard

- **Old Statistics Cards**: Removed old statistics display
  - "Top Languages, Critical Issues, License Status" row
  - Replaced by new Statistics Dashboard section

### Security

- **XSS Prevention**: Enhanced protection against cross-site scripting
  - Implemented safe markdown rendering with DOMPurify
  - Proper HTML escaping throughout application
  - JavaScript string escaping for event handlers
  - Secure URL validation
  - **Comprehensive XSS Fixes**: Fixed all unsafe HTML insertion patterns
    - Replaced all direct `innerHTML` assignments with `safeSetHTML` method
    - Fixed unsafe `insertAdjacentHTML` usage (now uses safer DOM methods)
    - Fixed unsafe HTML concatenation patterns (`innerHTML +=`)
    - Fixed unsafe `outerHTML` assignments (now uses `replaceWith` and `cloneNode`)
    - All error messages and user-controlled data properly escaped
    - Enhanced `safeSetHTML` method to prefer DOMPurify when available, with DOMParser fallback

- **Link Security**: All external links now open securely
  - `target="_blank"` for new tabs
  - `rel="noreferrer noopener"` to prevent tabnabbing
  - Secure URL validation using URL constructor

- **Data Integrity**: Enhanced data export/import security
  - SHA-256 checksum validation for all exported data
  - Checksum verification on import prevents tampering
  - Consistent checksum calculation (sorted keys, excludes checksum field)
  - Import operations validate checksums before proceeding


## [0.0.1] - 2024-07-13

### Added
- Initial release of SBOM Play
- Basic SBOM analysis from GitHub organizations and users
- Dependency tracking across repositories
- Export analysis results as JSON
- Rate limit handling and recovery
- Persistent storage of analysis results
- Multi-organization storage
- Organization management (view, load, remove)
- Bulk export functionality

