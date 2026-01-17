# Architecture Diagrams

Visual representation of Asterisk's system architecture, data flows, and interaction patterns.

## System Overview

```mermaid
graph TB
    subgraph "Browser (Chrome)"
        Form[Web Form]
        CS[Content Script]
        BG[Background Script]
    end

    subgraph "Desktop App (Tauri)"
        HTTP[HTTP Bridge<br/>:17373]
        UI[React UI<br/>:1420]
        Matching[Matching Engine]
        Vault[Vault Store]
        LLM[LLM Client]
    end

    subgraph "External"
        API[Claude API<br/>Anthropic]
    end

    Form -->|DOM Events| CS
    CS -->|Form Snapshot| BG
    BG -->|POST /v1/form-snapshots| HTTP
    HTTP -->|Store| Matching

    UI -->|Load Snapshot| HTTP
    UI -->|Generate Fill Plan| Matching
    Matching -->|Tier 1: Autocomplete| Matching
    Matching -->|Tier 2: Pattern| Matching
    Matching -->|Tier 3: LLM| LLM

    LLM -->|Field Metadata| API
    API -->|Vault Key| LLM

    Matching -->|Fill Plan| UI
    UI -->|User Approves| UI
    UI -->|POST /v1/fill-commands| HTTP
    HTTP -->|Store Command| HTTP

    BG -->|Poll GET /v1/fill-commands| HTTP
    HTTP -->|FillCommand| BG
    BG -->|Send Message| CS
    CS -->|Fill Fields| Form

    Vault -->|Vault Items| Matching
    UI -->|CRUD| Vault

    style Form fill:#e1f5ff
    style API fill:#fff4e1
    style Matching fill:#ffe1f5
    style Vault fill:#e1ffe1
```

---

## Matching Engine Flow

```mermaid
flowchart TD
    Start([Form Snapshot Received])
    Start --> T1{Tier 1:<br/>Autocomplete?}

    T1 -->|Has autocomplete attribute| Match1[✓ High Confidence<br/>90-95%]
    T1 -->|No autocomplete| T2{Tier 2:<br/>Pattern?}

    T2 -->|type=email/tel<br/>OR name pattern| Match2[✓ Medium Confidence<br/>70-90%]
    T2 -->|No pattern match| T3{Tier 3:<br/>LLM?}

    T3 -->|API key configured| LLM[Call Claude API]
    T3 -->|No API key| Unmatched[✗ Unmatched]

    LLM --> Analyze{LLM Analysis}
    Analyze -->|Confident| Match3[✓ AI Confidence<br/>≤90%]
    Analyze -->|Uncertain| Unmatched

    Match1 --> FillPlan[Add to Fill Plan]
    Match2 --> FillPlan
    Match3 --> FillPlan
    Unmatched --> UnmatchedList[Unmatched List]

    FillPlan --> Review[User Reviews]
    UnmatchedList --> Review

    Review --> Apply{User Approves?}
    Apply -->|Yes| Send[Send Fill Command]
    Apply -->|No| End([End])
    Send --> End

    style Match1 fill:#d4edda
    style Match2 fill:#fff3cd
    style Match3 fill:#cfe2ff
    style Unmatched fill:#f8d7da
    style LLM fill:#e7f3ff
```

---

## Form Injection Sequence

```mermaid
sequenceDiagram
    participant User
    participant UI as Desktop UI
    participant HTTP as HTTP Bridge
    participant BG as Extension Background
    participant CS as Content Script
    participant Form as Web Form

    User->>UI: Click "Review & Apply"
    UI->>UI: Show Review Dialog
    User->>UI: Select fields & Approve

    UI->>HTTP: POST /v1/fill-commands
    Note over HTTP: Store FillCommand<br/>Expires in 5 min
    HTTP-->>UI: 200 OK
    UI->>User: "Fill command sent!"

    loop Every 1 minute (Chrome Alarms)
        BG->>HTTP: GET /v1/fill-commands?domain=example.com
        HTTP-->>BG: [FillCommand]

        alt Command found
            BG->>BG: Check domain match
            BG->>CS: Send message (FILL_COMMAND)
            CS->>CS: Verify domain
            CS->>Form: element.value = value
            CS->>Form: Dispatch events (input, change)
            CS-->>BG: {success: true, filledCount: 4}
            BG->>HTTP: DELETE /v1/fill-commands?id=xyz
            HTTP-->>BG: 200 OK
        end
    end

    Form->>User: ✓ Fields filled

    Note over User,Form: Total time: ~1-60 seconds<br/>(depending on poll cycle)
```

---

## Data Flow: Form Detection → Fill

