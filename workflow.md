# SBOM Play - Workflow Documentation

## Project Overview

SBOM Play is a client-side web application for analyzing Software Bill of Materials (SBOM) data from GitHub repositories, organizations, and users. The application provides comprehensive dependency analysis, vulnerability scanning, license compliance checking, and organizational insights.

## Architecture Overview

```mermaid
graph TB
    subgraph "User Interface"
        UI[Main UI - index.html]
        Stats[Statistics Dashboard - stats.html]
        License[License Compliance - license-compliance.html]
        Vuln[Vulnerability Analysis - vuln.html]
        Deps[Dependencies View - deps.html]
        Settings[Settings - settings.html]
    end
    
    subgraph "Core Services"
        App[SBOMPlayApp - app.js]
        GitHub[GitHubClient - github-client.js]
        SBOM[SBOMProcessor - sbom-processor.js]
        Storage[StorageManager - storage-manager.js]
        View[ViewManager - view-manager.js]
    end
    
    subgraph "Analysis Services"
        OSV[OSVService - osv-service.js]
        LicenseProc[LicenseProcessor - license-processor.js]
        DepsDev[DepsDevService - deps-dev-service.js]
    end
    
    subgraph "External APIs"
        GitHubAPI[GitHub API]
        OSVAPI[OSV API]
        DepsDevAPI[deps.dev API]
    end
    
    subgraph "Data Storage"
        LocalStorage[Browser localStorage]
        Cache[In-Memory Cache]
    end
    
    UI --> App
    Stats --> View
    License --> View
    Vuln --> View
    Deps --> View
    Settings --> Storage
    
    App --> GitHub
    App --> SBOM
    App --> Storage
    
    GitHub --> GitHubAPI
    SBOM --> OSV
    SBOM --> LicenseProc
    SBOM --> DepsDev
    
    OSV --> OSVAPI
    DepsDev --> DepsDevAPI
    
    Storage --> LocalStorage
    OSV --> Cache
    DepsDev --> Cache
```

## Main Application Flow

```mermaid
flowchart TD
    Start([User opens application]) --> Init[Initialize SBOMPlayApp]
    Init --> LoadToken[Load saved GitHub token]
    LoadToken --> CheckStorage[Check storage availability]
    CheckStorage --> SetupUI[Setup UI event listeners]
    SetupUI --> CheckRateLimit[Check for rate limit state]
    CheckRateLimit --> ShowResults{Show previous results?}
    
    ShowResults -->|Yes| DisplayResults[Display stored results]
    ShowResults -->|No| WaitInput[Wait for user input]
    
    DisplayResults --> WaitInput
    WaitInput --> UserInput[User enters organization/user]
    UserInput --> StartAnalysis[Start analysis process]
    
    StartAnalysis --> FetchRepos[Fetch repositories from GitHub]
    FetchRepos --> ProcessRepos[Process each repository]
    ProcessRepos --> FetchSBOM[Fetch SBOM for repository]
    FetchSBOM --> ProcessSBOM[Process SBOM data]
    ProcessSBOM --> RateLimit{Rate limit hit?}
    
    RateLimit -->|Yes| SaveState[Save analysis state]
    RateLimit -->|No| Continue[Continue processing]
    
    SaveState --> ResumeLater[Resume later option]
    Continue --> MoreRepos{More repositories?}
    
    MoreRepos -->|Yes| ProcessRepos
    MoreRepos -->|No| AnalyzeData[Analyze collected data]
    
    AnalyzeData --> SaveResults[Save results to storage]
    SaveResults --> DisplayFinal[Display final results]
    DisplayFinal --> End([Analysis complete])
    
    ResumeLater --> ResumeAnalysis[Resume analysis]
    ResumeAnalysis --> ProcessRepos
```

## GitHub API Integration Flow

