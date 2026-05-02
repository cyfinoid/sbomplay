# Changelog

All notable changes to SBOM Play will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Removed
- **Malware page removed from navigation and site** (`malware.html`, `js/malware-page.js`): malware findings are already surfaced on the Findings page, making the standalone Malware page redundant. The page, its page-specific JS, and all nav links have been removed. The vuln-page malware banner now links to the Findings page instead. `malware-service.js` is retained — it still powers MAL- advisory filtering on the Vulns and Findings pages. Workflow files updated to reflect 12 HTML pages.
- **Feeds page removed from top navigation** (`feeds.html`): the page is retained and fully functional but no longer occupies a slot in the header navbar, reducing nav clutter ahead of the upcoming Insights page. Users can still access it via direct URL.

### Fixed
- **Vuln page now enumerates every distinct dependency chain for a transitive vulnerability, matching the deps-page "Dependency Chains" modal** (`js/view-manager.js`, cache-busters bumped on `index.html`, `vuln.html`, `licenses.html`, `audit.html`, `findings.html`, `settings.html`, `debug.html`): when the same transitive dep was brought into a repo by two or more distinct direct dependencies — e.g. `org.apache.tomcat.embed:tomcat-embed-core@10.1.16` reached via both `spring-boot-starter-tomcat` and `tomcat-embed-websocket` — the vuln page's "Used in N repository" block silently dropped all but one chain while the deps page's Dependency Chain modal (reached by clicking the parents-count link in the deps table) correctly listed both. Root cause: three functions in `view-manager.js` each collapsed to a single parent at every hop. `buildDependencyPath` built a `parentMap` with `Map.set` (later writes overwrote earlier ones) so only one immediate SPDX parent of the target survived, then walked upward via `relationships.find()` which returns the first match only. `buildPathFromParents` (the fallback for resolver-discovered deps with no SPDX edge) followed `dep.parents[0]` exclusively. `getVulnerableDepUsage` in turn pushed exactly one usage entry per repo regardless of how many chains actually existed. Three-part fix: (1) `buildDependencyPath` now builds a `childToParents: Map<spdxId, spdxId[]>` multi-map over all non-direct SPDX edges, enumerates every immediate parent of the target, and returns an **array** of `{ isDirect, path, repoKey }` — one per immediate parent. Each upward trace still picks `parents[0]` per intermediate hop (same single-path choice that `deps-page.js::buildDependencyChain` makes, so branching stays bounded for deep diamond graphs) and the existing direct-dep early return now returns a single-element array. (2) `buildPathFromParents` iterates every entry in `dep.parents` instead of only `parents[0]` and returns `string[][]` — one path per parent entry, capped at 10 to prevent combinatorial blow-up. (3) `getVulnerableDepUsage` pushes one usage entry per returned chain in both the SPDX and resolver-fallback branches. The template in `generateVulnerabilityAnalysisHTML` was also restructured: usage is now grouped by `repoKey` before rendering so a repo with multiple chains shows one repo header followed by each chain indented underneath (single-chain repos render with the same inline format as before, preserving visual compactness). Identical chains for the same repo (rare, but possible when SPDX + resolver fallbacks both produce the same path) are de-duped at the grouping step. `uniqueReposCount` still uses a de-duped Set of `repoKey` so the "Used in N repositories" count remains correct. Net effect: a transitive dep brought in by N distinct direct deps now renders N chains on the vuln page, exactly matching what the deps page Dependency Chain modal has always shown.
- **Resolver-discovered transitive dependencies were orphaned (empty `dep.repositories`) after the centralised two-pass attribution shipped with the Pre-Insights Foundations work** (`js/sbom-processor.js`, `js/storage-manager.js`): the new `computeDirectAndTransitive()` Pass 2 BFS walks `dep.children` from each repo's direct-dep seed set, but the registry resolver (`DependencyTreeResolver.resolvePackageDependencies`) only calls `tree.set(childKey, …)` on a node's transitive children — direct deps are passed in as the `parent` argument and are never written into the tree as nodes themselves. Because the decoration loop in `resolveFullDependencyTrees` only writes `dep.children` for tree entries, every direct dep ended up with `dep.children = undefined`, the BFS terminated at the very first pop, and any transitive that the resolver discovered but the SBOM did not enumerate — typical of GitHub-emitted dependency-graph SPDX SBOMs — landed in `this.dependencies` with `repositories: []` / `directIn: []` / `transitiveIn: []`. Net symptom: deps page repo filters were missing entries, the parent → child relationship between SBOM-direct deps and their resolver-discovered children was visually broken, and per-repo splits collapsed for any analysis whose transitive depth came from registry resolution rather than from the SBOM. Two-part fix: (1) `resolveFullDependencyTrees` now builds a parent → children index from each tree node's `treeNode.parents` set during the decoration loop and merges it onto the parent dep's `dep.children` (creating it where it was undefined). The merge is non-destructive — anything the resolver already wrote into `treeNode.children` is preserved — and runs once per ecosystem. (2) `StorageManager._recomputeDirectAndTransitive` now performs the same backfill on stored exports before its Pass 2: it walks every `dep.parents` array on the loaded analysis, builds the inverse parent → children index, and merges it onto each parent dep's `dep.children`, so analyses saved before this fix self-heal on the next page load. The heal stamp is bumped from `_directTransitiveHealVersion = 2` to `3` so analyses already healed by the broken v2 logic re-run through the new pre-pass and recover their parent → child edges and per-repo attributions without requiring a re-scan. Sanity-checked with a single-repo regression scenario (SBOM declares one direct, resolver discovers two transitives) and a two-repo cross-ecosystem scenario (no leak across repos). Cache-busters bumped on every page that loads `js/sbom-processor.js` or `js/storage-manager.js`.

