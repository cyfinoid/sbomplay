# Rebuild Plan — Reset to `0ab213a` and Re-Implement Post-DefCon-SG Work

> **Purpose** — Between `0ab213a` (Wed Apr 29 03:53:58 2026) and `b6c5bd6` (Fri May 1 17:47:51 2026) the
> `defcon-sg-3` branch picked up 17 commits that introduced several large features (Insights page, VEX
> support, package lifecycle, maintainer signals, direct/transitive everywhere, …) along with at least
> one well-documented regression that required a multi-commit fix during the same window. Rather than
> continue layering fixes on top, we are starting fresh from the last-known-good commit on a new branch
> (`post-defcon-sg-2026`) and re-implementing the features one at a time using `defcon-sg-3` as the
> reference codebase.
>
> This document is the single source of truth for **what existed on `defcon-sg-3` that needs to come
> back**, **which commits introduced what**, **what to avoid re-implementing**, and **the order to bring
> features back in**.

## 0. Quick reference

| Field | Value |
|---|---|
| Last-known-good commit | `0ab213ade46aa60bb20fdb6bf4c7a0e9a8f5e2f1` ("malware detection page") |
| Last-known-good date | 2026-04-29 03:53:58 +08:00 |
| Reference branch (do not delete) | `defcon-sg-3` (HEAD `b6c5bd6`) |
| Working branch | `post-defcon-sg-2026` (created from `0ab213a`) |
| Commits to re-create | 17 |
| Files to consult on `defcon-sg-3` | see per-commit inventory below |

To diff a single file between this branch and the historical reference:

```bash
git diff post-defcon-sg-2026..defcon-sg-3 -- js/insights-aggregator.js
```

To copy a file wholesale from `defcon-sg-3` into the rebuild branch (use sparingly, prefer
hand-porting to avoid bringing back regressions):

```bash
git checkout defcon-sg-3 -- js/vex-service.js
```

## 1. Inventory — 17 commits since `0ab213a`

In chronological order (oldest first):

| # | SHA | Date (local) | Subject | Group |
|---|---|---|---|---|
| 1 | `9d4bf346` | 2026-04-29 20:12 +08 | EOL findings, and airgap info update | A |
| 2 | `ec2f08dc` | 2026-04-29 22:25 +08 | minor fixes in findings pages | A |
| 3 | `7d91396a` | 2026-04-29 22:33 +08 | EOL and other duplication removed | A |
| 4 | `f58ea5fc` | 2026-04-29 23:24 +08 | insights | B |
| 5 | `a4d9f465` | 2026-04-29 23:41 +08 | rate limits | C |
| 6 | `6b446a91` | 2026-04-30 01:11 +08 | supply chain hygeine | D |
| 7 | `6e9cbee5` | 2026-04-30 02:29 +08 | insight page render | B |
| 8 | `8621e79d` | 2026-04-30 08:54 +08 | insight page updates | B |
| 9 | `976a8946` | 2026-04-30 09:57 +08 | insights | B |
| 10 | `b50fa977` | 2026-04-30 11:01 +08 | table overflow fixed | B (regression introducer) |
| 11 | `5d09f6d2` | 2026-04-30 11:01 +08 | overlay fix | B |
| 12 | `efb35de7` | 2026-04-30 13:12 +08 | insights better alignment | B (regression introducer) |
| 13 | `aeaef48a` | 2026-05-01 00:18 +05:30 | insights homepage | B |
| 14 | `78e64510` | 2026-05-01 12:03 +05:30 | smaller tweaks, vex support added | E |
| 15 | `ab954562` | 2026-05-01 14:33 +05:30 | dependency grouping | F |
| 16 | `d1a9c1ef` | 2026-05-01 17:00 +05:30 | relationship revisions | G |
| 17 | `b6c5bd6c` | 2026-05-01 17:47 +05:30 | updated about | H |

### Feature groups

- **A. EOL / EOX findings hardening** — commits 1, 2, 3
- **B. Insights page (new feature)** — commits 4, 7, 8, 9, 10, 11, 12, 13
- **C. GitHub rate-limit handling** — commit 5
- **D. Supply chain hygiene refactor** — commit 6
- **E. VEX + package lifecycle + maintainer signals (huge)** — commit 14
- **F. Direct vs transitive everywhere** — commit 15
- **G. Cross-cutting consistency refactor (stats-card audit)** — commit 16
- **H. Documentation (about page methodology cards)** — commit 17

## 2. Per-commit inventory

Each section: SHA, files touched (with insertions/deletions), what it added/changed/fixed, and any
cross-references to other commits.

### Group A — EOL / EOX findings hardening

#### A1. `9d4bf346` — EOL findings, and airgap info update

```
about.html          | 15 +++++++++++++--
findings.html       |  3 ++-
js/findings-page.js | 23 +++++++++++++++++++++++
4 files changed, 46 insertions(+), 3 deletions(-)
```

