# SBOM Play - Application Flow Documentation

This document provides comprehensive flowcharts documenting how SBOM Play performs each action. All flows are documented using Mermaid syntax for easy visualization.

## Table of Contents

1. [Application Initialization Flow](#application-initialization-flow)
2. [Single Repository Analysis Flow](#single-repository-analysis-flow)
3. [Organization/User Analysis Flow](#organizationuser-analysis-flow)
4. [SBOM Processing Flow](#sbom-processing-flow)
5. [Vulnerability Analysis Flow](#vulnerability-analysis-flow)
6. [Author Analysis Flow](#author-analysis-flow)
7. [License Compliance Analysis Flow](#license-compliance-analysis-flow)
8. [Storage Operations Flow](#storage-operations-flow)
9. [View Rendering Flow](#view-rendering-flow)
10. [Rate Limit Handling Flow](#rate-limit-handling-flow)

---

## Application Initialization Flow

The application initialization process sets up all components and prepares the UI for user interaction.

```mermaid
flowchart TD
    A[index.html loads] --> B[Load CSS files]
    B --> C[Load JavaScript dependencies]
    C --> D[Load app.js]
    D --> E[SBOMPlayApp constructor]
    E --> F[Initialize GitHubClient]
    E --> G[Initialize SBOMProcessor]
    E --> H[Initialize StorageManager]
    E --> I[Set up beforeunload listener]
    E --> J[Call initializeApp]
    J --> K[StorageManager.init]
    K --> L[IndexedDBManager.initDB]
    L --> M{IndexedDB available?}
    M -->|No| N[Show warning alert]
    M -->|Yes| O[Check storage availability]
    O --> P[Conditional UI setup]
    P --> Q{Storage status element exists?}
    Q -->|Yes| R[Show storage status]
    Q -->|No| S[Check results section]
    R --> S
    S --> T{Results section exists?}
    T -->|Yes| U[Load previous results]
    T -->|No| V[Check input elements]
    U --> V
    V --> W{Input elements exist?}
    W -->|Yes| X[Setup event listeners]
    W -->|No| Y[Check resume section]
    X --> Y
    Y --> Z{Resume section exists?}
    Z -->|Yes| AA[Check rate limit state]
    Z -->|No| AB[Check orgName element]
    AA --> AB
    AB --> AC{orgName exists?}
    AC -->|Yes| AD[Handle URL parameters]
    AC -->|No| AE[Get storage info]
    AD --> AE
    AE --> AF{Stored entries > 0?}
    AF -->|Yes| AG[Display stats dashboard]
    AF -->|No| AH[Application ready]
    AG --> AH
    
    N --> AH
    
    style A fill:#e1f5ff
    style AH fill:#c8e6c9
    style N fill:#ffcdd2
```

**Key Components:**
- **SBOMPlayApp**: Main application class that orchestrates all operations
- **StorageManager**: Handles IndexedDB operations for persistent storage
- **GitHubClient**: Manages GitHub API interactions with rate limit handling
- **SBOMProcessor**: Processes and analyzes SBOM data

---

## Single Repository Analysis Flow

When a user analyzes a single repository, the application fetches and processes its SBOM data with phase-based progress tracking.

```mermaid
flowchart TD
    A[User clicks Start Analysis] --> B[Parse input]
    B --> C{Input format?}
    C -->|URL| D[Extract owner/repo from URL]
    C -->|owner/repo| E[Use directly]
    C -->|username| F[Error: Need repo]
    D --> G[Set isAnalyzing = true]
    E --> G
    G --> H[Reset SBOMProcessor]
    H --> I[Reset progress tracker]
    I --> J[Update UI: Show progress]
    J --> K[Phase: initialization 2%]
    K --> L[Get rate limit info]
    L --> M[Phase: fetching-repo 5%]
    M --> N[Fetch repository metadata]
    N --> O{Repository found?}
    O -->|No| P[Show error alert]
    O -->|Yes| Q[Phase: fetching-sbom 10%]
    Q --> R[Fetch SBOM data]
    R --> S{SBOM available?}
    S -->|No| T[Show warning: Dependency Graph not enabled]
    S -->|Yes| U[Phase: processing-sbom 8%]
    U --> V[Process SBOM data]
    V --> W[Extract packages]
    W --> X[Categorize dependencies]
    X --> Y[Extract relationships]
    Y --> Z[Phase: resolving-trees 50%]
    Z --> AA[Resolve dependency trees]
    AA --> AB[Update progress with ecosystem/package details]
    AB --> AC[Phase: generating-results 5%]
    AC --> AD[Generate analysis results]
    AD --> AE[Phase: license-analysis 5%]
    AE --> AF[Run license compliance analysis]
    AF --> AG[Phase: saving-initial 2%]
    AG --> AH[Save initial results]
    AH --> AI[Phase: vulnerability-analysis 8%]
    AI --> AJ[Run vulnerability analysis]
    AJ --> AK[Phase: author-analysis 4%]
    AK --> AL[Run author analysis]
    AL --> AM[Phase: saving-final 1%]
    AM --> AN[Save final results]
    AN --> AO[Display single repo results]
    AO --> AP[Show stats dashboard]
    AP --> AQ[Analysis complete]
    
    P --> AR[Finish analysis]
    T --> AR
    AQ --> AR
    
    style A fill:#e1f5ff
    style AQ fill:#c8e6c9
    style P fill:#ffcdd2
    style T fill:#fff9c4
    style Z fill:#e1bee7
    style AB fill:#fff9c4
```

**Key Steps:**
1. Parse user input (supports URLs, owner/repo format, or username)
2. Initialize progress tracker with phase weights
3. **Phase: initialization (2%)** - Set up analysis environment
4. **Phase: fetching-repo (5%)** - Fetch repository metadata from GitHub API
5. **Phase: fetching-sbom (10%)** - Fetch SBOM data using Dependency Graph API
6. **Phase: processing-sbom (8%)** - Process and categorize dependencies
7. **Phase: resolving-trees (50%)** - Resolve full dependency trees with registry APIs
   - Progress updates show ecosystem and package counts (e.g., "Resolving github actions dependencies (3/4 packages)...")
8. **Phase: generating-results (5%)** - Generate analysis results
9. **Phase: license-analysis (5%)** - Run license compliance analysis
10. **Phase: saving-initial (2%)** - Save initial results to storage
11. **Phase: vulnerability-analysis (8%)** - Run vulnerability analysis with incremental saving
12. **Phase: author-analysis (4%)** - Run author analysis
13. **Phase: saving-final (1%)** - Save final results and display using `displaySingleRepoResults`

**Progress Tracking Features:**
- Phase-based progress calculation using weighted phases
- Enhanced status messages with detailed information (ecosystem, package counts)
- Progress bar reflects actual work progress based on analysis phases
- Elapsed time tracking (estimated remaining time removed as not useful for variable-duration operations)

---

## Organization/User Analysis Flow

When analyzing an organization or user, the application processes multiple repositories with incremental saving and phase-based progress tracking.

```mermaid
flowchart TD
    A[User enters org/user name] --> B[Parse input]
    B --> C[Set isAnalyzing = true]
    C --> D[Reset SBOMProcessor]
    D --> E[Reset progress tracker]
    E --> F[Update UI: Show progress]
    F --> G[Phase: initialization 2%]
    G --> H[Get rate limit info]
    H --> I[Phase: fetching-repo 5%]
    I --> J[Fetch repositories list]
    J --> K{Repositories found?}
    K -->|No| L[Show info: No public repos]
    K -->|Yes| M[Set total repositories count]
    M --> N[Phase: fetching-sbom 10%]
    N --> O[Loop: For each repository]
    O --> P[Update progress with repo count]
    P --> Q[Fetch SBOM data]
    Q --> R{SBOM available?}
    R -->|No| S[Mark as failed]
    R -->|Yes| T[Process SBOM data]
    T --> U[Update processor progress]
    U --> V{Every 10 repos?}
    V -->|Yes| W[Export partial data]
    V -->|No| X[Continue]
    W --> Y[Save incremental data]
    Y --> Z[Clear memory after save]
    Z --> X
    X --> AA{More repos?}
    AA -->|Yes| O
    AA -->|No| AB[Phase: processing-sbom 8%]
    AB --> AC[Process all SBOM data]
    AC --> AD[Phase: resolving-trees 50%]
    AD --> AE[Resolve dependency trees]
    AE --> AF[Update progress with ecosystem/package details]
    AF --> AG[Phase: generating-results 5%]
    AG --> AH[Generate results]
    AH --> AI[Phase: license-analysis 5%]
    AI --> AJ[Run license compliance analysis]
    AJ --> AK[Phase: saving-initial 2%]
    AK --> AL[Save initial results]
    AL --> AM[Phase: vulnerability-analysis 8%]
    AM --> AN[Run vulnerability analysis with incremental saving]
    AN --> AO[Phase: author-analysis 4%]
    AO --> AP[Run author analysis]
    AP --> AQ[Reload data with author info]
    AQ --> AR[Phase: saving-final 1%]
    AR --> AS[Save final results]
    AS --> AT[Display results]
    AT --> AU[Show stats dashboard]
    AU --> AV[Analysis complete]
    
    L --> AW[Finish analysis]
    S --> AA
    AV --> AW
    
    style A fill:#e1f5ff
    style AV fill:#c8e6c9
    style L fill:#fff9c4
    style W fill:#e1bee7
    style AD fill:#e1bee7
    style AF fill:#fff9c4
```

**Key Features:**
- **Phase-Based Progress Tracking**: Progress calculated using weighted phases for accurate representation
- **Incremental Saving**: Data is saved every 10 repositories to prevent data loss
- **Memory Management**: Memory is cleared after incremental saves to prevent DOM issues
- **Enhanced Progress Updates**: Real-time progress updates with detailed status messages showing repository counts and ecosystem information
- **Error Handling**: Failed repositories are tracked but don't stop the analysis

---

## SBOM Processing Flow

The SBOM processor extracts, categorizes, and analyzes dependency information from GitHub SBOM data.

```mermaid
flowchart TD
    A[Receive SBOM data] --> B{Valid SBOM?}
    B -->|No| C[Return false]
    B -->|Yes| D[Extract packages array]
    D --> E[Initialize repository data structure]
    E --> F[Find main package SPDXID]
    F --> G[Extract relationships]
    G --> H[Loop: For each package]
    H --> I{Is main package?}
    I -->|Yes| J[Skip]
    I -->|No| K[Extract version info]
    K --> L[Normalize version]
    L --> M[Create dependency key]
    M --> N[Add to repository dependencies]
    N --> O[Check if direct dependency]
    O --> P[Categorize dependency]
    P --> Q{Category type?}
    Q -->|code| R[Add to code category]
    Q -->|workflow| S[Add to workflow category]
    Q -->|infrastructure| T[Add to infrastructure category]
    Q -->|unknown| U[Add to unknown category]
    R --> V[Extract PURL info]
    S --> V
    T --> V
    U --> V
    V --> W[Track global dependency usage]
    W --> X{New dependency?}
    X -->|Yes| Y[Create dependency entry]
    X -->|No| Z[Update existing entry]
    Y --> AA[Track repositories using it]
    Z --> AA
    AA --> BB[Track direct/transitive usage]
    BB --> CC{More packages?}
    CC -->|Yes| H
    CC -->|No| DD[Assess SBOM quality]
    DD --> EE[Store repository data]
    EE --> FF[Return success]
    
    C --> GG[End]
    FF --> GG
    
    style A fill:#e1f5ff
    style FF fill:#c8e6c9
    style C fill:#ffcdd2
    style DD fill:#e1bee7
```

**Key Operations:**
- **Version Normalization**: Removes comparison operators (>=, <=, ^, ~)
- **Dependency Categorization**: Classifies as code, workflow, or infrastructure
- **Relationship Tracking**: Identifies direct vs transitive dependencies
- **Quality Assessment**: Evaluates SBOM completeness and quality

---

## Vulnerability Analysis Flow

The vulnerability analysis queries OSV.dev API to identify security vulnerabilities in dependencies.

```mermaid
flowchart TD
    A[Start vulnerability analysis] --> B[Get all dependencies]
    B --> C[Map dependencies to packages with ecosystem]
    C --> D[Try batch query first]
    D --> E[Check unified cache for batch]
    E --> F{Cached?}
    F -->|Yes| G[Use cached batch data]
    F -->|No| H[Query OSV.dev batch API]
    H --> I{Batch success?}
    I -->|Yes| J{Minimal data returned?}
    I -->|No| K[Fallback to individual queries]
    J -->|Yes| K
    J -->|No| L[Use batch results]
    K --> M[Loop: For each package]
    M --> N[Check unified cache]
    N --> O{Cached?}
    O -->|Yes| P[Use cached data]
    O -->|No| Q[Map ecosystem to OSV format]
    Q --> R[Query OSV.dev API individually]
    R --> S[Save to unified cache]
    S --> T{More packages?}
    T -->|Yes| M
    T -->|No| U[Process all results]
    G --> U
    L --> U
    P --> T
    U --> V[Analyze severity levels]
    V --> W[Save to IndexedDB]
    W --> X[Update progress]
    X --> Y[Save incremental data]
    Y --> Z[Analysis complete]
    
    style A fill:#e1f5ff
    style Z fill:#c8e6c9
    style K fill:#fff9c4
    style S fill:#e1bee7
```

**Key Features:**
- **Batch Processing**: Tries batch query first (up to 100 packages), falls back to individual queries if minimal data returned
- **Caching**: Uses unified cache manager to avoid redundant API calls
- **Ecosystem Mapping**: Maps internal ecosystem names to OSV.dev format using PURL extraction
- **Incremental Saving**: Saves results incrementally during analysis
- **Severity Analysis**: Categorizes vulnerabilities by severity (CRITICAL, HIGH, MEDIUM, LOW)

---

## Author Analysis Flow

The author analysis fetches package author information from multiple sources and identifies funding opportunities.

```mermaid
flowchart TD
    A[Start author analysis] --> B[Load analysis data from storage]
    B --> C[Extract dependencies with PURLs]
    C --> D[Build unique packages map]
    D --> E[Deduplicate by ecosystem:name]
    E --> F[Loop: For each unique package]
    F --> G[Create package key]
    G --> H[Check unified cache]
    H --> I{Cached?}
    I -->|Yes| J[Use cached authors]
    I -->|No| K[Check IndexedDB cache]
    K --> L{Cached in DB?}
    L -->|Yes| M[Use DB cached data]
    L -->|No| N[Try native registry API]
    N --> O{Registry available?}
    O -->|Yes| P[Fetch from registry]
    O -->|No| Q[Try ecosyste.ms API]
    P --> R{Authors found?}
    Q --> R
    R -->|Yes| S[Extract authors]
    R -->|No| T[Try repository extraction]
    T --> U{Authors found?}
    U -->|Yes| S
    U -->|No| V[Empty authors array]
    S --> W[Extract funding information]
    V --> X[Save to unified cache immediately]
    W --> X
    X --> Y[Save to IndexedDB]
    Y --> Z[Update progress]
    Z --> AA{More packages?}
    AA -->|Yes| F
    AA -->|No| AB[Group authors by author key]
    AB --> AC[Calculate repository counts]
    AC --> AD[Fetch author funding from profiles]
    AD --> AE[Save author entities]
    AE --> AF[Save package-author relationships]
    AF --> AG[Analysis complete]
    
    J --> Z
    M --> Z
    
    style A fill:#e1f5ff
    style AG fill:#c8e6c9
    style AB fill:#e1bee7
    style W fill:#fff9c4
    style B fill:#e1bee7
```

**Data Sources (Priority Order):**
1. **Native Registries**: npm, PyPI, Cargo, NuGet, RubyGems (most reliable)
2. **ecosyste.ms**: Fallback API for package metadata
3. **Repository Extraction**: Extract owners from repository URLs

**Key Features:**
- **Storage-First**: Loads analysis data from IndexedDB before starting
- **PURL-Based Extraction**: Extracts packages using PURL information from dependencies
- **Package Deduplication**: Deduplicates by ecosystem:name before fetching
- **Multi-source Fetching**: Tries multiple sources for maximum coverage
- **Funding Detection**: Identifies GitHub Sponsors, Open Collective, Patreon, Tidelift (both package and author level)
- **Author Grouping**: Groups authors by author key and calculates repository counts
- **Incremental Caching**: Saves immediately after fetching each package to unified cache and IndexedDB

---

## License Compliance Analysis Flow

The license processor analyzes license information and identifies compliance risks.

```mermaid
flowchart TD
    A[Start license analysis] --> B[Get all dependencies]
    B --> C[Loop: For each dependency]
    C --> D[Get package from SBOM]
    D --> E[Parse license info]
    E --> F{License field?}
    F -->|licenseConcluded| G[Use licenseConcluded]
    F -->|licenseDeclared| H[Use licenseDeclared]
    F -->|Neither| I[Mark as unknown]
    G --> J{Complex license?}
    H --> J
    J -->|AND/OR| K[Parse complex license]
    J -->|Simple| L[Check license category]
    K --> M[Analyze components]
    M --> N[Determine most restrictive]
    N --> L
    L --> O{Category?}
    O -->|Permissive| P[Low risk]
    O -->|LGPL| Q[Medium risk]
    O -->|Copyleft| R[High risk]
    O -->|Proprietary| S[Medium risk]
    O -->|Unknown| T[High risk]
    P --> U[Add to permissive list]
    Q --> V[Add to LGPL list]
    R --> W[Add to copyleft list]
    S --> X[Add to proprietary list]
    T --> Y[Add to unknown list]
    U --> Z[Check compatibility]
    V --> Z
    W --> Z
    X --> Z
    Y --> Z
    Z --> AA{More dependencies?}
    AA -->|Yes| C
    AA -->|No| AB[Generate compliance report]
    AB --> AC[Identify conflicts]
    AC --> AD[Calculate risk scores]
    AD --> AE[Generate recommendations]
    AE --> AF[Return analysis results]
    
    I --> Y
    
    style A fill:#e1f5ff
    style AF fill:#c8e6c9
    style R fill:#ffcdd2
    style T fill:#ffcdd2
    style AC fill:#fff9c4
```

**License Categories:**
- **Permissive**: MIT, Apache, BSD (low risk)
- **LGPL**: Lesser GPL licenses (medium risk)
- **Copyleft**: GPL, AGPL, MPL (high risk)
- **Proprietary**: Commercial licenses (medium risk)
- **Unknown**: Unspecified licenses (high risk)

**Key Features:**
- **Complex License Parsing**: Handles AND/OR combinations
- **Compatibility Checking**: Validates license compatibility matrix
- **Risk Assessment**: Categorizes licenses by compliance risk
- **Conflict Detection**: Identifies incompatible license combinations

---

## Storage Operations Flow

The storage manager handles all IndexedDB operations for persistent data storage.

```mermaid
flowchart TD
    A[Storage operation request] --> B{Operation type?}
    B -->|Init| C[Initialize IndexedDB]
    B -->|Save| D[Determine entry type]
    B -->|Load| E[Query IndexedDB]
    B -->|Export| F[Get all entries]
    B -->|Clear| G[Clear object stores]
    
    C --> H[Open database connection]
    H --> I{DB exists?}
    I -->|No| J[Create object stores]
    I -->|Yes| K[Check version]
    J --> L[Store initialized]
    K --> L
    
    D --> M{Is repository?}
    M -->|Yes| N[Save to repositories store]
    M -->|No| O[Save to organizations store]
    N --> P[Update timestamp]
    O --> P
    P --> Q[Save packages to packages store]
    Q --> R[Save authors to authors store]
    R --> S[Save vulnerabilities to vulnerabilities store]
    S --> T[Operation complete]
    
    E --> U{Load type?}
    U -->|All entries| V[Query all stores]
    U -->|Organization| W[Query organizations store]
    U -->|Repository| X[Query repositories store]
    V --> Y[Combine results]
    W --> Y
    X --> Y
    Y --> T
    
    F --> Z[Get organizations]
    Z --> AA[Get repositories]
    AA --> AB[Get packages]
    AB --> AC[Get authors]
    AC --> AD[Get vulnerabilities]
    AD --> AE[Generate JSON]
    AE --> AF[Create download blob]
    AF --> T
    
    G --> AG[Clear organizations]
    AG --> AH[Clear repositories]
    AH --> AI[Clear packages]
    AI --> AJ[Clear authors]
    AJ --> AK[Clear vulnerabilities]
    AK --> T
    
    style A fill:#e1f5ff
    style T fill:#c8e6c9
    style L fill:#e1bee7
```

**Object Stores:**
- **organizations**: Organization/user analysis data
- **repositories**: Individual repository data
- **packages**: Package metadata and relationships
- **authors**: Author entities with deduplication
- **vulnerabilities**: Vulnerability scan results
- **packageAuthors**: Package-author relationships

**Key Features:**
- **Incremental Saving**: Supports partial data saves during analysis
- **Type Detection**: Auto-detects organization vs repository entries
- **Export/Import**: Full data export with checksum validation
- **Storage Management**: Tracks usage and provides cleanup options

---

## View Rendering Flow

The view manager handles rendering of analysis results across different pages.

```mermaid
flowchart TD
    A[Page load/View request] --> B{Page type?}
    B -->|index.html| C[Load from storage]
    B -->|deps.html| D[Load dependency view]
    B -->|vuln.html| E[Load vulnerability view]
    B -->|licenses.html| F[Load license view]
    B -->|quality.html| G[Load quality view]
    B -->|authors.html| H[Load author view]
    B -->|settings.html| I[Load settings view]
    
    C --> J[Get all entries]
    J --> K[Display stats dashboard]
    K --> L[Show stored analyses table]
    L --> M[Render quick access links]
    
    D --> N[Get organization data]
    N --> O[Render dependency tree]
    O --> P[Apply filters]
    P --> Q[Render dependency cards]
    Q --> R[Enable search/sort]
    
    E --> S[Get vulnerability data]
    S --> T[Group by severity]
    T --> U[Render vulnerability cards]
    U --> V[Show OSV.dev links]
    V --> W[Enable filtering]
    
    F --> X[Get license analysis]
    X --> Y[Render license distribution]
    Y --> Z[Show compliance report]
    Z --> AA[Highlight conflicts]
    
    G --> AB[Get quality data]
    AB --> AC[Render quality scores]
    AC --> AD[Show quality breakdown]
    AD --> AE[Display recommendations]
    
    H --> AF[Get author data]
    AF --> AG[Render author profiles]
    AG --> AH[Show funding opportunities]
    AH --> AI[Display package associations]
    
    I --> AJ[Get storage info]
    AJ --> AK[Show storage usage]
    AK --> AL[Render export/import]
    AL --> AM[Show cleanup options]
    
    M --> AN[View ready]
    R --> AN
    W --> AN
    AA --> AN
    AE --> AN
    AI --> AN
    AM --> AN
    
    style A fill:#e1f5ff
    style AN fill:#c8e6c9
    style K fill:#e1bee7
```

**View Components:**
- **Statistics Dashboard**: Overview metrics and charts
- **Dependency Views**: Tree visualization and filtering
- **Vulnerability Views**: Severity-based grouping and filtering
- **License Views**: Distribution charts and compliance reports
- **Quality Views**: Score breakdowns and recommendations
- **Author Views**: Profiles with funding opportunities

---

## Rate Limit Handling Flow

The GitHub client handles rate limiting automatically with state persistence.

```mermaid
flowchart TD
    A[GitHub API request] --> B[Make request]
    B --> C{Response status?}
    C -->|200 OK| D[Return response]
    C -->|403 Forbidden| E[Check rate limit headers]
    C -->|Other| F[Handle error]
    
    E --> G{Rate limit exceeded?}
    G -->|No| H[Handle access denied]
    G -->|Yes| I[Get reset time]
    I --> J[Calculate wait time]
    J --> K[Save rate limit state]
    K --> L[Show waiting UI]
    L --> M[Start countdown timer]
    M --> N[Wait for reset]
    N --> O[Clear rate limit state]
    O --> P[Retry request]
    P --> Q{Success?}
    Q -->|Yes| D
    Q -->|No| R{Retry count < 3?}
    R -->|Yes| P
    R -->|No| S[Return error]
    
    H --> T[Return null]
    F --> T
    S --> T
    
    U[Page load] --> V[Check rate limit state]
    V --> W{State exists?}
    W -->|Yes| X[Check if expired]
    W -->|No| Y[No resume needed]
    X --> Z{Expired?}
    Z -->|Yes| AA[Clear state]
    Z -->|No| AB[Show resume section]
    AB --> AC[User clicks resume]
    AC --> AD[Clear state]
    AD --> AE[Start analysis]
    
    AA --> Y
    
    style A fill:#e1f5ff
    style D fill:#c8e6c9
    style T fill:#ffcdd2
    style L fill:#fff9c4
    style AB fill:#e1bee7
```

**Rate Limit Features:**
- **Automatic Handling**: Detects and waits for rate limit resets
- **State Persistence**: Saves state to localStorage for resume capability
- **User Notification**: Shows countdown timer and reset time
- **Resume Support**: Allows resuming interrupted analyses

---

## Data Flow Overview

This diagram shows how data flows through the entire application.

```mermaid
flowchart LR
    A[User Input] --> B[GitHub API]
    B --> C[SBOM Data]
    C --> D[SBOM Processor]
    D --> E[Processed Dependencies]
    E --> F[License Processor]
    E --> G[OSV Service]
    E --> H[Author Service]
    F --> I[License Analysis]
    G --> J[Vulnerability Data]
    H --> K[Author Data]
    I --> L[Storage Manager]
    J --> L
    K --> L
    E --> L
    L --> M[IndexedDB]
    M --> N[View Manager]
    N --> O[UI Display]
    
    style A fill:#e1f5ff
    style O fill:#c8e6c9
    style L fill:#e1bee7
    style M fill:#fff9c4
```

---

## Key Design Patterns

1. **Incremental Processing**: Large analyses are broken into chunks with incremental saves
2. **Phase-Based Progress Tracking**: Progress calculated using weighted phases (initialization 2%, fetching-repo 5%, fetching-sbom 10%, processing-sbom 8%, resolving-trees 50%, generating-results 5%, license-analysis 5%, saving-initial 2%, vulnerability-analysis 8%, author-analysis 4%, saving-final 1%)
3. **Enhanced Status Messages**: Detailed progress messages showing ecosystem, package counts, and current operation (e.g., "Resolving github actions dependencies (3/4 packages)...")
4. **Caching Strategy**: Multi-layer caching (unified cache, IndexedDB, in-memory)
5. **Error Resilience**: Failed operations don't stop entire analysis
6. **State Persistence**: Rate limit and analysis state saved for recovery
7. **Modular Architecture**: Separate processors for different analysis types
8. **Client-Side Only**: All processing happens in the browser for privacy

---

## Notes

- All API calls respect rate limits and include retry logic
- Data is saved incrementally to prevent loss during long analyses
- Cache is checked before making external API calls
- Storage operations are asynchronous and non-blocking
- UI updates happen progressively as data becomes available
- Progress tracking uses phase weights to accurately reflect actual work progress
- Status messages provide detailed information about current operation (ecosystem, package counts)
- Elapsed time is tracked and displayed, but estimated remaining time is not shown (not useful for variable-duration operations)
- Progress bar animations use cubic-bezier transitions and shimmer effects for better visual feedback

> Note: This is generated with the help of Cursor + Composer 1. This note will be removed once full manual inspection is done or product has reached a mature state and flows are finalized.