- **Per-dep version-drift, staleness, EOX status, and source-repo status now persist across page reloads** (`js/enrichment-pipeline.js`, `js/sbom-processor.js`, `flowchart.md`): the enrichment pipeline mutated `dep.versionDrift` / `dep.staleness` / `dep.eoxStatus` / `dep.sourceRepoStatus` directly on the in-memory dep array, but `SBOMProcessor.exportData()` rebuilt every dep object from `this.dependencies` Map and emitted a fixed field list — none of those four enrichment fields were in that list. Net effect: every page reload silently erased enrichment, and the deps page / findings page / feeds page would show empty Staleness columns and missing EOX warnings until the user re-ran the analysis. Three new sync helpers (`EnrichmentPipeline.syncDriftToProcessor`, `syncEOXToProcessor`, `syncSourceRepoStatusToProcessor`) mirror the writes back into `sbomProcessor.dependencies` after each enrichment phase, modeled after the existing `LicenseFetcher.syncToProcessor` pattern. `exportData()` and `exportPartialData()` now also emit `versionDrift` / `staleness` / `eoxStatus` / `sourceRepoStatus` per dep (all nullable — renderers already handle undefined). Backward compatible: stored analyses created before this change load with these fields undefined and re-running the analysis populates them on the next save without re-scanning unchanged repos. Cache-busters bumped where applicable. `flowchart.md` updated with the new persistence note.

### Changed
- **Saved-analysis dep shape gains four enrichment fields (`versionDrift`, `staleness`, `eoxStatus`, `sourceRepoStatus`)** (`js/sbom-processor.js`): backward-compatible additive change — old analyses load with the new fields undefined, and re-enrichment populates them. No schema migration required. Pairs with the enrichment-persistence fix above; together they unblock the upcoming Insights page from having to re-derive enrichment on every load.

### Added
- **Package publish-date coverage extended from npm/PyPI/Cargo to also include Maven, Go, NuGet, RubyGems, and Composer** (`js/version-drift-analyzer.js`): `fetchVersionPublishDate` previously returned `null` for every ecosystem outside its three-case `switch`, so Maven/Go/NuGet/Composer/Gem portfolios silently had empty `dep.staleness` — meaning the deps-page Staleness column was wrong, EOL detection skipped them, and Insights' upcoming Package-age chart / Tech-Debt age component would have skewed badly. The switch now also routes Maven/NuGet/Go through Google's deps.dev `GET /v3alpha/systems/{system}/packages/{name}/versions/{version}` (reading the `publishedAt` field, with the `v` prefix added for Go versions per the established `_depsDevVersion` convention), Gem through `https://rubygems.org/api/v1/versions/{name}.json` (matching `number === version`, reading `created_at`), and Composer through `https://repo.packagist.org/p2/{vendor}/{package}.json` (matching `version`, reading `time`). Every new fetch is wrapped in a `_queuedFetch` helper that runs through `requestQueueManager` lanes (`gem`, `ecosystems`) so concurrency / 429-backoff is unified with the author-service. Results are cached in `cacheManager` per `(ecosystem, name, version)` under a new `publishDates[version]` field on the package row — both successful hits and explicit nulls are cached so a single registry hiccup doesn't keep re-firing for the same pair, and publish dates are version-pinned so one round-trip per unique version is enough no matter how many repos use it. Cache-busters bumped on every page that loads `js/version-drift-analyzer.js`. Net effect: Deps-page Staleness column now populates correctly for Maven/Go/NuGet/Composer/Gem on the next analysis run.
- **Repository metadata (push date, primary language, default branch) now captured on every repo and persisted to the saved analysis** (`js/github-client.js`, `js/sbom-processor.js`, `js/app.js`): the user-repo GraphQL query in `getUserRepositoriesGraphQL` is extended with `pushedAt` / `primaryLanguage { name }` / `defaultBranchRef { name }`, mapped onto the same `pushed_at` / `language` / `default_branch` REST keys already returned by the org-listing and single-repo paths so downstream code sees one shape regardless of source endpoint. `SBOMProcessor.processSBOM` gains an optional `meta = { pushedAt, primaryLanguage, defaultBranch }` parameter that is propagated onto every `repoData` entry; `exportData()` and `exportPartialData()` emit the three nullable fields on every entry in `allRepositories[]` so the saved analysis durably carries them. `js/app.js` populates `meta` on the org-listing path (REST `getOrganizationRepos`/GraphQL user-repos), the single-repo path (REST `getRepository`), and the no-SBOM-stub path (so archived / no-dependency-graph repos still contribute hygiene signal). The upload path correctly leaves `meta = null` (no GitHub metadata available for uploaded SBOMs). Cache-busters bumped on every page that loads `js/github-client.js`. Reach: enables the upcoming Insights repo-hygiene activity-bucket histogram, Language-stack section, and per-repo CSV export to read the host repo's actual GitHub metadata instead of inferring it from dep ecosystems.