```mermaid
flowchart TD
    Start([GitHub API Request]) --> SetHeaders[Set request headers]
    SetHeaders --> Token{Token available?}
    
    Token -->|Yes| AuthHeaders[Add authorization header]
    Token -->|No| NoAuth[No authentication]
    
    AuthHeaders --> MakeRequest[Make HTTP request]
    NoAuth --> MakeRequest
    
    MakeRequest --> CheckResponse{Response status?}
    
    CheckResponse -->|200 OK| Success[Process successful response]
    CheckResponse -->|404 Not Found| NotFound[Handle not found]
    CheckResponse -->|403 Forbidden| Forbidden[Handle forbidden]
    CheckResponse -->|401 Unauthorized| Unauthorized[Handle unauthorized]
    CheckResponse -->|429 Rate Limited| RateLimited[Handle rate limit]
    CheckResponse -->|Other| Error[Handle other errors]
    
    RateLimited --> WaitTime[Calculate wait time]
    WaitTime --> SaveState[Save rate limit state]
    SaveState --> RetryLater[Retry later]
    
    Success --> ParseData[Parse JSON response]
    ParseData --> ReturnData[Return processed data]
    
    NotFound --> LogError[Log error details]
    Forbidden --> LogError
    Unauthorized --> LogError
    Error --> LogError
    
    LogError --> ReturnError[Return error to caller]
```

## SBOM Processing Flow

```mermaid
flowchart TD
    Start([SBOM Data Received]) --> Validate[Validate SBOM structure]
    Validate --> Valid{Valid SBOM?}
    
    Valid -->|No| LogInvalid[Log invalid SBOM]
    Valid -->|Yes| ExtractPackages[Extract packages]
    
    ExtractPackages --> ProcessPackage[Process each package]
    ProcessPackage --> SkipMain{Main repo package?}
    
    SkipMain -->|Yes| Skip[Skip main package]
    SkipMain -->|No| ExtractInfo[Extract package info]
    
    ExtractInfo --> Categorize[Categorize dependency]
    Categorize --> StoreDependency[Store dependency data]
    StoreDependency --> UpdateStats[Update statistics]
    UpdateStats --> MorePackages{More packages?}
    
    MorePackages -->|Yes| ProcessPackage
    MorePackages -->|No| GenerateReport[Generate analysis report]
    
    GenerateReport --> SaveData[Save to storage]
    SaveData --> End([Processing complete])
    
    Skip --> MorePackages
    LogInvalid --> End
```

## Storage Management Flow

```mermaid
flowchart TD
    Start([Save Data Request]) --> Compress[Compress data]
    Compress --> CheckSpace[Check available space]
    CheckSpace --> EnoughSpace{Enough space?}
    
    EnoughSpace -->|Yes| SaveData[Save data to localStorage]
    EnoughSpace -->|No| Cleanup[Clean up old data]
    
    Cleanup --> RemoveHistory[Remove old history entries]
    RemoveHistory --> RemoveOldOrgs[Remove oldest organizations]
    RemoveOldOrgs --> CheckAgain[Check space again]
    
    CheckAgain --> StillFull{Still full?}
    StillFull -->|Yes| ClearAll[Clear all except most recent]
    StillFull -->|No| SaveData
    
    ClearAll --> SaveData
    SaveData --> UpdateIndex[Update organization index]
    UpdateIndex --> AddHistory[Add to history]
    AddHistory --> Success[Return success]
    
    Success --> End([Storage complete])
```

## Vulnerability Analysis Flow

```mermaid
flowchart TD
    Start([Vulnerability Analysis]) --> GetDependencies[Get dependencies from SBOM]
    GetDependencies --> CheckCache[Check OSV cache]
    CheckCache --> Cached{Cached data?}
    
    Cached -->|Yes| UseCache[Use cached data]
    Cached -->|No| QueryOSV[Query OSV API]
    
    QueryOSV --> RateLimit{Rate limited?}
    RateLimit -->|Yes| Wait[Wait and retry]
    RateLimit -->|No| ProcessResults[Process vulnerability results]
    
    Wait --> QueryOSV
    UseCache --> ProcessResults
    ProcessResults --> AnalyzeSeverity[Analyze severity levels]
    AnalyzeSeverity --> StoreResults[Store vulnerability data]
    StoreResults --> GenerateReport[Generate vulnerability report]
    GenerateReport --> End([Analysis complete])
```