- Adds an EOL/EOX findings surface to `findings.html` and `js/findings-page.js`.
- `about.html` updated with airgap-mode information (covers what the tool can/can't do offline).

#### A2. `ec2f08dc` — minor fixes in findings pages

```
js/eox-service.js             | 552 +++++++++++++++++++++++++++++++++---------
js/findings-page.js           | 218 +++++++++++++----
js/audit-page.js              |  37 ++-
js/common.js                  |   8 +-
js/github-actions-analyzer.js |  39 +--
+ HTML cache-buster bumps across all pages
18 files changed, 695 insertions(+), 202 deletions(-)
```

- Massive rewrite of `js/eox-service.js` (likely full ecosystem support: Node, Python, Go, Java,
  Ruby, …) — **this is the biggest single file in this group, plan ~1 day to port carefully.**
- `js/findings-page.js` reworked to consume the new EOX findings shape.
- Small audit-page polish; small `common.js` helpers; `github-actions-analyzer.js` cleanup.

#### A3. `7d91396a` — EOL and other duplication removed

```
js/eox-service.js     |  6 ++++++
js/findings-page.js   | 11 ++++++++++-
js/storage-manager.js | 50 ++++++++++++++++++++++++++++++++++++++++++++------
flowchart.md          | 19 ++++++++++++++-----
+ HTML cache-buster bumps
17 files changed, 91 insertions(+), 28 deletions(-)
```

- Deduplication of EOL findings (likely the same EOL row appearing once per repo when it should
  collapse).
- `storage-manager.js` gains EOL-finding storage helpers.
- `flowchart.md` updated to reflect the new EOX phase.

### Group B — Insights page

> **CRITICAL**: this group contains two regression-introducing commits (`b50fa977` and `efb35de7`).
> See §3 below for the destructive `computeDependencyTrees` post-pass to avoid. Bring back the table
> overflow fix and the alignment polish, but **do not** re-introduce the destructive post-pass.

#### B1. `f58ea5fc` — insights (initial)

```
insights.html                |  209 ++++  (NEW)
js/insights-page.js          | 1468 +++++++++++++++++++++++++++++ (NEW)
js/enrichment-pipeline.js    |   76 ++
js/version-drift-analyzer.js |   94 +-
js/sbom-processor.js         |   22 +-
js/app.js                    |   30 +-
js/github-client.js          |   16 +
flowchart.md                 |   81 ++
.github/workflows/*.yml      | (REQUIRED_JS list updated)
+ HTML cache-buster bumps
24 files changed, 2051 insertions(+), 43 deletions(-)
```

- New `insights.html` page (KPI strip, drift, depth, vuln-age, license-risk donut, supply-chain
  hygiene, tech-debt composite).
- New `js/insights-page.js` (renderer; ~1.5k LOC).
- `js/enrichment-pipeline.js` extended with insights-needed enrichment.
- `js/version-drift-analyzer.js` extended with depth/age computations.
- `flowchart.md` gets an Insights section.
- `.github/workflows/validate-deployment.yml` gains `insights.html` + `js/insights-page.js` in the
  `REQUIRED_*` arrays.

#### B2. `6e9cbee5` — insight page render (small fix)

```
insights.html       |  2 +-
js/insights-page.js | 20 ++++++++++----------
3 files changed, 12 insertions(+), 11 deletions(-)
```

- Small render fix on the Insights page.

#### B3. `8621e79d` — insight page updates

```
insights.html       |   2 +-
js/insights-page.js | 280 +++++++++++++++++++++++++++++++++++++++++++++++++++-
3 files changed, 281 insertions(+), 2 deletions(-)
```

- Renderer additions.

#### B4. `976a8946` — insights (huge rewrite)

```
js/insights-page.js | 1412 +++++++++++++++++++++++++++++++++++++--------------
css/style.css       |   49 ++
about.html          |    2 +-
flowchart.md        |    8 +-
insights.html       |    3 +-
6 files changed, 1082 insertions(+), 396 deletions(-)
```

- Insights page renderer essentially rewritten — most of the **Chart.js** integration likely landed
  here. CSS variables for chart text/grid colors added in `css/style.css`.
- Per `Unreleased → Changed`: this is the commit where `chart.js@4.4.4` from `cdn.jsdelivr.net`
  starts being loaded, replacing CSS bars / `conic-gradient` SVG donuts. Update the airgapped
  allowlist on `about.html` accordingly when porting.

#### B5. `b50fa977` — table overflow fixed *(regression introducer #1)*

```
js/insights-page.js   | 161 +++++++++++++++++++++++++++++++++++++++---------
js/sbom-processor.js  | 131 +++++++++++++++++----------------------
js/storage-manager.js | 167 ++++++++++++++++++++++++++++++++++++++++++++++++++
flowchart.md          |   1 +
+ HTML cache-buster bumps
18 files changed, 379 insertions(+), 127 deletions(-)
```

- The intended user-facing change is "long Insights tables get a `max-height` + scroll container".
- **The hidden change is destructive**: `SBOMProcessor.computeDependencyTrees` gained a
  post-pass that wiped every dep's `directIn` / `transitiveIn` / `repositories` and rebuilt them
  purely from `repo.dependencies` / `repo.directDependencies`. `storage-manager.js`'s
  `_recomputeDirectAndTransitive` got a mirror self-heal that did the same.
- Why this is wrong: GitHub-emitted SPDX SBOMs typically `DEPENDS_ON main → X` for every package,
  so every SBOM-listed dep landed in `repo.directDependencies` and the post-pass left no transitive
  candidates. The registry-built dep tree (npm/PyPI/Maven/Cargo/…) that powered real transitive
  depth was thrown out.
- Net: every reach sub-line on `licenses.html` reads `N direct / 0 transitive`, the Insights depth
  chart collapses to "direct" or "Unknown", deps/vuln/authors per-repo splits collapse.
- See §3 for the **two-pass attribution** algorithm to use instead.

#### B6. `5d09f6d2` — overlay fix

```
js/insights-page.js | 56 ++++++++++++++++++++++++++++++++++++++++++++++++++++-
css/style.css       | 38 ++++++++++++++++++++++++++++++++++++
insights.html       |  4 ++--
4 files changed, 98 insertions(+), 3 deletions(-)
```

- Chart.js inline mini-bar tooltip clipping fix. Disables the in-canvas tooltip and routes hover
  through a body-rooted `.insights-mini-tooltip` div with viewport-edge clamping.
- New `.insights-mini-tooltip` CSS class.
- Cleanly portable; bring this back as-is.

#### B7. `efb35de7` — insights better alignment *(regression introducer #2)*

```
js/insights-page.js   | 194 ++++++++++++++++++++++++--------------------------
js/sbom-processor.js  |  46 +++++++++++-
js/storage-manager.js | 186 +++++++++++++++++++++--------------------------
flowchart.md          |  13 +++-
+ HTML cache-buster bumps
18 files changed, 253 insertions(+), 233 deletions(-)
```

- Visual alignment pass on Insights page.
- **Re-touches** the same destructive post-pass in `sbom-processor.js` and `storage-manager.js` —
  same regression as `b50fa977`. Bring back only the visual-alignment hunks.

#### B8. `aeaef48a` — insights homepage (extracts shared aggregator)

```
js/insights-aggregator.js | 874 ++++++++++++++++++++++++++++++  (NEW)
js/insights-page.js       | 838 +---------------------------
js/app.js                 |  54 +-
index.html                |  27 +-
js/index-page.js          |   1 +
insights.html             |   3 +-
.github/workflows/validate-deployment.yml | 1 +
8 files changed, 964 insertions(+), 835 deletions(-)
```

- Extracts `buildInsights`, all `compute*Stats` helpers, `computeTechDebt`, `clamp01`,
  `scoreToGrade`, `countCritHigh`, `gradeColor`, `renderKpiStrip` from `insights-page.js` into a new
  DOM-light shared module `js/insights-aggregator.js`.
- Adds the 8-tile KPI strip ("Portfolio Snapshot") to `index.html`, with each tile linking to its
  detail page (`repos.html`, `deps.html`, `vuln.html`, `findings.html`, `licenses.html`,
  `insights.html`).
- Wires the collapsible chevron through `js/index-page.js`'s `collapseConfigs`.
- Adds `js/insights-aggregator.js` to `REQUIRED_JS` in
  `.github/workflows/validate-deployment.yml`.

### Group C — GitHub rate-limit handling

#### C1. `a4d9f465` — rate limits

```
js/app.js           | 123 +++++++++++++++++++++++++++++++++++++++++++---------
js/github-client.js |  55 +++++++++++++++++++----
3 files changed, 151 insertions(+), 28 deletions(-)
```

- GitHub client gains rate-limit awareness (read response headers, back off on 403/429, surface
  remaining quota to the UI).
- `app.js` consumes rate-limit info and pauses the analysis pipeline cleanly when quota is
  exhausted.
- Smallest, lowest-risk change in the inventory — port first.

### Group D — Supply chain hygiene refactor

#### D1. `6b446a91` — supply chain hygeine

```
js/storage-manager.js | 214 ++++++++++++++++++++++++++++++++++++++++++++++++++
js/common.js          |  86 ++++++++++++++++++++
js/repos-page.js      | 101 +++++++++++++++++++++--
js/findings-page.js   |  93 ++++++++++++++++++++--
js/authors-page.js    |  77 +++++++++---------
js/github-client.js   |  56 +++++--------
js/feeds-page.js      |  46 ++++++-----
js/malware-page.js    |  42 ++++++----
js/insights-page.js   |  86 +++++++++++++-------
js/app.js             |  54 +++++++++++--
+ smaller updates to deps-page, licenses-page, vuln-page, audit-page
+ HTML cache-buster bumps
28 files changed, 693 insertions(+), 274 deletions(-)
```

- New supply-chain-hygiene helpers in `storage-manager.js` and `common.js`.
- Multi-page rewrites of `authors-page.js`, `feeds-page.js`, `findings-page.js`, `repos-page.js`,
  `malware-page.js` to consume the new helpers.
- `github-client.js` simplified.

### Group E — VEX + package lifecycle + maintainer signals (largest)

> Despite the modest commit message ("smaller tweaks, vex support added"), this is the single largest
> commit in the rollback. Plan multiple sessions to port it.

#### E1. `78e64510` — smaller tweaks, vex support added

```
js/vex-service.js               | 544 ++++++++++++++++++++++++++++++  (NEW)
js/package-lifecycle-service.js | 409 ++++++++++++++++++++++          (NEW)
js/enrichment-pipeline.js       | 490 ++++++++++++++++++++++
js/storage-manager.js           | 343 ++++++++++++++++---
js/indexeddb-manager.js         | 238 +++++++++++--
js/settings.js                  | 220 +++++++-----
flowchart.md                    | 211 +++++++++++-
js/view-manager.js              | 189 ++++++++---
js/package-details-modal.js     | 186 +++++++++-
js/author-service.js            | 171 ++++++----
js/findings-page.js             | 163 +++++++++
js/feeds-page.js                | 157 ++++++++-
js/vuln-page.js                 | 118 ++++++-
js/audit-page.js                |  82 ++++-
js/app.js                       |  81 +++--
js/deps-page.js                 |  60 +++-
js/license-fetcher.js           |  50 ++-
js/insights-page.js             |  48 ++-
js/cache-manager.js             |  44 +++
js/common.js                    |  44 +++
settings.html                   |  48 ++-
js/github-client.js             |  27 +-
js/sbom-processor.js            |  21 +-
js/feed-url-builder.js          |  20 ++
debug.html                      |  19 +-
deps.html                       |  19 +-
findings.html                   |  45 ++-
feeds.html                      |  16 +-
repos.html                      |  16 +-
vuln.html                       |  39 ++-
audit.html                      |   4 +-
js/license-processor.js         |   9 +-
licenses.html                   |   4 +-
malware.html                    |   4 +-
index.html                      |   8 +-
.github/workflows/validate-deployment.yml | 2 +
37 files changed, 3751 insertions(+), 412 deletions(-)
```

Sub-features:

1. **VEX / VDR consumption** — new `js/vex-service.js`. Parses CycloneDX VEX, OpenVEX, CSAF.
   Statement matching by `bom-ref → purl → hash`. Annotates findings, never deletes. New IndexedDB
   store `vexDocuments` (DB schema 6 → 7). Phase 1.7 in `enrichment-pipeline.js`. UI: VEX upload
   on `vuln.html`, status badges, suppression toggle, listed/deletable on `settings.html`.
2. **Package lifecycle status** — new `js/package-lifecycle-service.js`. Per-ecosystem fetchers:
   npm `versions[ver].deprecated`, PyPI `info.status`, NuGet catalog deprecation, Cargo
   `version.yanked`, GitHub `archived` fallback. Phase 7 in `enrichment-pipeline.js`. UI: badge in
   `deps.html`, finding in `findings.html`, alert in package-details modal. 7-day cache TTL on the
   `packages` IndexedDB store.
3. **Maintainer signal** — `author-service.js` `parsePackageWarnings` expanded from 4-pattern
   boolean to 11-pattern structured `heuristicSignals[]`, scans README too. GitHub user-repo GraphQL
   gains `stargazerCount`, `openIssues`/`closedIssues`, `releases.first(1).createdAt`,
   `mentionableUsers.totalCount`. New `computeMaintainerSignals` in
   `package-lifecycle-service.js` produces `dep.maintainerSignal = { level, factors[] }` with
   four levels (`critical` / `risk` / `watch` / `healthy`). Phase 7.5 in `enrichment-pipeline.js`.
4. **Source-repo URL discovery** — `license-fetcher.js`, `author-service.js`,
   `feed-url-builder.js`, `cache-manager.js` persist `dep.sourceRepoUrl` from deps.dev `links[]`
   or native registry. Phase 1.6 in `enrichment-pipeline.js`. Lights up the GitHub-Releases atom
   feed fallback in `feeds-page.js`.
5. **License attribution fix** — `dep.repositoryLicense` renamed to `dep.consumerRepoLicense` in
   `sbom-processor.js`. The wrong "fall back to host repo license" was removed from
   `view-manager.js` `getDependencyLicenseInfo` and `deps-page.js`. New Phase 2.5
   `fetchSourceRepoLicenses` calls `LicenseFetcher.fetchLicenseFromGitHub` for unknowns.
   `_migrateLegacyRepositoryLicense` self-heals stored exports.
6. **Settings → Import / Export overhaul** — schema bump 1.0 → 1.1 → 1.2. New stores covered:
   `locations`, `eoxData`, `authors` (legacy), `vexDocuments`. Merge / Replace radio. Atomic
   `clear()`-then-`put` for Replace. `data-import-type` validated against file's `type` field.
   `migrateImportPayload` shim. `IndexedDBManager.clearAll` extended.
7. **Debug page** — `Refetch Missing Licenses` and `Check Unknown Licenses` buttons get real
   handlers. `#debugStorageStatus` → `#storageStatus` id fix. `licenseRefetchProgressBar` ARIA
   attributes added.
8. **Cross-registry license diff** — new `fetchLatestVersionLicenses` enrichment compares against
   the latest registry version, not just the highest version in the analysis. Adds `current →
   latest` row type with "Latest registry" badge.

#### Cache-buster note

After porting this commit, every script tag for the new files (`vex-service.js`,
`package-lifecycle-service.js`, etc.) needs a `?v=X.Y.Z&cb=<timestamp>` cache-buster on every HTML
page that loads it. Per `AGENTS.md`, edit `src` attributes directly — never use inline JS for
cache-busting.

### Group F — Direct vs transitive everywhere

#### F1. `ab954562` — dependency grouping

```
js/insights-aggregator.js | 682 +++++++++++++++++++++++++++++++++++++++-------
js/insights-page.js       | 464 ++++++++++++++++++++++++-------
js/view-manager.js        | 382 ++++++++++++++++++++++++--
js/findings-page.js       |  46 +++-
js/repos-page.js          |  35 ++-
js/malware-page.js        |  34 ++-
js/audit-page.js          |  30 ++
js/vuln-page.js           |  17 +-
js/licenses-page.js       |  14 +
js/app.js                 |   2 +-
+ HTML cache-buster bumps (deps, findings, audit, malware, repos, vuln, licenses, settings, debug)
22 files changed, 1520 insertions(+), 262 deletions(-)
```

- New shared helpers in `insights-aggregator.js`: `buildDirectMap`, `isDirectIn`, `splitCounts`,
  `bumpSplit` — single canonical `repoKey → Set(depKey)` direct map from `repo.directDependencies`.
- Every `compute*` aggregator (`computeDriftStats`, `computeAgeStats`, `computeVulnAgeStats`,
  `computeEolStats`, `computeLicenseStats`, `computePerRepoStats`) takes the `directMap` and
  classifies each `(dep, repo)` pair per-occurrence.
- New Insights tile **"Direct-dep CVE dwell"**; existing **"Open Critical+High"** sub-line gains
  `… on direct / … on transitive`.
- New **"Vulnerabilities × dependency depth"** stacked bar chart between severity-age chart and
  time-bomb table.
- Time-bomb table gains "Reach" column; per-repo Critical+High mini bars become 4-segment stacks.
- License-risk donut converted to 4-slice direct/transitive split.
- "Filter by Reach" dropdown on `vuln.html` and `licenses.html`. Reach badges across Vuln /
  License / Malware / Findings / Audit / Repos pages.
- Repos page gains `Direct deps: N · Transitive deps: M` and CSV export columns.
- Per-repo Tech-Debt formula gains 3× direct weighting:
  `weighted = critDirect*30 + highDirect*12 + medDirect*3 + critTrans*10 + highTrans*4 + medTrans*1`
  for vulns, and `(majorDirect*3 + majorTrans) + (minorDirect*3 + minorTrans)/3` for drift.

> Depends on Group B (Insights aggregator) being in place. Depends on `dep.directIn` /
> `dep.transitiveIn` self-heal in `storage-manager.js` working correctly — see §3 for the **correct**
> two-pass attribution.

### Group G — Cross-cutting consistency refactor (stats-card audit)

#### G1. `d1a9c1ef` — relationship revisions

```
js/audit-page.js             | 764 +-----------------  (DEAD CODE REMOVAL)
js/sbom-processor.js         | 162 ++++-----
js/settings.js               | 175 +++++++++-
js/app.js                    | 152 ++++++---
js/osv-service.js            | 147 ++++++++-
js/view-manager.js           | 147 +++++++--
js/storage-manager.js        | 122 ++++---
js/vuln-page.js              |  66 ++--
js/license-processor.js      |  46 ++-
js/repos-page.js             |  27 +-
js/common.js                 |  26 ++
js/findings-page.js          |  24 +-
js/malware-page.js           |  24 +-
js/insights-aggregator.js    |  23 +-
js/feeds-page.js             |  16 +
js/deps-page.js              |  19 ++
js/sbom-quality-processor.js |   5 +-
+ HTML cache-buster bumps on every page
32 files changed, 1081 insertions(+), 1062 deletions(-)
```

- This is the "stats cards across the app are now numerically consistent" refactor (see
  Unreleased → Fixed entry on this in the appendix).
- New canonical vulnerability counter `OSVService.countUniqueAdvisories(deps, { excludeMalware,
  vexSuppress, dedupeAliases })` that collapses CVE/GHSA aliases to a single canonical id
  (CVE-prefixed wins), excludes malware (`MAL-*` / `kind === 'malware'`), withdrawn advisories,
  and VEX-suppressed (`status: 'not_affected' | 'fixed'`) entries before counting.
- New `OSVService` helpers: `isWithdrawn`, `isMalwareAdvisory`, `isVexSuppressed`,
  `getCanonicalAdvisoryId`, `getHighestSeverity` returning a `WITHDRAWN` sentinel.
- Home dashboard / vuln severity tiles / Insights "Open Critical+High" / Findings "Total" all wired
  to `countUniqueAdvisories`.
- `vuln.html` `excludeMalwareFromVulnAnalysis` now also strips VEX-suppressed when
  `window.__vexSuppress` is on; banner under toggle reports hidden count.
- `common.js` `loadOrganizationData` recomputes `vulnerablePackages` and severity counters when
  `repoFilter` is active.
- `malware.html` `renderMalware` derives KPIs from `filtered`, adds "filtered (N of M)" sub-line.
- Home dashboard `Top Common Dependencies` no longer mutates shared `data.data.allDependencies`
  in place; sorts a `[...allDependencies]` copy.
- `Version Sprawl` groups by `${ecosystem}:${name}`, ignores `unknown` versions, surfaces ecosystem
  badge.
- SBOM Quality Dashboard reads correct sbomqs v2.0 fields (`averageCompleteness` /
  `averageStructural` / `averageIntegrity`), guards `gradeDistribution` against `undefined`.
- "Repositories needing attention" label updated from "below 70%" to "below 7.0/10 (grade C or
  lower)".