### Changed
- **Direct vs transitive attribution is now computed once, in a centralised two-pass post-pass, instead of being mutated piecemeal inside each per-ecosystem resolver loop** (`js/sbom-processor.js`, `js/storage-manager.js`, `about.html`): a new `SBOMProcessor.computeDirectAndTransitive()` runs after every `processSBOM` and again after `resolveFullDependencyTrees` finishes; it resets every dep's `repositories` / `directIn` / `transitiveIn` and rebuilds them from (Pass 1) walking each repo's SBOM-declared dependencies against the repo's `directDependencies` set, then (Pass 2) BFS-ing from each repo's direct seed set through `dep.children` registry edges so resolver-discovered transitives that the SBOM never enumerated also get attributed correctly. Pass 1 always wins on direct classification — Pass 2 never overwrites a direct mark with a transitive one, so the SBOM remains the source of truth for what the team consciously declared. The corresponding mirror `StorageManager._recomputeDirectAndTransitive` runs at load time so legacy stored analyses self-heal on the next page load (stamped via `_directTransitiveHealVersion = 2`); no re-scan is required. A new "Direct vs Transitive Classification & Dependency Depth" methodology card on `about.html` documents the algorithm, the cross-ecosystem-leak rationale, and the imputed-direct-global concept that the upcoming Insights page will surface.
- **`dep.repositoryLicense` renamed to `dep.consumerRepoLicense`** (`js/sbom-processor.js`, `js/view-manager.js`, `js/deps-page.js`, `js/license-processor.js`, `js/storage-manager.js`, `js/app.js`): the field semantically is "the license of the host/consumer repository this dep was found in", **not** "the dep's own license", but several readers (`view-manager.js::getDependencyLicenseInfo`, `deps-page.js`'s licence column) were treating it as a final fallback for the dep's own license — so an Apache-2.0 host using a license-less GPL transitive dep would render as Apache-2.0 across the licences page, the compatibility checker, and the licence distribution pie. The field is now consumed only by `LicenseProcessor.isDependencyCompatibleWithRepository(dep, consumerRepoLicense)` (parameter also renamed for clarity). The legacy `repositoryLicense` field on stored analyses is preserved as `consumerRepoLicense` by `StorageManager._migrateLegacyRepositoryLicense` on load and never read as a license source. The no-SBOM-stub repo path in `app.js` was also using `repositoryLicense` as the field name on the **repo** entry (a misnomer — regular repos use `license`); it is now `license`, matching the regular `processSBOM` repo shape, so license-readers downstream find a value here too. Cache-busters bumped on every page that loads any of the modified scripts.

### Fixed
- **Cross-ecosystem leak in the per-ecosystem resolver's parent-trace fallback no longer mis-attributes transitive deps across ecosystems** (`js/sbom-processor.js`): the previous `reposWithDirectDeps`-based fallback for resolver-discovered deps with no SBOM repo association attributed the dep to **every repo in the scan that had any direct dep in any ecosystem**, so when npm and Maven resolved concurrently a Maven-only dep with no SBOM-listed repos got attributed to repos that only had npm direct deps (and vice versa). The new centralised `computeDirectAndTransitive` runs Pass 2 BFS through `dep.children`, which only contains same-ecosystem children — so cross-ecosystem leak is impossible by construction. The accompanying "fix dependencies without repository associations" safety-net in `exportData()` is removed as well; with the two-pass attribution there are no orphan deps to silently mis-attribute.
- **Author location fetching no longer silently fails when the always-on contributor enrichment produces more than ~2,500 unique GitHub logins** (`js/github-client.js`, `js/author-service.js`, `js/app.js`, `settings.html`, `js/settings.js`): the contributor-enrichment change (v0.0.9) removed the opt-in gate, which typically inflated unique GitHub logins from a few hundred to ~4,800+. `getUsersBatchGraphQL` queried each login twice (`user(login)` + `organization(login)`), doubling the GraphQL point cost to ~9,600 — well over GitHub's 5,000 pts/hr budget. `makeGraphQLRequest` then threw on any `result.errors` (including partial successes where e.g. one bot account returned null), discarding all valid data from the batch. Bot logins like `dependabot[bot]` also caused GraphQL syntax errors. **Five fixes ship together:**
  1. **Union query (`repositoryOwner`):** replaced the dual `user(login)` + `organization(login)` pair with a single `repositoryOwner(login)` union query — 1 GraphQL point per login instead of 2.
  2. **Partial-error tolerance:** `makeGraphQLRequest` now returns `result.data` when both `data` and `errors` are present, so 49 successful profiles in a 50-user batch are no longer discarded because one login returned an error.
  3. **Bot filtering:** logins ending in `[bot]` are filtered out before the GraphQL query — they have no location/company and their bracket syntax causes query errors.
  4. **Budget cap with contribution-based prioritisation:** when the unique-login count exceeds 4,900, authors are sorted by contribution count (descending; registry maintainers sort first) and only the top 4,900 are fetched. `authorAnalysis.locationSkippedCount` records how many were deferred.
  5. **Settings: "Fetch Remaining Author Locations" button:** a new card on the Settings page counts authors still missing location data and lets users incrementally fetch them (up to ~4,900 per click), so the full dataset can be completed after hourly rate limits reset.

### Added
- **Author Location Enrichment card now shows a real progress bar instead of a single static status line** (`settings.html`, `js/settings.js`, `js/author-service.js`, `js/github-client.js`): the "Fetch Remaining Author Locations" button on the Settings page previously printed "Loading author entities..." then "Found X authors missing location. Starting GraphQL fetch..." and then went silent for the entire batch. For users running near the ~4,900 GraphQL-budget cap that meant several minutes of "is it stuck?" with no feedback. Two new optional `onProgress` callbacks were threaded through the pipeline: `GitHubClient.getUsersBatchGraphQL(usernames, onProgress)` now fires after each 50-user GraphQL chunk with `{ fetched, total, cached }`, and `AuthorService.fetchAuthorLocationsBatch(authors, onProgress)` now reports across three phases — `geocode-existing` (geocoding authors that already have a location string but no countryCode), `github-fetch` (forwarded chunk progress from `getUsersBatchGraphQL`), and `persist-results` (geocoding + saving each fetched profile to IndexedDB) — each emitting `{ phase, processed, total, message }`. The Settings card gained a Bootstrap striped+animated progress bar (`#locationFetchProgressContainer`, hidden via `d-none` until the fetch starts) below the existing status text; `_fetchRemainingLocations` maps phase progress to weighted overall percentage (`geocode-existing` 0–10%, `github-fetch` 10–85%, `persist-results` 85–100%) using the existing `progress-bar-dynamic` CSS class with `--progress-width` so the width animates smoothly. The bar briefly holds at 100% on success before fading out, hides immediately on error, and falls back to the existing inline status span for screen-reader / no-progress-bar scenarios. Also tidied: replaced the existing inline `style="display:none;"` on `#locationEnrichmentStatus` with `d-none` so the new and old containers use the same Bootstrap show/hide pattern. Cache-busters bumped on every page that loads `js/github-client.js` or `js/author-service.js` (`index.html`, `audit.html`, `authors.html`, `debug.html`, `deps.html`, `findings.html`, `licenses.html`, `malware.html`, `settings.html`, `vuln.html`).
- **`plans/` folder now archives design plans drafted in chat that were not already captured under `mdfiles/`** (`plans/001-insights-page-initial-design.md`, `plans/002-rebuild-from-0ab213a.md`, `plans/003-malware-monitoring-exploration-a.md`, `plans/004-malware-monitoring-exploration-b.md`, `plans/005-unified-opml-feed-plan.md`, `plans/006-author-fetching-optimization.md`, `plans/007-stats-cards-audit-plan.md`, `plans/008-about-page-methodology-docs.md`, `plans/009-insights-chartjs-migration.md`, `plans/010-dashboard-reuse-insights-stats.md`, `plans/011-direct-vs-transitive-everywhere.md`, `plans/012-pin-github-actions-skill.md`, `plans/README.md`): prior chat sessions produced substantial design / feasibility / planning artefacts (Insights page initial design, Insights revamp to Chart.js, direct-vs-transitive split, stats-card audit, about-page methodology cards, author-fetching pipeline optimization, unified OPML feed, malware-monitoring exploration, index-dashboard reuse of insights stats, pin-GitHub-Actions-by-SHA skill, and the `0ab213a` rebuild record) that only lived inside chat transcripts and were not discoverable alongside the codebase. Each plan has been extracted into a dedicated markdown file in the new `plans/` folder, preserving the user prompts and the assistant's narrative / proposal turns (tool actions are intentionally omitted — the goal is to preserve the *design record*, not the full execution trace). `plans/README.md` indexes every file with its title, first-discussion timestamp, and source transcript id. Pre-existing standalone design docs (`mdfiles/rebuild-from-0ab213a.md`, `mdfiles/planning.md`, `mdfiles/v0.0.5-planning`, `mdfiles/STORAGE_ARCHITECTURE_PROPOSAL.md`, …) remain under `mdfiles/` and are cross-referenced from the new README so nothing is duplicated.

### Changed
- **GitHub repository contributor enrichment is now always-on; the per-package "Enable contributor correlation" setting was removed** (`js/author-service.js`, `settings.html`, `js/settings.js`, `js/authors-page.js`, `about.html`, cache-busters bumped on `index.html`, `authors.html`, `settings.html`, `debug.html`, `about.html`): the previous build (T3.2) gated the GitHub-contributor enrichment step behind `localStorage.enableContributorCorrelation`, defaulting to **off** with the rationale "extra GitHub API call per unique repo + tentative-quality entries". Both rationales are now obsolete: (1) the per-run `_contributorsRequestCache` already dedupes by `${owner}/${repo}`, so a 159-package Spring Boot SBOM whose deps all point at `spring-projects/spring-boot` issues exactly **one** `/contributors` REST call regardless of how many packages share the repo, and (2) the post-pipeline `fetchAuthorLocationsBatch` fills `location` / `company` / `type` via batched GraphQL — never per-user REST — so each contributor costs a fraction of a GraphQL node, not a full REST call. With the cost concern dissolved, the behaviour is unconditionally on: every package whose source URL points to `github.com` now contributes its top **10** repository contributors to the package's author list, marked `tentative_correlation: true` (rendered as a <span> ⚠️ badge </span> in the location column). Bots (`dependabot[bot]`, `github-actions[bot]`, `renovate[bot]`, `pre-commit-ci[bot]`, …) are intentionally NOT filtered at the enrichment stage — `js/authors-page.js::isBotAccount` already segregates them into a dedicated "Active Bots in the Environments" collapsible section, so the human authors table stays clean while the bot inventory remains visible. The Authors page intro alert now explicitly discloses the new sourcing ("top 10 GitHub repository contributors per package, marked ⚠️ in the location column; bots are routed to the Active Bots section below"), and a new "Author Enrichment Methodology" card on `about.html` documents the source-precedence ladder (native registry → ecosyste.ms → GitHub `/contributors`), the cost model (one REST call per unique repo, deduped via `_contributorsRequestCache` + batched GraphQL profile fill), and the shared-repository attribution rationale (when N packages share a code repo — e.g. `spring-projects/spring-boot`, `babel/babel`, `angular/angular` — they will all list the same contributors, which is the correct threat-model behaviour because a compromise of that single repo is a compromise of all N packages that ship from it). The `enableContributorCorrelation` checkbox is removed from `settings.html` and the corresponding load/save code is removed from `js/settings.js`; "Reset to Defaults" still calls `localStorage.removeItem('enableContributorCorrelation')` so the stale key is purged from existing users' localStorage on next reset. Rationale: this enrichment is the only path to author attribution for ecosystems whose registries publish a single maintainer-of-record (Maven, NuGet, Go) or no author info at all, and gating it off by default meant those ecosystems silently had no usable Authors-page data — making the gate a footgun rather than a cost-control. Cache-busters bumped on every page that loads any of the modified scripts.

- **License + source-repo fetching consolidated into `LicenseFetcher` — one deps.dev call per package instead of two** (`js/license-fetcher.js`, `js/app.js`, `index.html`, `audit.html`, `debug.html`, `findings.html`, `licenses.html`, `settings.html`, `vuln.html`): the previous "Maven `repositoryUrl` was still `null`" fix wired `LicenseFetcher.fetchLicenses(deps)` into `runLicenseAndVersionDriftEnrichment` *after* the existing legacy trio (`fetchPyPILicenses`, `fetchGoLicenses`, `fetchLicensesForAllEcosystems`), each of which already issued its own deps.dev `GET /v3alpha/systems/{system}/packages/{name}/versions/{ver}` per package. For every dep without a license (which is most of them on a fresh scan) deps.dev was therefore being hit **twice**: once by the legacy loop (extracting only `data.licenses`), once by `LicenseFetcher` (extracting `data.licenses` + `data.links[].SOURCE_REPO/HOMEPAGE/ISSUE_TRACKER`). That violates the project rule "make each API call once, extract all useful info in one shot" and roughly doubles the deps.dev request budget on every analysis. Fix: the three legacy functions are deleted (~570 lines), and the unique behaviour each one had is now folded into `LicenseFetcher` so the remaining single call is a strict superset:
  - **Go `v` prefix normalization** (`_depsDevVersion`): deps.dev requires `v1.2.3`, not `1.2.3`, for Go module versions; the legacy `fetchGoLicenses` did this transparently and the previous `LicenseFetcher` did not, so any Go SBOM with bare-numeric versions was getting 404s on every package.
  - **Version-range cleaning** (`_cleanVersion`): SBOMs from `pip freeze`-style tooling sometimes ship range specifiers like `1.0.108,< 2.0.0` or whitespace-padded ranges like `3.5,< 4.0` in the version field; deps.dev rejects those as invalid. The lower-bound (everything before the first `,` or space) is now picked before encoding, matching the legacy `fetchLicensesForAllEcosystems` behaviour.
  - **PyPI JSON API fallback** (`_fetchPyPIFallbackLicense`): when deps.dev returns no license for a PyPI package, the new fallback hits `pypi.org/pypi/{name}/json` once and walks PEP 639 `info.license_expression` → free-text `info.license` (with canonicalization heuristics for >100-char text into SPDX IDs) → Trove `classifiers[]` (`License :: OSI Approved :: MIT License` → `MIT`). Only fires when deps.dev didn't return a usable license, so it doesn't add an unconditional second call.
  - **GitHub-API fallback for `github.com/...` Go modules** was already in `LicenseFetcher` — kept and now also runs through `_applyLicenseToDep` for consistent persistence.
  - **SPDX display formatting** (`_formatLicenseDisplay`): the licenses-page table cells were rendered by the legacy code with a 8-character truncation rule (`Apache-2.0 AND MIT` → display `Apache`, single IDs >8 chars get `...` truncated, single `Apache*` collapses to `Apache`). Ported verbatim so the table looks identical after the consolidation.
  - **Persistence parity** (`_applyLicenseToDep`): the legacy code also wrote `dep._licenseEnriched = true` (read by `js/deps-page.js` to render the green "✓ enriched" badge) and `dep.originalPackage.licenseConcluded` / `licenseDeclared` (read by `js/sbom-processor.js::exportData` as a fallback when the live `dep.license` is missing on a re-export). Both writes are now done by the new `_applyLicenseToDep` helper, and `syncToProcessor` mirrors the same fields onto the processor's `dependencies` Map entry, so the deps-page badge and the export-round-trip both keep working.
  - **`composer` / `packagist` removed from the deps.dev ecosystem map**: deps.dev does not serve Packagist (`/v3alpha/systems/packagist/...` 404s, and the previous fallback to `npm` 404'd on every Composer package name as well). The map was issuing one wasted 404 per Composer package per analysis. Composer license + repo URL come from `AuthorService.fetchFromEcosystems` (ecosyste.ms covers `packagist.org` natively).
  Net effect: one deps.dev GET per package, license + source-repo links extracted from the same response, all the legacy fallbacks preserved. ~570 lines of duplicated code removed from `js/app.js`. Cache-busters bumped on every page that loads `js/app.js` or `js/license-fetcher.js`.

### Fixed
- **Maven `repositoryUrl` was still `null` on every dep on `feeds.html` / `findings.html` / the saved analysis blob, even after the prior cleanup had wired up `LicenseFetcher` + `AuthorService` + the package-cache hydrator** (`js/app.js`, `js/settings.js`, `js/enrichment-pipeline.js`, `js/author-service.js`, `js/version-drift-analyzer.js`): the user reported that re-scanning `sbomplay-demo/maven-deep-deps` produced an export (`sbomplay-demo-data.json`) where all 159 Maven deps had `repositoryUrl: null`, `homepage: null`, `issueTrackerUrl: null`, the package cache had `repositoryUrl: null` for all 201 Maven entries, the `authorAnalysis` blob recorded `totalPackages: 6` (out of 159), and `phaseTiming.author-analysis` was 8 ms — i.e. author-fetch never actually ran for Maven. Three independent bugs in the GitHub-flow code path stopped the previously-fixed enrichment logic from ever reaching Maven packages:
  1. **`SBOMPlayApp.analyzeAuthors` filtered the dep array down to `dep => dep.purl`**, but the SBOM resolver only attaches a PURL to the top-level packages — every transitive dep arrives with `dep.purl === null`. For maven-deep-deps that meant 6 of 159 Maven deps even reached `fetchAuthorsForPackages`. This was the primary reason `totalPackages: 6`. Fixed: build the package list from `dep.name + dep.category.ecosystem` (which the SBOM parser populates for every dep, including transitives) and only fall back to the PURL when one of those is missing.
  2. **`SBOMPlayApp.getPackageNameFromPurl` returned the PURL-spec slash form for Maven** (e.g. `org.springframework.boot/spring-boot-starter-web`), but every Maven-aware lookup we issue downstream — ecosyste.ms package endpoint, deps.dev, the canonical `dep.name` field — expects the colon form (`org.springframework.boot:spring-boot-starter-web`). Verified live: `…/registries/repo1.maven.org/packages/org.springframework.boot%2Fspring-boot-starter-web` → 404, colon form → 200 with full `repository_url` / `homepage` / `registry_url`. Even the 6 packages that did pass the PURL filter were therefore querying ecosyste.ms with a 404-yielding URL. Fixed: `getPackageNameFromPurl` (in both `js/app.js` and `js/settings.js`) now detects `pkg:maven/...` and rewrites `/` → `:`. Other ecosystems are untouched.
  3. **`runLicenseAndVersionDriftEnrichment` only used the legacy `fetchLicensesForAllEcosystems` deps.dev path, which short-circuits any dep that already has a license**, and Maven SBOMs almost always inline a license. So deps.dev was never queried for Maven, the labeled `links[]` array (`SOURCE_REPO` / `HOMEPAGE` / `ISSUE_TRACKER`) was never read, and `dep.repositoryUrl` stayed `null` — even though the recently-introduced `LicenseFetcher.fetchLicenses` filter (`!hasLicense || !hasRepoUrl`) was specifically designed to fetch links when the license was already known. Fixed: after the legacy license loops, `runLicenseAndVersionDriftEnrichment` now calls `window.licenseFetcher.fetchLicenses(deps)` followed by `window.licenseFetcher.syncToProcessor(deps, sbomProcessor)`. `LicenseFetcher`'s `_applyDepsDevLinks` then promotes deps.dev's `SOURCE_REPO` / `HOMEPAGE` / `ISSUE_TRACKER` onto `dep.repositoryUrl` / `dep.homepage` / `dep.issueTrackerUrl` (only if not already set, so SBOM externalRefs / native registry / ecosyste.ms still win) and `syncToProcessor` mirrors them into the live `sbomProcessor.dependencies` Map, so the `exportData()` immediately afterwards persists them into the saved analysis blob.
  Plus two consequential fixes: `analyzeAuthors` now also calls `EnrichmentPipeline.hydrateRepoUrlsFromPackageCache(deps, sbomProcessor)` after `fetchAuthorsForPackages` so the URLs `AuthorService` writes into the package cache (from ecosyste.ms's `repository_url` field, which is the only path for ecosystems that have no native fetch — Maven, NuGet, Go, …) get mirrored back onto the in-memory dep array AND the live processor map. The hydrator was previously a private method on `EnrichmentPipeline` (`_hydrateRepoUrlsFromPackageCache`) usable only by the upload flow; it's now a static `EnrichmentPipeline.hydrateRepoUrlsFromPackageCache(deps, sbomProcessor)` shared by both flows per AGENTS.md "Never duplicate implementations". And `saveVersionDriftToCache` / `saveStalenessToCache` / `AuthorService.saveAuthorsToCache` previously stored `name: packageKey.split(':')[1]` on every package-cache row; that truncates Maven names because Maven coordinates are themselves colon-separated (`groupId:artifactId`) — the cache ended up with rows like `name: 'org.springframework.boot'` for what was actually `org.springframework.boot:spring-boot-starter-web`. All three call-sites now strip only the leading ecosystem segment (`packageKey.slice(packageKey.indexOf(':') + 1)`), so Maven artifact names are preserved end-to-end. Net effect on a fresh re-scan: every Maven dep has `repositoryUrl` populated (from deps.dev `SOURCE_REPO` for direct deps, falling back to ecosyste.ms `repository_url` written by `AuthorService` and hydrated back onto the dep array), `feeds.html` resolves to GitHub release feeds for the `spring-projects/spring-boot`-bearing Maven coordinates instead of "Uncovered + no source repo was found in the SBOM", and the Findings "Dead Source Repos" detector finally sees Maven candidates. Cache-busters bumped on every page that loads any of the modified scripts (`index.html`, `debug.html`, `settings.html`, `vuln.html`, `licenses.html`, `authors.html`, `deps.html`, `audit.html`, `findings.html`, `malware.html`).
- **Feeds page kept showing "Maven has no native per-package feed and no GitHub source repo was found in the SBOM" even after repo URLs were captured by enrichment** (`js/feed-url-builder.js`, `js/feeds-page.js`, `js/deps-page.js`, `js/enrichment-pipeline.js`, `js/sbom-processor.js`): the prior cleanup made `LicenseFetcher` set `dep.repositoryUrl` from deps.dev `links[].SOURCE_REPO` and made `AuthorService` persist `repository_url` / `homepage` to the per-package IndexedDB cache for ecosystems like Maven / NuGet / Go that have no native registry fetch — but three gaps stopped that data from reaching `feeds.html`. (1) `SBOMProcessor.exportData()` / `exportPartialData()` built the saved-analysis dep blob from a fixed list of fields that did **not** include `repositoryUrl` / `homepage` / `issueTrackerUrl`, so even when the in-memory dep object carried the URL it was discarded on save and the next page load saw `dep.repositoryUrl === undefined`. (2) `EnrichmentPipeline.fetchAuthors` wrote URLs only into the package cache, never mirroring them back onto the dep array / processor map, so the AuthorService-only path (Maven, NuGet, Go) had nothing to export in the first place. (3) Stored analyses produced before this change had no way to backfill — the `packages` IndexedDB store had the URLs but the dep array consumed by `feed-url-builder.resolveAll(...)` did not. Net effect: every Maven coordinate on `feeds.html` resolved to "Uncovered" with the misleading "no GitHub source repo was found" reason, even when the repo URL was sitting one IndexedDB read away. Now: (a) `SBOMProcessor.exportData` and `exportPartialData` both emit `repositoryUrl` / `homepage` / `issueTrackerUrl` / `repositoryUrlSource` on every dep, so newly enriched analyses persist them durably; (b) `EnrichmentPipeline.fetchAuthors` calls a new `_hydrateRepoUrlsFromPackageCache(deps)` helper after the AuthorService run, looking up `${ecosystem}:${name}` in `cacheManager.getPackage(...)` and copying `repository_url` / `homepage` / `issueTrackerUrl` onto the dep array AND the sbomProcessor's Map — non-destructive (deps.dev / native-registry / SBOM externalRef wins if anything is already set), so the source-of-truth ordering the rest of the pipeline assumes is preserved; (c) a new `FeedUrlBuilder.hydrateFromCache(deps)` performs the same cache lookup at read time, called from `feeds-page.js::loadAnalysis` and `deps-page.js::exportOPML` before `resolveAll` / OPML emission, so existing stored analyses self-repair on the next page load as long as the user has re-enriched authors (which is also what writes the URLs into the package cache in the first place). The user-facing "Uncovered + no source repo" reason now only fires when neither the SBOM, the deps.dev `SOURCE_REPO` link, the native registry, nor the ecosyste.ms `repository_url` field returned anything, which is the truthful state. Cache-busters bumped on every page that loads any of the modified scripts (`feeds.html`, `deps.html`, `index.html`, `malware.html`, `licenses.html`, `settings.html`, `vuln.html`, `findings.html`, `debug.html`, `audit.html`).
- **Maven version-drift was silently returning `null` for every Maven package** (`js/registry-utils.js`): `RegistryManager._fetchMavenLatestVersion` constructed the ecosyste.ms URL as `…/registries/repo1.maven.org/packages/{groupId}/{artifactId}` (slash separator) — that path returns 404 for every Maven coordinate. ecosyste.ms expects `groupId:artifactId` URL-encoded as a single path segment (`%3A`), e.g. `…/packages/org.springframework%3Aspring-core` → 200 OK with full metadata. Verified across `org.springframework:spring-core`, `junit:junit`, and `com.fasterxml.jackson.core:jackson-core` (slash form 404, colon form 200). The bug was hidden because callers only logged a soft `⚠️ Failed to fetch Maven version` and treated `null` as "no drift", so every Maven package in every Maven-bearing SBOM showed up as up-to-date on the Deps and Findings pages even when months/years out of date. The fix joins the parsed `groupId:artifactId` and passes the full coordinate through `encodeURIComponent` once, matching the same convention `AuthorService.fetchFromEcosystems` was already (correctly) using for the authors pipeline.
- **Maven packages had no source-repository URL captured anywhere in the analysis** (`js/author-service.js`, `js/license-fetcher.js`, `js/enrichment-pipeline.js`): `AuthorService.getRepositoryUrl` had cases for `npm`/`pypi`/`cargo`/`gem` but no `case 'maven'`, returning `null` for every Maven package; `fetchFromEcosystems` extracted only `maintainers`/`owners`/`author` and discarded the `repository_url` / `homepage` / `registry_url` fields ecosyste.ms returns on the same response; and `LicenseFetcher.fetchLicenseForPackage` read only `data.licenses` from deps.dev and ignored the `data.links[]` array (which deps.dev populates with labeled `SOURCE_REPO` / `HOMEPAGE` / `ISSUE_TRACKER` entries for every supported ecosystem). Net effect: `dep.repositoryUrl` was always `undefined` for Maven (and for any ecosystem that hit the ecosyste.ms-only path), so feed-url-builder, the Findings "Dead Source Repos" detector, and the GitHub-contributor correlation step had no GitHub URL to work from. `fetchFromEcosystems` now returns `{ authors, repositoryUrl, homepage, registryUrl, description, licenses, fundingLinks }`; `fetchAuthors` plumbs those into a new `packageMetadata` blob persisted by `saveAuthorsToCache` (non-destructive merge); `getRepositoryUrl` gains a `case 'maven'` that hits the same ecosyste.ms endpoint as a defensive backup; `LicenseFetcher.fetchLicenseForPackage` now also calls `_applyDepsDevLinks(dep, data.links)` to set `dep.repositoryUrl` / `dep.homepage` / `dep.issueTrackerUrl` on every package (only when not already set, so native-registry data wins); `LicenseFetcher.syncToProcessor` mirrors the new fields back into `sbomProcessor.dependencies`; and `EnrichmentPipeline.validateSourceRepos` now also walks `dep.repositoryUrl` and `dep.homepage` (not just `externalRefs`) so dead-repo detection actually fires for Maven / NuGet / Go packages whose SBOMs lack a `SOURCE-CONTROL` externalRef.

### Changed
- **License fetching deduplicated to a single shared service** (`js/enrichment-pipeline.js`, `js/license-fetcher.js`, `index.html`): `EnrichmentPipeline.fetchAllLicenses` previously inlined its own deps.dev fetch loop (`fetchLicenseForPackage`, `fetchLicenseFromGitHub`, `syncLicensesToProcessor`, `ecosystemMap`) that duplicated the logic in `LicenseFetcher`, in violation of the AGENTS.md "Never duplicate implementations" rule. The pipeline now delegates to `window.licenseFetcher.fetchLicenses(...)` followed by `window.licenseFetcher.syncToProcessor(...)`, removing ~120 lines of duplicate code and ensuring the GitHub flow and the upload flow share identical license + source-repo enrichment behavior. `js/license-fetcher.js` is now loaded by `index.html` (it was listed in the deploy workflow's required files but no `<script>` tag actually loaded it before, so `window.licenseFetcher` was undefined whenever the GitHub flow ran). `LicenseFetcher` itself was extended to capture deps.dev `links[]` (see Fixed above) and to sync repository / homepage / issue-tracker URLs to the processor, so callers downstream of license enrichment now see the augmented data.
- **Dead `search.maven.org` URL templates removed** (`js/version-drift-analyzer.js`, `js/dependency-tree-resolver.js`, `about.html`): the Maven Central Solr API still blocks browser CORS (verified: preflight returns `403`, GET returns `200` from curl but with no `Access-Control-Allow-Origin` header — CHANGELOG decision from the original CORS fix is unchanged). The `maven` entry in `VersionDriftAnalyzer.registryUrls` and `DependencyTreeResolver.registryAPIs` was never read at runtime — both modules delegate Maven version lookups to `RegistryManager` (which uses ecosyste.ms) and Maven dependency resolution to deps.dev — so the unused config was misleading future readers. The `version-drift-analyzer` map is now trimmed to only `npm`/`pypi`/`cargo` (the ecosystems that actually have direct date-fetch helpers in this file), and `dependency-tree-resolver`'s `registryAPIs` is trimmed to the four registries it actually fetches from. The `search.maven.org` row in the about-page "Package Registries" table is replaced with `packages.ecosyste.ms` and an updated `api.deps.dev` row that documents the labeled `SOURCE_REPO` / `HOMEPAGE` / `ISSUE_TRACKER` link surface; cache-busters bumped on every page that loads any of the modified scripts (`index.html`, `about.html`, `authors.html`, `debug.html`, `deps.html`, `findings.html`, `licenses.html`, `malware.html`, `settings.html`, `vuln.html`).

### Added
- **Debounced 150 ms loading overlay on every filterable table page** (`js/common.js`, `js/audit-page.js`, `js/vuln-page.js`, `js/malware-page.js`, `js/licenses-page.js`, `js/feeds-page.js`, `js/repos-page.js`; cache-busters bumped on `audit.html`, `authors.html`, `debug.html`, `deps.html`, `feeds.html`, `findings.html`, `index.html`, `licenses.html`, `malware.html`, `repos.html`, `settings.html`, `vuln.html`): Filtering large tables (e.g. selecting a severity on `vuln.html`, an ecosystem on `malware.html`, a search term on `repos.html` / `feeds.html`, a section on `audit.html`, a license category on `licenses.html`) used to either freeze the table silently while the new render computed, or — for very fast filters — flash an instantly-removed spinner that just looked like a flicker. Two new helpers `showFilterLoading(containerId, opts = { delay: 150, message: 'Loading...' })` and `hideFilterLoading(containerId)` in `js/common.js` arm a per-container debounce timer: if the wrapped work completes before `delay` (default 150 ms) elapses, no overlay is ever rendered and the user sees a clean instant update; if the work takes longer, an absolutely-positioned `.loading-overlay` (background dim + centred Bootstrap `spinner-border` + "Loading..." label) appears over the relevant card. State is held in a module-level `Map` keyed by container id so multiple concurrent overlays on different pages coexist without leaking; container `position` is auto-promoted from `static` to `relative` on first use; the overlay DOM is reused if the host page already ships a `.loading-overlay` child (feeds / repos / deps cards), or injected on first use otherwise. Both helpers are exposed via `window.showFilterLoading` / `window.hideFilterLoading` aliases so they're reachable from any caller pattern. The overlay CSS (`css/style.css:3285-3304`, dark-mode-aware) was already in place — no CSS change shipped with this entry. Wired into 7 call-sites: `audit-page.js → loadAuditData`, `vuln-page.js → loadVulnerabilityData`, `malware-page.js → loadMalwareData` and `applyAndRender`, `licenses-page.js → loadLicenseData` (threaded through the existing `try/catch` so the overlay clears on both success and error), `feeds-page.js → applyFilters` and the display-limit `change` handler, and `repos-page.js → filterTable`. Each wiring is a `showFilterLoading(...)` at the top of the function body and a `hideFilterLoading(...)` in the matching `finally` clause, so even a thrown render error correctly clears the overlay.

### Changed
- **GitHub rate-limit panel on the scan progress card now only lists buckets that have actually been charged** (`js/app.js`, `index.html`, `audit.html`, `debug.html`, `findings.html`, `licenses.html`, `settings.html`, `vuln.html`): The previous version of `updateRateLimitInfo` rendered one row per bucket for every entry seeded from `/rate_limit`, so the panel always showed ~13 rows including pools the app never touches (`search`, `code_search`, `code_scanning_upload`, `code_scanning_autofix`, `audit_log`, `audit_log_streaming`, `actions_runner_registration`, `source_import`, `integration_manifest`, `scim`, …). `updateRateLimitInfo` now filters cached buckets through a new `isAffected` predicate (`typeof entry.limit === 'number' && typeof entry.remaining === 'number' && entry.remaining < entry.limit`) before rendering, so untouched buckets stay hidden and the panel only shows pools that have actually had at least one request charged against them this session (typically just `Core REST`, then `GraphQL` and `Dependency Snapshots` once those endpoints fire). Buckets are still cached internally (so the `Authenticated: Yes/No` header reflects the auth state of *any* observed bucket and new pools light up the moment they're first charged), and the alphabetical-after-`core`/`graphql` sort order from the previous change is preserved. When no bucket has been charged yet, `#rateLimitInfo` is cleared instead of showing an empty table. Cache-busters bumped on every page that loads `js/app.js`.
- **Rebuild process: re-implement features, do not cherry-pick or copy from `defcon-sg-3`** (`mdfiles/rebuild-from-0ab213a.md`): explicit process rule added at the top of the rebuild reference document (new section "0.1. Process rule: re-implement, do not cherry-pick or copy"). The previous version of the doc suggested `git checkout defcon-sg-3 -- <path>` as a wholesale-copy escape hatch ("use sparingly, prefer hand-porting"); that suggestion is removed and replaced with an explicit list of forbidden moves (`git cherry-pick`, `git checkout <branch> -- <path>`, `git restore --source=<branch> <path>`, blind `git apply` of patches generated from the rolled-back range, "just copy the whole file in the editor") and a corresponding list of permitted read-only operations (`git diff post-defcon-sg-2026..defcon-sg-3 -- <path>`, `git show defcon-sg-3:<path> | less`, quoting small snippets after reading them, asking "what did `defcon-sg-3` do here and why?"). The acceptance criterion is now stated explicitly: every line of new code on `post-defcon-sg-2026` must be typed (or generated) on this branch with intent, not lifted by SHA. The point of the rollback was that the cumulative state on `defcon-sg-3` had quality problems (destructive `computeDependencyTrees` post-pass, stats-card inconsistencies, license attribution mis-credit, dead `audit.html` cards); mechanical copies bring them back. Hand re-implementation forces us to read each piece, understand it, and decide whether the rebuild branch should host it in that exact shape — the slowest correct path and the only one that exits the rebuild with a clean codebase.
- **Live GitHub rate-limit panel now lists each bucket separately instead of flipping** (`js/github-client.js`, `js/app.js`): The "Rate Limit: X/Y requests remaining" line on the scan progress card on `index.html` was overwriting a single slot for every REST response, but GitHub charges each request against one of several independent pools (`core`, `graphql`, `search`, `code_search`, `dependency_snapshots`, `integration_manifest`, …) and the response headers reflect *the pool that was charged*, not a single global counter. Different endpoints therefore made the displayed value flip between unrelated numbers (e.g. `4983/5000` for core REST and a much smaller `dependency_snapshots` count) depending on whichever response landed last. `extractRateLimitFromResponse` now reads the `X-RateLimit-Resource` response header to determine the actual bucket and stores per-bucket counters in `lastRateLimit`; `getRateLimitInfo()` additionally walks every entry in `data.resources` from `/rate_limit` at scan start and emits one `rateLimitUpdate` event per bucket so the panel is fully populated up-front. `SBOMPlayApp` accumulates updates into a new `rateLimitByBucket` map and `updateRateLimitInfo` renders one row per bucket in `#rateLimitInfo` (Core REST and GraphQL first, then alphabetical), each row showing `remaining/limit` and the per-bucket reset time. Friendly labels (`Core REST`, `GraphQL`, `Dependency Snapshots`, `Code Search`, `Search`, …) replace the raw bucket names; unknown buckets fall back to a title-cased version of the API name so future GitHub additions render sensibly without code changes. Cache-busters on `js/github-client.js` and `js/app.js` were bumped on every page that loads them (`index.html`, `audit.html`, `debug.html`, `deps.html`, `findings.html`, `licenses.html`, `malware.html`, `settings.html`, `vuln.html`).
- **`AGENTS.md` now mandates an `about.html` methodology-card update whenever new detection / scoring / enrichment / methodology logic ships** (`AGENTS.md`): a new "About page (MANDATORY when adding new logic)" section under "Workflow & Release" spells out exactly when an about-page card is required (new detection rules / classifiers, scoring formulas, enrichment phases, external data sources, aggregation methodologies, or user-visible methodology changes), the structure each card must match (intro paragraph, sub-headers, comparison tables, definition alerts, References list with external spec links), and the cache-busting requirement on `about.html`. The "Common Mistakes" table gains a matching row ("New logic shipped without about-page card → Update `about.html` in the same PR"), and the Pre-Commit Checklist gains a matching required checkbox right under the existing CHANGELOG checkbox. Internal-only refactors are explicitly exempted (no user-visible behaviour change → no about-page update needed, but the CHANGELOG entry still is). Added now so the about-page card discipline is in place before any of the in-flight rebuild groups (insights, VEX, package lifecycle, maintainer signals, …) start landing on this branch.

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