```mermaid
flowchart LR
    subgraph Browser
        A[User visits form] --> B[DOM loaded]
        B --> C[Content Script<br/>observes forms]
        C --> D[Extract FormSnapshot]
        D --> E[Background sends<br/>to desktop]
    end

    subgraph Desktop
        E --> F[HTTP Bridge<br/>stores snapshot]
        F --> G[User opens<br/>Match tab]
        G --> H[Load snapshot<br/>from storage]
        H --> I[Generate Fill Plan]

        I --> J[Tier 1: Autocomplete]
        I --> K[Tier 2: Pattern]
        I --> L[Tier 3: LLM]

        J --> M[Merge results]
        K --> M
        L --> M

        M --> N[Display in UI]
        N --> O[User reviews]
        O --> P[User approves]
        P --> Q[Create FillCommand]
        Q --> R[POST to bridge]
    end

    subgraph Extension
        R --> S[Background polls]
        S --> T[Receive command]
        T --> U[Find matching tab]
        U --> V[Send to content script]
        V --> W[Fill form fields]
    end

    style A fill:#e1f5ff
    style I fill:#ffe1f5
    style L fill:#fff4e1
    style W fill:#d4edda
```

---

## Matching Tiers Comparison

```mermaid
graph TD
    subgraph "Tier 1: Autocomplete (95% confidence)"
        T1A[Input has autocomplete attribute]
        T1B[Map to vault category]
        T1C[Example: autocomplete='email' → email vault item]

        T1A --> T1B --> T1C
    end

    subgraph "Tier 2: Pattern (70-90% confidence)"
        T2A[Field type + name analysis]
        T2B[Regex patterns on labels]
        T2C[Example: type='email' + name contains 'email']

        T2A --> T2B --> T2C
    end

    subgraph "Tier 3: LLM (≤90% confidence)"
        T3A[Send field metadata to Claude]
        T3B[LLM semantic understanding]
        T3C[Example: 'Your Organization' → company]

        T3A --> T3B --> T3C
    end

    style T1A fill:#d4edda
    style T2A fill:#fff3cd
    style T3A fill:#cfe2ff
```

---

## Component Interaction Map

```mermaid
graph TB
    subgraph "Frontend (React)"
        VaultTab[Vault Tab]
        MatchTab[Match Tab]
        SettingsTab[Settings Tab]
        AuditTab[Audit Tab]
        ReviewDialog[Review Dialog]
    end

    subgraph "Tauri Commands (Rust)"
        VaultCmds[vault_*]
        SnapshotCmds[snapshot_*]
        LLMCmds[llm_*, set_api_key]
        AuditCmds[audit_*]
    end

    subgraph "Storage (Rust)"
        VaultStore[Vault Store<br/>in-memory]
        SnapshotStore[Snapshot Store<br/>Arc&lt;Mutex&gt;]
        ApiKeyStore[API Key Store<br/>Tauri State]
        AuditLog[Audit Log<br/>JSON file]
    end

    subgraph "External"
        HTTP[HTTP Bridge]
        ClaudeAPI[Claude API]
    end

    VaultTab --> VaultCmds
    VaultCmds --> VaultStore

    MatchTab --> SnapshotCmds
    MatchTab --> LLMCmds
    SnapshotCmds --> SnapshotStore
    LLMCmds --> ApiKeyStore
    LLMCmds --> ClaudeAPI

    SettingsTab --> LLMCmds

    AuditTab --> AuditCmds
    AuditCmds --> AuditLog

    ReviewDialog --> HTTP
    HTTP --> SnapshotStore

    style VaultStore fill:#e1ffe1
    style ApiKeyStore fill:#ffe1e1
    style ClaudeAPI fill:#fff4e1
```

---

## Security Boundaries

```mermaid
flowchart TB
    subgraph "Untrusted Zone"
        Browser[Web Browser<br/>Arbitrary websites]
    end

    subgraph "Extension Zone"
        Content[Content Script<br/>Isolated per-tab]
        Background[Background Script<br/>Shared state]
    end

    subgraph "Desktop Zone"
        HTTPBridge[HTTP Bridge<br/>localhost only]
        UI[Desktop UI<br/>User interaction]
        Vault[Vault<br/>User data]
        API[API Key<br/>Sensitive]
    end

    subgraph "External Zone"
        LLM[Claude API<br/>Metadata only]
    end

    Browser -->|Form structure| Content
    Content -->|Snapshot| Background
    Background -->|localhost POST| HTTPBridge

    HTTPBridge -.->|Read only| Vault
    UI -->|User approval| HTTPBridge

    UI -->|Field metadata<br/>NO VALUES| LLM
    LLM -->|Vault keys<br/>NO VALUES| UI

    Vault -.->|Values added<br/>after approval| HTTPBridge
    HTTPBridge -->|Fill command| Background
    Background -->|Fill| Content
    Content -->|DOM mutation| Browser

    style Browser fill:#f8d7da
    style Vault fill:#d4edda
    style API fill:#ffe1e1
    style LLM fill:#fff3cd
```