- `LicenseProcessor.resolveDependencyLicense(dep)` added; mirrors
  `ViewManager.getDependencyLicenseInfo`'s fallback chain. Both `generateComplianceReport` and
  `groupByLicenseFamily` use it.
- Insights C+H KPI tile reads `vulnAgeStats.canonicalCritHigh` (not the age-bucketed total).
- Findings page total tile breakdown adds `lifecycle` and `maintainerSignal` tiles so total =
  sum-of-visible-tiles.
- `insights.html` adds `js/osv-service.js` to its script load list.
- **Dead code removal** in `js/audit-page.js`: `generateUnifiedAuditFindingsHTML`,
  `generateGitHubActionsAuditHTML`, `getFindingDescription`, `getFindingName` removed (composer
  never called them — they shipped as dead code; cards on `audit.html` were unreachable).
- `debug.html` `#debugStorageStatus` → `#storageStatus` id fix.
- `Refetch Missing Licenses` / `Check Unknown Licenses` button handlers in `js/settings.js`.
- `about.html` static version string aligned to the rest of the site.

> **Important**: This commit also contains the **two-pass attribution** fix for the destructive
> post-pass introduced in `b50fa977` / `efb35de7`. When porting Group B, apply the corrected
> algorithm from this commit (and from §3 below) — do not first port the broken version and then
> port the fix.

