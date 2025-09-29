# SBOM Play – Future Directions & Brainstorming

## Vision

Expand SBOM Play into a comprehensive developer tool that delivers actionable insights from SBOMs, going far beyond vulnerability detection. The focus is on developer productivity, software health, legal compliance, procurement intelligence, and organizational architecture.

---

## Strategic Integration Roadmap

### 1. Deps.dev Integration (Top Priority)
- **API:** https://deps.dev/docs/api/ (use v3, not v3alpha)
- **Value:** Provide rich metadata, transitive dependency trees, and version insights for a fuller picture of the dependency landscape.
- **Features:**
  - Fetch and display full dependency trees (including transitive dependencies) using the v3 API
  - Show package metadata (maintainers, version history, etc.)
  - Highlight hidden or risky dependencies
  - Enrich SBOM analysis with additional context from deps.dev
- **Implementation Plan:**
  1. Create a new service file: `js/services/deps-dev-service.js`
  2. Implement API client:
     - Fetch dependency tree for a given package/version/ecosystem
     - Fetch package metadata
  3. Integrate with SBOM analysis pipeline:
     - When analyzing a dependency, call deps.dev to get the full tree and metadata
     - Store/enrich results in the analysis data structure
  4. UI Enhancements:
     - Visualize the full dependency tree (collapsible, searchable)
     - Show additional metadata in dependency details
     - Highlight risky/abandoned/hidden dependencies
  5. Performance:
     - Implement caching to avoid redundant API calls
     - Batch requests where possible
- **Developer Value:**
  - See the “real” dependency graph, not just direct dependencies
  - Identify hidden risks and bloat
  - Make more informed decisions about upgrades and removals

### 2. Security Scorecards Integration
- **API:** https://api.securityscorecards.dev/
- **Value:** Show security posture scores for dependencies and repositories. Help developers understand and improve security best practices.
- **Features:**
  - Fetch and display security scorecards for repos/deps
  - Show security posture alongside dependency analysis
  - Integrate security metrics into procurement/vendor evaluation
  - Show security score trends and history
  - Enable security-aware dependency selection

### 3. Ecosystem.ms Integration
- **Value:** Show maintenance status, update frequency, and community health for dependencies.
- **Features:**
  - Display maintenance status (active, deprecated, abandoned)
  - Show last update, release cadence, and community activity
  - Provide recommendations for unmaintained/outdated packages

### 4. EndOfLife.date Integration
- **API:** https://endoflife.date/
- **Value:** Alert developers to EOL dependencies and help with migration planning.
- **Features:**
  - Show EOL status for languages, frameworks, and libraries
  - Alert on approaching EOL
  - Suggest migration paths

---

## Additional Value-Added Features

### Developer Productivity
- Show which teams use similar dependencies
- Suggest internal library consolidation
- Provide dependency usage patterns across the org

### Procurement & Vendor Intelligence
- Track vendors/suppliers for dependencies
- Assess vendor reliability and maintenance quality
- Recommend procurement consolidation

### Enterprise Architecture Insights
- Identify "keystone" dependencies (widely used)
- Detect dependency bloat and technical debt
- Recommend architecture optimizations

---

## Implementation Phases

**Phase 1: Core Integrations**
- Deps.dev (v3)
- Security Scorecards
- Ecosystem.ms

**Phase 2: Advanced Enrichment**
- EndOfLife.date

**Phase 3: Productivity & Architecture**
- Dependency discovery and reuse
- Enterprise architecture insights
- Procurement intelligence

---

## Technical Architecture

- Modular JS services for each integration (e.g., `deps-dev-service.js`, `security-scorecard-service.js`, `ecosystem-service.js`)
- New dashboard views for each insight area
- Layered enrichment: show basic data first, then progressively enhance with external data

---

## Value Proposition for Developers

- **Comprehensive Dependency Intelligence:** Not just vulnerabilities, but health, maintenance, and security posture
- **Proactive Risk Management:** EOL alerts, maintenance status, security best practices
- **Architecture Optimization:** Identify bloat, duplication, and consolidation opportunities
- **Team Collaboration:** Shared insights across teams and projects

---

## Next Steps

- Start with Deps.dev v3 integration
- Define MVP vs advanced milestones
- Design UI wireframes for new dashboards
- Implement modular enrichment services
- Gather user feedback and iterate

---

## Notes

- Security vulnerabilities are only one aspect; focus on process, productivity, and governance
- All analysis remains client-side for privacy
- Support SPDX, CycloneDX, and simple JSON SBOMs

---

*This document is a living brainstorming space. Add new ideas, APIs, and feedback as the project evolves!* 