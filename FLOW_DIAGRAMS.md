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

## 2. Main App Content Discovery Flow with Wayfinder

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
    
    G --> J[Display content via Wayfinder]
    I --> K[Get first transaction]
    K --> J
    
    J --> L[Wayfinder Content Resolution]
    L --> M{Wayfinder available?}
    M -->|Yes| N[Request via ar:// protocol]
    M -->|No| O[Fallback to original gateway]
    
    N --> P[Wayfinder verification]
    P --> Q{Verification enabled?}
    Q -->|Yes| R[Hash verification]
    Q -->|No| S[Direct routing]
    
    R --> T{Verification result?}
    T -->|Success| U[Verified content]
    T -->|Failed| V[Unverified content]
    S --> V
    O --> V
    
    U --> W[User interaction]
    V --> W
    W --> X{Action type?}
    X -->|Next| Y[getNextTx from queue]
    X -->|Channels| Z[Open channels drawer]
    X -->|History| AA[Navigate through history]
    
    Y --> BB{Queue empty?}
    BB -->|Yes| CC[Refill queue in background]
    BB -->|No| DD[Return next tx]
    CC --> DD
    DD --> L
    
    Z --> EE[Select new channel/date]
    EE --> FF[ChronoBlock Navigator]
    FF --> I
    
    AA --> GG[Load from IndexedDB history]
    GG --> L
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

## 7. Wayfinder Integration and Verification Flow (v0.2.0)

```mermaid
flowchart TD
    A[Content Request with size/type] --> B{Size threshold check}
    B -->|Too large| C[Return URL-only response]
    B -->|Auto-load| D{Check content cache}
    
    C --> E[Show manual load button]
    E --> F{User clicks?}
    F -->|Yes| G[Force load = true]
    F -->|No| H[Skip loading]
    G --> D
    
    D -->|Cache hit| I[Return cached content + current status]
    D -->|Cache miss| J[Register event listener]
    
    J --> K[Initialize Wayfinder]
    K --> L{Wayfinder enabled?}
    L -->|No| M[Use fallback gateway]
    L -->|Yes| N[Create ar:// URL]
    
    N --> O[Set status: verifying]
    O --> P[Emit verification-started]
    P --> Q[Wayfinder.request()]
    
    Q --> R[Dynamic Gateway Selection]
    R --> S[NetworkGatewaysProvider]
    S --> T[AR.IO mainnet with stake sorting]
    
    T --> U[Route to selected gateway]
    U --> V{Verification enabled?}
    
    V -->|No| W[Return gateway URL + content]
    V -->|Yes| X[Start hash verification]
    
    X --> Y[Trusted gateways: permagate.io, vilenarios.com]
    Y --> Z[Compare x-ar-io-digest headers]
    Z --> AA{Hashes match?}
    
    AA -->|Yes| BB[Mark as verified]
    AA -->|No| CC[Mark as failed]
    
    BB --> DD[Emit verification-completed]
    CC --> EE[Emit verification-failed]
    
    DD --> FF[Update cached content status]
    EE --> FF
    FF --> GG[Notify event listeners]
    GG --> HH[UI updates verification indicator]
    
    W --> II[Cache content with status]
    II --> JJ[Return to app]
    
    M --> KK[Direct gateway request]
    KK --> LL[Set status: not-verified]
    LL --> JJ
    
    H --> MM[Content not loaded]
```

## 8. useWayfinderContent Hook - Race Condition Fix (v0.2.0)

```mermaid
flowchart TD
    A[useWayfinderContent called] --> B[txId provided?]
    B -->|No| C[Return empty state]
    B -->|Yes| D[Register event listener FIRST]
    
    D --> E[Start content fetch]
    E --> F[Call wayfinderService.getContentUrl()]
    F --> G[Wayfinder processes content]
    
    G --> H[Content processing completes]
    H --> I[Verification events fire]
    I --> J[Event listener catches events]
    J --> K[Update React state]
    
    K --> L[Get current verification status]
    L --> M[Return state with current status]
    
    M --> N{Status still verifying?}
    N -->|Yes| O[Set 2-second fallback timer]
    N -->|No| P[Complete]
    
    O --> Q[Check status after delay]
    Q --> R{Status now verified?}
    R -->|Yes| S[Update state with verified]
    R -->|No| T[Continue as unverified]
    
    S --> P
    T --> P
    
    C --> U[Early return]
    P --> V[Hook returns result]
    U --> V
```

## 9. Size-Aware Loading Thresholds (v0.2.0)

```mermaid
flowchart TD
    A[Content request with metadata] --> B{Content type?}
    
    B -->|image/*| C{Size > 25MB?}
    B -->|video/*| D{Size > 200MB?}
    B -->|audio/*| E{Size > 50MB?}
    B -->|text/*| F{Size > 10MB?}
    B -->|other| G[Auto-load]
    
    C -->|Yes| H[Manual load button]
    C -->|No| I[Auto-load via Wayfinder]
    
    D -->|Yes| H
    D -->|No| I
    
    E -->|Yes| H
    E -->|No| I
    
    F -->|Yes| H
    F -->|No| I
    
    H --> J{User clicks load?}
    J -->|Yes| K[Force load = true]
    J -->|No| L[Content not loaded]
    
    K --> I
    I --> M[Wayfinder verification]
    M --> N[Verified content served]
    
    G --> O[Direct load without Wayfinder]
    L --> P[Show file size info]
```

## 10. Preloading System with Wayfinder

```mermaid
flowchart TD
    A[Current content displayed] --> B[1-second delay]
    B --> C[peekNextTransactions(2)]
    C --> D[For each next transaction]
    
    D --> E{Content type?}
    E -->|Image (not GIF)| F[Preload via Wayfinder]
    E -->|Text/JSON| G[HEAD request via Wayfinder]
    E -->|Video/Audio| H[Skip preload]
    
    F --> I[Try Wayfinder first]
    G --> I
    I --> J{Wayfinder success?}
    
    J -->|Yes| K[Cache Wayfinder URL]
    J -->|No| L[Fallback to original gateway]
    
    K --> M[Add to preload cache]
    L --> N[Cache fallback URL]
    N --> M
    H --> O[Continue to next]
    
    M --> P{Cache size > 50?}
    P -->|Yes| Q[LRU cleanup - remove 25 oldest]
    P -->|No| R[Preload complete]
    Q --> R
    O --> R
```

## Key Design Principles (Updated for v0.2.0)

1. **Verified Content Delivery**: AR.IO Wayfinder integration with hash-based verification via trusted gateways
2. **Bandwidth Consciousness**: Size-aware loading with manual thresholds (25MB images, 200MB videos, 50MB audio, 10MB text)  
3. **Race Condition Prevention**: Event listeners registered before requests to catch all verification events
4. **Intelligent Caching**: TTL and LRU-based content caching with verification status synchronization
5. **Graceful Degradation**: Every operation has fallbacks (Wayfinder → original gateway → error)
6. **Performance First**: Throttled cache cleanup, single content fetches, memory-efficient Object URL management
7. **User Experience**: Transparent verification with subtle indicators that don't disrupt content flow
8. **Resilience**: 404-resistant design that skips bad content automatically
9. **State Preservation**: Deep linking and URL state for sharing/bookmarking
10. **Dynamic Gateway Routing**: AR.IO network integration with stake-based gateway selection
11. **Security**: Dual trusted gateway verification (permagate.io, vilenarios.com) for enhanced content integrity