### Group H — Documentation

#### H1. `b6c5bd6c` — updated about

```
about.html | 720 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
2 files changed, 719 insertions(+), 4 deletions(-)
```

- Eight new methodology cards in `about.html`:
  1. Package Lifecycle Status Detection (Official Signals)
  2. Maintainer Signal Methodology
  3. Malicious Package Detection Methodology
  4. VEX / VDR Consumption Methodology
  5. Direct vs Transitive Classification & Dependency Depth
  6. Tech-Debt Composite Scoring (Insights)
  7. Unified Findings Aggregation
  8. OPML Feed Export Methodology
- Each card mirrors the depth/structure of the existing EOX and Dependency Confusion sections
  (intro paragraph, sub-headers with icons, comparison tables, definition alerts, References list
  with external spec links).
- Port last — depends on every other feature being in place (so the methodology descriptions
  describe code that exists).

## 3. Known regressions / pitfalls — do not re-introduce

### 3.1. Destructive `computeDependencyTrees` post-pass (from `b50fa977` / `efb35de7`)

**Symptom on `defcon-sg-3` before the fix in `d1a9c1ef`**: every reach sub-line on `licenses.html`
read `N direct / 0 transitive`; Insights depth chart bucketed everything into "direct" or "Unknown";
deps/vuln/authors per-repo direct-vs-transitive splits collapsed.

