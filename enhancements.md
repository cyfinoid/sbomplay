# SBOM Consumption Platform – Non-Security Use Case Expansion

## Purpose

This project expands the SBOM consumption and visualization platform to include **non-security-focused use cases** aimed at improving legal compliance, procurement intelligence, software maintainability, developer productivity, enterprise architecture, and organizational insights.

## Feature Tracks

---

### 🔍 License Compliance & Legal Insight

- [x] Parse and display license type per component (support SPDX, CycloneDX).
- [x] Flag copyleft licenses that may require source code disclosure (e.g., GPL, AGPL).
- [x] Detect and visualize conflicting license dependencies in projects.
- [x] Auto-generate legal audit and compliance reports.
- [x] Group dependencies by license families for bulk reviews.

---

### 🛒 Procurement & Supplier Intelligence

- [ ] Ingest third-party SBOMs during vendor evaluation.
- [ ] Identify banned/disallowed libraries, authors, or origins.
- [ ] Compare SBOMs across products to detect redundancy.
- [ ] Analyze org-wide component usage to recommend procurement consolidation.
- [ ] Highlight preferred libraries and suppliers across the org.

---

### 🧱 Dependency & Maintenance Management

- [ ] Show complete transitive dependency trees with versions.
- [ ] Detect deprecated, EOL, or unmaintained components.
- [ ] Identify outdated libraries (regardless of security risk).
- [ ] Group software sharing a component for coordinated patching.
- [ ] Display component update cadence across teams.

---

### 👷 Developer Support & Productivity

- [ ] Link SBOMs to internal documentation for onboarding/reference.
- [ ] Provide search across all SBOMs to locate specific components.
- [ ] Enable team-wide discovery of existing library usage.
- [ ] Allow tagging/annotations on components for team-specific notes.
- [ ] Compare SBOMs across versions to detect dependency drift.

---

### 🧠 Enterprise Architecture Optimization

- [ ] Aggregate SBOMs by business unit, product line, or vertical.
- [ ] Flag duplicated functionality (e.g., multiple JSON parsers).
- [ ] Spot opportunity for standardizing core libraries or runtimes.
- [ ] Identify "keystone" libraries across the org (critical mass usage).
- [ ] Export insights as JSON, Graph data, or Excel sheets.

---

### 🤝 Customer Transparency & Sales Enablement

- [ ] Generate customer-facing SBOM reports in JSON, SPDX, or PDF.
- [ ] Allow selective disclosure modes (top-level, full, filtered).
- [ ] Track provenance and versioning for compliance exports.
- [ ] Embed license summaries in customer-facing portals/docs.
- [ ] Enable on-demand SBOM snapshot generation for compliance checks.

---

### 📊 Org-Wide Pattern Recognition & Intelligence

- [ ] Track usage frequency of each component across the org.
- [ ] Detect single points of failure in core shared libraries.
- [ ] Identify abandoned or orphaned libraries.
- [ ] Generate lifecycle timelines for shared dependencies.
- [ ] Provide quarterly reports on dependency freshness, bloat, or decay.
- [ ] Surface team or app-specific dependency behavior patterns.

---

### 🔌 API Integrations & External Data Enrichment

- [ ] **Security Scorecards API Integration** (https://api.securityscorecards.dev/)
  - [ ] Fetch security scorecards for repositories and dependencies.
  - [ ] Display security posture scores alongside dependency analysis.
  - [ ] Integrate security metrics into procurement and vendor evaluation workflows.
  - [ ] Provide security score trends and historical data for components.
  - [ ] Enable security-aware dependency selection and risk assessment.
- [ ] **Additional API Integrations**
  - [ ] GitHub API for repository metadata and activity metrics.
  - [ ] NPM/PyPI APIs for package popularity and maintenance status.
  - [ ] License detection APIs for enhanced license compliance analysis.
  - [ ] Dependency health APIs for maintenance and support status.

---

## Next Steps

- [ ] Split features into MVP vs advanced milestones.
- [ ] Identify data ingestion and enrichment modules needed.
- [ ] Define schema for organization-wide SBOM aggregation.
- [ ] Design UI wireframes for views: License view, Usage graph, Redundancy report, etc.
- [ ] Begin implementation in modular tracks based on organizational priorities.

---

## Notes

- Security-related SBOM analysis is explicitly out of scope.
- Focus is on **process, productivity, insight, and governance**.
- SBOM formats supported initially: SPDX, CycloneDX, and simple JSON-based trees.