## License Compliance Flow

```mermaid
flowchart TD
    Start([License Analysis]) --> ExtractLicenses[Extract license information]
    ExtractLicenses --> CategorizeLicenses[Categorize licenses]
    CategorizeLicenses --> CheckConflicts[Check for license conflicts]
    CheckConflicts --> IdentifyRisks[Identify high-risk licenses]
    IdentifyRisks --> GenerateCompliance[Generate compliance report]
    GenerateCompliance --> StoreResults[Store license analysis]
    StoreResults --> End([License analysis complete])
```

## View Management Flow

```mermaid
flowchart TD
    Start([View Request]) --> DetermineView{Which view?}
    
    DetermineView -->|Overview| ShowOverview[Show organization overview]
    DetermineView -->|Dependency| ShowDependency[Show dependency details]
    DetermineView -->|Repository| ShowRepository[Show repository details]
    DetermineView -->|Vulnerability| ShowVulnerability[Show vulnerability analysis]
    DetermineView -->|License| ShowLicense[Show license compliance]
    
    ShowOverview --> GenerateOverviewHTML[Generate overview HTML]
    ShowDependency --> GenerateDependencyHTML[Generate dependency HTML]
    ShowRepository --> GenerateRepositoryHTML[Generate repository HTML]
    ShowVulnerability --> GenerateVulnerabilityHTML[Generate vulnerability HTML]
    ShowLicense --> GenerateLicenseHTML[Generate license HTML]
    
    GenerateOverviewHTML --> RenderView[Render view in container]
    GenerateDependencyHTML --> RenderView
    GenerateRepositoryHTML --> RenderView
    GenerateVulnerabilityHTML --> RenderView
    GenerateLicenseHTML --> RenderView
    
    RenderView --> AddEventListeners[Add event listeners]
    AddEventListeners --> End([View displayed])
```

## DepsDev Integration Flow

```mermaid
flowchart TD
    Start([DepsDev Analysis]) --> GetDependencies[Get dependencies from SBOM]
    GetDependencies --> DetectEcosystem[Detect ecosystem for each dependency]
    DetectEcosystem --> CheckCache[Check DepsDev cache]
    CheckCache --> Cached{Cached data?}
    
    Cached -->|Yes| UseCache[Use cached data]
    Cached -->|No| FetchTree[Fetch dependency tree]
    Cached -->|No| FetchMetadata[Fetch package metadata]
    
    FetchTree --> RateLimit{Rate limited?}
    RateLimit -->|Yes| Wait[Wait between requests]
    RateLimit -->|No| ProcessTree[Process dependency tree]
    
    FetchMetadata --> ProcessMetadata[Process package metadata]
    Wait --> FetchTree
    Wait --> FetchMetadata
    
    UseCache --> ProcessTree
    UseCache --> ProcessMetadata
    
    ProcessTree --> EnrichData[Enrich dependency data]
    ProcessMetadata --> EnrichData
    EnrichData --> CalculateInsights[Calculate dependency insights]
    CalculateInsights --> StoreResults[Store enriched data]
    StoreResults --> End([DepsDev analysis complete])
```

## Data Flow Architecture

```mermaid
flowchart LR
    subgraph "Input Layer"
        GitHubAPI[GitHub API]
        UserInput[User Input]
    end
    
    subgraph "Processing Layer"
        GitHubClient[GitHub Client]
        SBOMProcessor[SBOM Processor]
        OSVService[OSV Service]
        DepsDevService[DepsDev Service]
        LicenseProcessor[License Processor]
    end
    
    subgraph "Storage Layer"
        LocalStorage[Local Storage]
        MemoryCache[Memory Cache]
    end
    
    subgraph "Presentation Layer"
        ViewManager[View Manager]
        UIComponents[UI Components]
    end
    
    GitHubAPI --> GitHubClient
    UserInput --> GitHubClient
    
    GitHubClient --> SBOMProcessor
    SBOMProcessor --> OSVService
    SBOMProcessor --> DepsDevService
    SBOMProcessor --> LicenseProcessor
    
    OSVService --> MemoryCache
    DepsDevService --> MemoryCache
    SBOMProcessor --> LocalStorage
    LicenseProcessor --> LocalStorage
    
    MemoryCache --> ViewManager
    LocalStorage --> ViewManager
    ViewManager --> UIComponents
```