**Root cause**: a post-pass that wiped every dep's `directIn` / `transitiveIn` / `repositories`
and rebuilt them purely from `repo.dependencies` / `repo.directDependencies`. Because GitHub's
SPDX SBOMs typically `DEPENDS_ON main → X` for every package, every SBOM-listed dep landed in
`repo.directDependencies` and the post-pass left no transitive candidates. The registry-built dep
tree was thrown out.

**Correct algorithm — two-pass attribution** (from `d1a9c1ef`, also documented in
`Unreleased → Fixed`):

1. **Pass 1: SBOM truth** — walk `repo.dependencies` and split on `repo.directDependencies` (same
   as the broken post-pass).
2. **Pass 2: per-repo BFS through `dep.children`** — for each repo, BFS from its SBOM-direct seed
   set through the registry-built resolver tree edges. Attribute every reached dep to the repo as
   transitive (unless already direct in that repo via Pass 1).

Pass 2 is structurally bleed-free: BFS only ever adds `(dep, R)` when `dep` is reachable from R's
own direct deps via registry edges, so the original cross-ecosystem leak the `reposWithDirectDeps`
fallback caused cannot recur.

Apply the same two-pass to `StorageManager._recomputeDirectAndTransitive` so legacy stored analyses
self-heal at load. Stamp `entry._directTransitiveHealVersion = 2` (replacing the boolean
`_directTransitiveHealed` short-circuit) so analyses already "healed" by the broken v1 pass re-run
through the new logic on next load — users do **not** need to re-scan to recover correct
transitive numbers.

