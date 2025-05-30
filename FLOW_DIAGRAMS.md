# Roam App Flow Diagrams

## 1. ChronoBlock Navigator - Date to Block Resolution

```mermaid
flowchart TD
    A[User selects date range] --> B{Dates changed?}
    B -->|No| C[Reuse actualBlocks]
    B -->|Yes| D[getBlockRangeForDateRange]
    C --> M[Apply to fetchQueue]
    
    D --> E{Check date cache}
    E -->|Hit| F[Return cached blocks]
    E -->|Miss| G[Binary search needed]
    
    F --> M
    G --> H[Estimate initial position]
    H --> I[Binary search with tolerance]
    I --> J{Within 6hrs or 500 blocks?}
    J -->|Yes| K[Accept result]
    J -->|No| L{Max iterations?}
    L -->|Yes| K
    L -->|No| I
    
    K --> N[Cache result]
    N --> M
    M --> O[Load transactions]
```

## 2. Main App Content Discovery Flow

```mermaid
flowchart TD
    A[App starts] --> B[Parse URL params]
    B --> C{Deep link?}
    C -->|Yes| D[Load specific txid]
    C -->|No| E[Default: last 30 days]
    
    D --> F[Fetch transaction metadata]
    F --> G[Initialize with specific tx]
    
    E --> H[Estimate recent block range]
    H --> I[Initialize fetchQueue]
    
    G --> J[Display content]
    I --> K[Get first transaction]
    K --> J
    
    J --> L[User interaction]
    L --> M{Action type?}
    M -->|Next| N[getNextTx from queue]
    M -->|Channels| O[Open channels drawer]
    M -->|History| P[Navigate through history]
    
    N --> Q{Queue empty?}
    Q -->|Yes| R[Refill queue in background]
    Q -->|No| S[Return next tx]
    R --> S
    S --> J
    
    O --> T[Select new channel/date]
    T --> U[ChronoBlock Navigator]
    U --> I
    
    P --> V[Load from IndexedDB history]
    V --> J
```

## 3. Channel Selection and Filtering Flow

```mermaid
flowchart TD
    A[User opens channels drawer] --> B[Sync current state]
    B --> C[getDateRangeForBlockRange]
    C --> D[Display current dates]
    
    D --> E[User selects options]
    E --> F{What changed?}
    
    F -->|Media type| G[Update channel.media]
    F -->|Date range| H[Update tempRange]
    F -->|Owner/App filter| I[Set filters]
    
    G --> J[Apply changes]
    H --> K[ChronoBlock Navigator]
    I --> J
    K --> J
    
    J --> L[Clear seen IDs]
    L --> M[Initialize new fetchQueue]
    M --> N[Get first new transaction]
    N --> O[Close drawer]
    O --> P[Display new content]
```

## 4. FetchQueue Background Refill Strategy

```mermaid
flowchart TD
    A[Queue initialized] --> B[Set sliding window]
    B --> C[Attempt GraphQL fetch]
    C --> D{Results found?}
    D -->|Yes| E[Add to queue]
    D -->|No| F{More attempts left?}
    
    E --> G[Queue ready]
    
    F -->|Yes| H[Adjust window]
    H --> I{Recency mode?}
    I -->|New| J[Slide window back]
    I -->|Old| K[Random window]
    I -->|Range| L[Stay in custom range]
    
    J --> C
    K --> C
    L --> C
    
    F -->|No| M[Queue empty]
    M --> N[Use estimation fallback]
    N --> G
    
    G --> O[User requests next]
    O --> P{Queue < 3 items?}
    P -->|Yes| Q[Background refill]
    P -->|No| R[Return item]
    
    Q --> B
    R --> S[Continue browsing]
```

## 5. Error Handling and Fallback Chain

```mermaid
flowchart TD
    A[User action] --> B[Primary operation]
    B --> C{Success?}
    C -->|Yes| D[Continue normally]
    C -->|No| E{Network error?}
    
    E -->|Yes| F[Try cache]
    E -->|No| G[Try estimation]
    
    F --> H{Cache hit?}
    H -->|Yes| I[Use cached data]
    H -->|No| G
    
    G --> J{Estimation success?}
    J -->|Yes| K[Use estimation]
    J -->|No| L[Show error to user]
    
    I --> M[Mark as cached]
    K --> N[Mark as estimated]
    M --> D
    N --> D
    
    L --> O[Provide fallback options]
    O --> P[User chooses alternative]
    P --> A
```

## 6. Deep Link and URL State Management

```mermaid
flowchart TD
    A[URL parsed] --> B{Has txid?}
    B -->|Yes| C[Fetch specific transaction]
    B -->|No| D{Has filters?}
    
    C --> E[Set as current transaction]
    E --> F[Initialize queue around tx]
    
    D -->|Yes| G[Parse URL parameters]
    D -->|No| H[Use defaults]
    
    G --> I{Block range specified?}
    I -->|Yes| J[Use custom range]
    I -->|No| K[Convert dates to blocks]
    
    H --> L[Last 30 days range]
    
    J --> M[Initialize with range]
    K --> N[ChronoBlock Navigator]
    L --> N
    
    N --> M
    M --> O[Update URL state]
    O --> P[Start content discovery]
    
    F --> Q[Update URL with tx context]
    Q --> P
    
    P --> R[User navigates]
    R --> S[Update URL]
    S --> T{Share/bookmark?}
    T -->|Yes| U[Preserve deep link state]
    T -->|No| V[Continue browsing]
```

## Key Design Principles

1. **Graceful Degradation**: Every operation has fallbacks (cache → estimation → error)
2. **Performance First**: Aggressive caching and background operations
3. **User Experience**: Instant feedback with estimation, accurate results with binary search
4. **Resilience**: 404-resistant design that skips bad content automatically
5. **State Preservation**: Deep linking and URL state for sharing/bookmarking