## Error Handling Flow

```mermaid
flowchart TD
    Start([Error Occurs]) --> LogError[Log error details]
    LogError --> DetermineType{Error type?}
    
    DetermineType -->|Rate Limit| HandleRateLimit[Handle rate limiting]
    DetermineType -->|Network| HandleNetwork[Handle network errors]
    DetermineType -->|Storage| HandleStorage[Handle storage errors]
    DetermineType -->|API| HandleAPI[Handle API errors]
    DetermineType -->|Validation| HandleValidation[Handle validation errors]
    
    HandleRateLimit --> SaveState[Save analysis state]
    SaveState --> ShowResume[Show resume option]
    
    HandleNetwork --> Retry[Retry with exponential backoff]
    Retry --> MaxRetries{Max retries?}
    MaxRetries -->|No| Retry
    MaxRetries -->|Yes| ShowError[Show error to user]
    
    HandleStorage --> Cleanup[Clean up storage]
    Cleanup --> ShowWarning[Show storage warning]
    
    HandleAPI --> ParseError[Parse API error]
    ParseError --> ShowError
    
    HandleValidation --> ShowValidation[Show validation error]
    
    ShowResume --> End([Error handled])
    ShowError --> End
    ShowWarning --> End
    ShowValidation --> End
```

## Component Dependencies

```mermaid
graph TD
    subgraph "Core Components"
        App[SBOMPlayApp]
        GitHub[GitHubClient]
        SBOM[SBOMProcessor]
        Storage[StorageManager]
        View[ViewManager]
    end
    
    subgraph "Analysis Services"
        OSV[OSVService]
        License[LicenseProcessor]
        DepsDev[DepsDevService]
    end
    
    subgraph "UI Pages"
        Index[index.html]
        Stats[stats.html]
        LicensePage[license-compliance.html]
        VulnPage[vuln.html]
        DepsPage[deps.html]
        SettingsPage[settings.html]
    end
    
    App --> GitHub
    App --> SBOM
    App --> Storage
    App --> View
    
    SBOM --> OSV
    SBOM --> License
    SBOM --> DepsDev
    
    View --> Storage
    View --> OSV
    
    Index --> App
    Stats --> View
    LicensePage --> View
    VulnPage --> View
    DepsPage --> View
    SettingsPage --> Storage
```

## Performance Optimization Flow

```mermaid
flowchart TD
    Start([Performance Check]) --> CheckCache[Check cache hit rate]
    CheckCache --> CacheEfficient{Cache efficient?}
    
    CacheEfficient -->|No| OptimizeCache[Optimize cache strategy]
    CacheEfficient -->|Yes| CheckStorage[Check storage usage]
    
    CheckStorage --> StorageOK{Storage OK?}
    StorageOK -->|No| CleanupStorage[Clean up storage]
    StorageOK -->|Yes| CheckMemory[Check memory usage]
    
    CheckMemory --> MemoryOK{Memory OK?}
    MemoryOK -->|No| ClearMemory[Clear memory cache]
    MemoryOK -->|Yes| CheckNetwork[Check network requests]
    
    CheckNetwork --> NetworkOK{Network OK?}
    NetworkOK -->|No| OptimizeRequests[Optimize API requests]
    NetworkOK -->|Yes| PerformanceOK[Performance OK]
    
    OptimizeCache --> PerformanceOK
    CleanupStorage --> PerformanceOK
    ClearMemory --> PerformanceOK
    OptimizeRequests --> PerformanceOK
    
    PerformanceOK --> End([Performance optimized])
```

This workflow documentation provides a comprehensive view of how SBOM Play processes data, handles errors, manages storage, and delivers insights to users. Each flowchart represents a specific aspect of the application's functionality and can be used for understanding, debugging, or extending the system. 