The inline parent-trace pass that used to live inside the per-ecosystem resolver loop in
`js/sbom-processor.js` (~line 870-930 in the old code) should be deleted entirely — only the
`dep.depth` / `dep.parents` / `dep.children` registry-tree-shape assignments should remain. All
repo attribution is centralised in the post-pass for symmetry with `_recomputeDirectAndTransitive`.

### 3.2. Stats-card inconsistencies — every counter through a single helper

Do not let any page count CVEs / advisories / vulnerabilities directly. Always call
`OSVService.countUniqueAdvisories(deps, { excludeMalware: true, vexSuppress: window.__vexSuppress,
dedupeAliases: true })`. The helper:
- collapses CVE/GHSA aliases (CVE-prefixed wins),
- drops `MAL-*` / `kind === 'malware'`,
- drops withdrawn advisories,
- drops VEX-suppressed (`status: 'not_affected' | 'fixed'`) when `vexSuppress` is true.

Same goes for license categories: always use `LicenseProcessor.resolveDependencyLicense(dep)`
which mirrors the `licenseFull > license > raw.licenseFull > raw.license > originalPackage`
fallback chain. Don't re-implement the chain inline in renderers.

### 3.3. License attribution mis-credit — keep `consumerRepoLicense` semantic

`dep.repositoryLicense` was always set to the license of the first **host/consumer** repo in
`SBOMProcessor.processDependencyTree`. Several readers used it as a final fallback for the **dep's
own license** when SBOM and deps.dev came up empty — so an Apache-2.0 host using a license-less
GPL transitive dep would render as Apache-2.0 across `licenses.html`, `audit.html`, the
compatibility checker, and the License Distribution pie.