---

## Extension Lifecycle (MV3)

```mermaid
stateDiagram-v2
    [*] --> Installed: Install/Update

    Installed --> HealthCheck: onInstalled
    HealthCheck --> CreateAlarms: Create recurring alarms
    CreateAlarms --> CheckDesktop: Health alarm fires

    CheckDesktop --> DesktopAvailable: Desktop running
    CheckDesktop --> DesktopUnavailable: Desktop not running

    DesktopAvailable --> StartPolling: Create fill poll alarm
    DesktopUnavailable --> Retry: Wait 1 min
    Retry --> CheckDesktop

    StartPolling --> Polling: Every 1 min
    Polling --> PollFillCommands: Alarm fires

    PollFillCommands --> CheckCommands: GET /v1/fill-commands
    CheckCommands --> HasCommands: Commands found
    CheckCommands --> NoCommands: Empty

    HasCommands --> SendToTab: Find matching tab
    SendToTab --> FillForm: Content script fills
    FillForm --> AckCommand: DELETE command
    AckCommand --> Polling

    NoCommands --> Polling

    Polling --> ServiceWorkerSleep: Inactive 30s
    ServiceWorkerSleep --> WakeUp: Event or alarm
    WakeUp --> CheckAlarms: Alarms exist?
    CheckAlarms --> Polling: Yes
    CheckAlarms --> CreateAlarms: No (re-create)

    note right of CreateAlarms
        Chrome Alarms API
        persists across
        service worker restarts
    end note
```

---

## Caching Strategy (Future)

```mermaid
flowchart TD
    Form[Form Detected] --> Fingerprint{Generate<br/>Fingerprint}

    Fingerprint --> Hash[Hash:<br/>domain + field names + labels]
    Hash --> Cache{Check<br/>Cache}

    Cache -->|Hit| CachedPlan[Use Cached<br/>Fill Plan]
    Cache -->|Miss| Generate[Generate<br/>New Plan]

    Generate --> T1[Tier 1]
    Generate --> T2[Tier 2]
    Generate --> T3[Tier 3 LLM]

    T1 --> Merge[Merge Results]
    T2 --> Merge
    T3 --> Merge

    Merge --> Store[Store in Cache<br/>TTL: 30 days]
    Store --> Return[Return Plan]

    CachedPlan --> Validate{Validate<br/>Fields Exist}
    Validate -->|Valid| Return
    Validate -->|Invalid| Generate

    Return --> UI[Display in UI]

    style CachedPlan fill:#d4edda
    style T3 fill:#fff4e1
    style Store fill:#cfe2ff
```

---

## Error Handling Flow

```mermaid
flowchart TD
    Start([User Action]) --> Operation{Operation Type}

    Operation -->|LLM Analysis| LLM[Call Claude API]
    Operation -->|Form Fill| Fill[Send Fill Command]
    Operation -->|Vault Operation| Vault[Vault CRUD]

    LLM --> LLMCheck{Success?}
    LLMCheck -->|Yes| LLMSuccess[Show Results]
    LLMCheck -->|No API Key| NoKey[Show: Configure API key]
    LLMCheck -->|Network Error| Retry{Retry?}
    LLMCheck -->|API Error| ShowError[Show Error Message]

    Retry -->|< 3 attempts| LLM
    Retry -->|>= 3 attempts| Fallback[Fallback to<br/>Pattern Only]

    Fill --> FillCheck{Success?}
    FillCheck -->|Yes| FillSuccess[Show Success]
    FillCheck -->|Desktop Offline| Offline[Show: Start desktop app]
    FillCheck -->|No Matching Tab| NoTab[Show: Open form page]

    Vault --> VaultCheck{Success?}
    VaultCheck -->|Yes| VaultSuccess[Update UI]
    VaultCheck -->|Validation Error| Invalid[Show: Fix input]

    LLMSuccess --> End([End])
    NoKey --> End
    ShowError --> End
    Fallback --> End
    FillSuccess --> End
    Offline --> End
    NoTab --> End
    VaultSuccess --> End
    Invalid --> End

    style LLMSuccess fill:#d4edda
    style FillSuccess fill:#d4edda
    style VaultSuccess fill:#d4edda
    style NoKey fill:#fff3cd
    style ShowError fill:#f8d7da
```

---

## Usage

These diagrams are written in Mermaid.js syntax and can be rendered in:

1. **GitHub Markdown** - Automatic rendering
2. **VS Code** - With Mermaid extension
3. **Mermaid Live Editor** - https://mermaid.live/
4. **Documentation sites** - Most static site generators support Mermaid

To export as PNG/SVG:
- Use Mermaid CLI: `mmdc -i input.md -o output.png`
- Or copy into Mermaid Live Editor and export