When porting `sbom-processor.js`, name the field `dep.consumerRepoLicense` from day one. Use it
**only** in the compatibility checker (where the parameter genuinely is the host's license). Do
not introduce the wrong "fall back to host license" branches in `view-manager.js`
`getDependencyLicenseInfo` or `deps-page.js`. The correct fallback chain is:
`licenseFull → license → fetchSourceRepoLicenses (Phase 2.5) → 'Unknown'`.

`StorageManager` should ship `_migrateLegacyRepositoryLicense` to handle stored exports carrying
the legacy `repositoryLicense` field (preserve the field, never read it as a license source).

### 3.4. Dead `audit.html` unified-findings cards

Do not re-introduce `generateUnifiedAuditFindingsHTML`, `generateGitHubActionsAuditHTML`,
`getFindingDescription`, `getFindingName` in `js/audit-page.js`. They were never called by the live
audit composer.

### 3.5. License Distribution pie `NaN%` and missing `lgpl` / `custom` buckets

When porting `LicenseProcessor.generateComplianceReport`, initialise `categoryBreakdown` with **all
six** buckets: `permissive`, `copyleft`, `proprietary`, `unknown`, `lgpl`, `custom`. Guard the
increment with `(... || 0) + 1`. `displayLicenseDistribution` must include a `custom` slice and
sum the denominator directly from all six buckets (don't compute it from `licensedDependencies +
unlicensedDependencies`).

### 3.6. `Version Sprawl` cross-ecosystem collapse

Group by `${ecosystem}:${name}`, not by `dep.name`. Ignore `unknown` / `undefined` versions. Surface
the ecosystem badge on each row so the link to `deps.html` filters by both name and ecosystem.

### 3.7. Insights mini-bar tooltip clipping

The 14–16px tall sparkline canvases on Insights cannot host Chart.js's default in-canvas tooltip.
When porting Group B's mini-bars, **immediately** wire the body-rooted `.insights-mini-tooltip`
external handler from `5d09f6d2` — don't ship the in-canvas tooltip even temporarily.

### 3.8. Insights "Unknown" depth bucket

Do not emit an "Unknown" bucket in the depth distribution chart. `computeDepthStats` must scope
its `(dep, repo)` pairs to `dep` ∈ `repo.dependencies` (SBOM truth). Pairs the BFS still cannot
place (real residuals from CycloneDX/SPDX SBOMs without `dependsOn` / `DEPENDS_ON` edges) get
bucketed at **Level 1 (treated as direct)** and counted in a new `imputedDirectGlobal` counter
surfaced as an inline note under the chart.

### 3.9. `repos.html?repo=` URL parameter must be honoured

In `js/repos-page.js`, read `urlParams.get('repo')` alongside `org` and `search`. Pre-fill
`searchInput.value` with the repo identifier when `search` is empty so `filterTable()` narrows the
table to the matching row at first paint. Insights-page links rely on this.

### 3.10. License page filter consistency (Copyleft / Unknown / Total)

When porting `js/view-manager.js` `generateLicenseTypesTableData`:
- **Unknown** filter accepts only deps where `isUnlicensed = !rawLicense || rawLicense === 'NOASSERTION'`.
- **Copyleft** headline / reach sub-line / click-through table all use the same "high-attention
  copyleft" predicate via `LicenseProcessor.isDependencyCompatibleWithRepository`. The
  click-through must accept an `options.highAttentionOnly` flag set to `true` only when the user
  clicked the headline Copyleft tile (other entry points keep the broader "show all in category X"
  semantic).
- **Total** reach line still includes every copyleft pair (matches its own headline definition).

### 3.11. Cache-buster discipline

Per `AGENTS.md`: pattern is `?v=X.Y.Z&cb=<timestamp>` on every script/CSS tag. Never use inline
JS for cache busting — edit `src` attributes directly. After porting any commit, bump cache-busters
on every HTML page that loads the changed JS or CSS.

### 3.12. Workflow file maintenance

Per `AGENTS.md`: when adding/removing files, update both:
- `.github/workflows/deploy-github-pages.yml` — copy step
- `.github/workflows/validate-deployment.yml` — `REQUIRED_*` arrays

New files added during the rollback that need to be in these arrays (when their feature is
re-implemented):
- `js/insights-page.js` (Group B)
- `js/insights-aggregator.js` (Group B → aeaef48a)
- `js/vex-service.js` (Group E)
- `js/package-lifecycle-service.js` (Group E)
- `insights.html` (Group B)

### 3.13. CHANGELOG discipline

Per `AGENTS.md`: every change gets a CHANGELOG entry in the same PR. Use the format from `Keep a
Changelog`. Place new entries at the top under the current/next version header. The existing
`Unreleased` section on `defcon-sg-3` is preserved verbatim in §5 below as the source-of-truth
narrative for what each rollback entry should say once re-implemented.

## 4. Re-implementation checklist (priority order)

Suggested ordering — smallest, lowest-risk first; cross-cutting refactors near the end. Bring back
one group at a time, ship a clean commit per sub-feature where the size warrants, and update the
`CHANGELOG` `Unreleased` section as you go.

- [ ] **Group C — Rate limit handling** (`a4d9f465`)
  - [ ] `js/github-client.js` — read `X-RateLimit-*` headers, back off on 403/429.
  - [ ] `js/app.js` — surface remaining quota; pause pipeline when exhausted.
  - [ ] CHANGELOG entry.
- [ ] **Group A — EOL / EOX findings hardening** (`9d4bf346`, `ec2f08dc`, `7d91396a`)
  - [ ] `js/eox-service.js` — full ecosystem support (largest single file in this group).
  - [ ] `js/findings-page.js` — consume new EOX shape.
  - [ ] `js/storage-manager.js` — EOL-finding storage helpers.
  - [ ] `flowchart.md` — new EOX phase.
  - [ ] About-page airgap-info update.
  - [ ] CHANGELOG entry.
- [ ] **Group D — Supply chain hygiene refactor** (`6b446a91`)
  - [ ] `js/storage-manager.js` + `js/common.js` helpers.
  - [ ] Multi-page rewrites (`authors-page.js`, `feeds-page.js`, `findings-page.js`,
        `repos-page.js`, `malware-page.js`).
  - [ ] `js/github-client.js` simplification.
  - [ ] CHANGELOG entry.
- [ ] **Group B — Insights page** — port hunks from `f58ea5fc`, `6e9cbee5`, `8621e79d`, `976a8946`,
       `5d09f6d2`, `aeaef48a`. **Skip** the destructive post-pass from `b50fa977` / `efb35de7`;
       use the two-pass attribution from §3.1 directly.
  - [ ] `js/enrichment-pipeline.js` — insights-needed enrichment.
  - [ ] `js/version-drift-analyzer.js` — depth/age computations.
  - [ ] `js/sbom-processor.js` — `dep.depth` / `dep.parents` / `dep.children` only; **no** wipe-and-rebuild.
  - [ ] `js/storage-manager.js` — two-pass `_recomputeDirectAndTransitive` with
        `_directTransitiveHealVersion = 2` stamp.
  - [ ] `insights.html` — KPI strip, drift, depth, vuln-age, license-risk donut, supply-chain
        hygiene, tech-debt composite.
  - [ ] `js/insights-page.js` — renderer.
  - [ ] Chart.js@4.4.4 from `cdn.jsdelivr.net` + airgapped allowlist update on `about.html`.
  - [ ] CSS variables for chart text/grid colors in `css/style.css`.
  - [ ] `.insights-mini-tooltip` external tooltip handler (from `5d09f6d2`).
  - [ ] Table overflow `max-height: 480-520px` `table-responsive` containers.
  - [ ] Expand-to-show-all toggle on capped tables.
  - [ ] `js/insights-aggregator.js` — extract shared logic (from `aeaef48a`).
  - [ ] 8-tile KPI strip on `index.html` with drill-in links.
  - [ ] `js/index-page.js` — collapsible chevron via `collapseConfigs`.
  - [ ] `.github/workflows/validate-deployment.yml` — add `insights.html`, `js/insights-page.js`,
        `js/insights-aggregator.js`.
  - [ ] `flowchart.md` — Insights section.
  - [ ] CHANGELOG entry.
- [ ] **Group F — Direct vs transitive everywhere** (`ab954562`)
  - [ ] `js/insights-aggregator.js` — `buildDirectMap`, `isDirectIn`, `splitCounts`, `bumpSplit`
        helpers.
  - [ ] `compute*Stats` aggregators take `directMap`, classify each `(dep, repo)` per-occurrence.
  - [ ] New "Direct-dep CVE dwell" KPI tile.
  - [ ] "Open Critical+High" sub-line gains direct/transitive split.
  - [ ] "Vulnerabilities × dependency depth" stacked bar chart.
  - [ ] Time-bomb table "Reach" column; per-repo Critical+High mini bars become 4-segment stacks.
  - [ ] License-risk donut becomes 4-slice direct/transitive.
  - [ ] "Filter by Reach" dropdown on `vuln.html` and `licenses.html`.
  - [ ] Reach badges across Vuln / License / Malware / Findings / Audit / Repos.
  - [ ] Tech-Debt 3× direct weighting (formula in §2 / Group F).
  - [ ] CSV export adds `critical_direct`, `critical_transitive`, `high_direct`, `high_transitive`,
        `major_drift_direct`, `major_drift_transitive`, `direct_deps`, `transitive_deps` columns.
  - [ ] CHANGELOG entry.
- [ ] **Group E — VEX + package lifecycle + maintainer signals** (`78e64510`) — **plan multiple
       sessions**
  - [ ] **E.1 VEX** — `js/vex-service.js`, IndexedDB schema 6 → 7, `vexDocuments` store, Phase 1.7
         in `enrichment-pipeline.js`, upload control on `vuln.html`, status badges, suppression
         toggle, Settings page list/delete, included in `clearAll` / export schema 1.1 → 1.2.
  - [ ] **E.2 Package lifecycle** — `js/package-lifecycle-service.js`, per-ecosystem fetchers,
         GitHub `archived` fallback, Phase 7 in `enrichment-pipeline.js`, 7-day cache TTL on
         `packages` IndexedDB store, badge in `deps.html`, finding in `findings.html`, alert in
         package-details modal.
  - [ ] **E.3 Maintainer signals** — `author-service.js` 11-pattern heuristic + README scan,
         GitHub user-repo GraphQL extension (`stargazerCount`, `openIssues`/`closedIssues`,
         `releases.first(1).createdAt`, `mentionableUsers.totalCount`), `computeMaintainerSignals`,
         Phase 7.5, package-details modal "Health summary" 6-badge row.
  - [ ] **E.4 Source-repo URL discovery** — `dep.sourceRepoUrl` persisted from deps.dev / native
         registries; `feed-url-builder._extractGitHubRepoFromDep` reads it; `feeds.html` "Resolve
         missing source repos" button; Phase 1.6.
  - [ ] **E.5 License attribution fix** — `dep.repositoryLicense` → `dep.consumerRepoLicense` from
         day one; remove "fall back to host license" branches; new Phase 2.5
         `fetchSourceRepoLicenses` calls `LicenseFetcher.fetchLicenseFromGitHub`;
         `_migrateLegacyRepositoryLicense` self-heal.
  - [ ] **E.6 Settings → Import / Export overhaul** — schema bump, Merge / Replace radio, atomic
         `clear()`-then-`put`, `data-import-type` validation, `migrateImportPayload` shim,
         `IndexedDBManager.clearAll` extended.
  - [ ] **E.7 Debug page fixes** — `Refetch Missing Licenses`, `Check Unknown Licenses` button
         handlers; `#debugStorageStatus` → `#storageStatus` id fix; ARIA on
         `licenseRefetchProgressBar`.
  - [ ] **E.8 Cross-registry license diff** — `fetchLatestVersionLicenses`, `current → latest`
         row, "Latest registry" badge.
  - [ ] CHANGELOG entries (one per sub-feature).
- [ ] **Group G — Cross-cutting consistency refactor** (`d1a9c1ef`)
  - [ ] `OSVService.countUniqueAdvisories` + helpers (`isWithdrawn`, `isMalwareAdvisory`,
        `isVexSuppressed`, `getCanonicalAdvisoryId`, `getHighestSeverity` `WITHDRAWN` sentinel).
  - [ ] Wire every counter through it (home / vuln / Insights C+H / Findings Total).
  - [ ] `vuln.html` strip VEX-suppressed when toggle on; banner with hidden count.
  - [ ] `common.js` `loadOrganizationData` recomputes severity counters when `repoFilter` is
        active.
  - [ ] `malware.html` `renderMalware` derives KPIs from `filtered`; "filtered (N of M)" sub-line.
  - [ ] Home dashboard `[...allDependencies]` copy before sort.
  - [ ] `Version Sprawl` group by `${ecosystem}:${name}`; ignore `unknown` versions.
  - [ ] SBOM Quality Dashboard reads sbomqs v2.0 fields; guards `gradeDistribution`.
  - [ ] "Repositories needing attention" label updated.
  - [ ] `LicenseProcessor.resolveDependencyLicense(dep)` + use it in
        `generateComplianceReport` and `groupByLicenseFamily`.
  - [ ] Insights C+H KPI reads `vulnAgeStats.canonicalCritHigh`.
  - [ ] Findings page total breakdown adds `lifecycle` and `maintainerSignal` tiles.
  - [ ] `insights.html` adds `js/osv-service.js` to script load.
  - [ ] **Dead code removal** — `generateUnifiedAuditFindingsHTML`,
        `generateGitHubActionsAuditHTML`, `getFindingDescription`, `getFindingName`. (Easier:
        never re-add them in the first place.)
  - [ ] Ambiguous KPI labels rewritten across `deps.html` / `repos.html` / `feeds.html` /
        `settings.html` / `index.html` / `audit.html` (full list in Unreleased → Changed in §5).
  - [ ] CHANGELOG entry.
- [ ] **Group H — Documentation** (`b6c5bd6c`)
  - [ ] Eight new methodology cards in `about.html` (list in §2 / Group H).
  - [ ] CHANGELOG entry.

## 5. Reference appendix — verbatim `Unreleased` CHANGELOG section from `defcon-sg-3`

> Below is the `Unreleased` section of `CHANGELOG.md` as it stood on `defcon-sg-3` at HEAD
> (`b6c5bd6`). It is the most detailed narrative we have of what each fix on the rolled-back branch
> actually did and why. Use it as the source of truth when re-implementing — the entries describe
> the **intended end state** for the rebuild, not just the historical patch.

[See `appendix-unreleased-changelog.md` in the same folder for the verbatim text — kept separate
because it is ~110 KB and would dominate this document.]

## 6. House-keeping after rebuild

When the rebuild is complete and `post-defcon-sg-2026` ships:

- [ ] Tag `defcon-sg-3` HEAD as `pre-rebuild-2026-05-01` (or similar) so it survives any future
      branch deletion.
- [ ] Optionally archive this document to `mdfiles/historical/` once every checkbox in §4 is
      ticked, or keep it in place as a record of the rollback.
- [ ] Promote the `Unreleased` section of `CHANGELOG.md` to a real version (`0.0.10` /
      `0.1.0`) once the rebuild stabilises.
