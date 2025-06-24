# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Commands

- `npm run dev` - Start local development server with Vite
- `npm run build` - TypeScript compilation + production build (outputs to /dist)
- `npm run preview` - Preview production build locally

### Testing Commands

- `npm test` - Run tests in watch mode
- `npm run test:run` - Run tests once
- `npm run test:coverage` - Run tests with coverage report
- `npm run test:ui` - Open Vitest UI for interactive testing

### Build Requirements

- Build succeeds when `tsc -b && vite build` completes without errors
- Deploy the static /dist folder to Arweave via ArDrive, ArLink, Permaweb Deploy, etc.

## Architecture Overview

### Core Application Structure

**Roam v0.2.0** is a Preact-based PWA for discovering random Arweave content with **AR.IO Wayfinder integration** for verified content delivery. The app uses a shuffle-play interface where users tap "Next" to explore transactions filtered by content type (images, videos, music, websites, text, ArFS files, or everything). Version 0.2.0 introduces **content verification**, **intelligent caching**, **size-aware loading**, and **bandwidth-conscious design** while maintaining the Apple-inspired UI/UX from previous releases.

### Key Architectural Patterns

**Engine Layer** (`/src/engine/`):

- `query.ts` - GraphQL API calls to Goldsky endpoints for transaction discovery
- `fetchQueue.ts` - Sliding window-based transaction queue with background refill mechanism
- `history.ts` - IndexedDB-persisted navigation history using idb-keyval

**Content Discovery Algorithm**:
The app uses a sophisticated windowing system to efficiently explore Arweave's 1.6M+ blocks:

- "New" content: Slides from recent blocks downward (most recent first)
- "Old" content: Random windows in blocks 100K-1.6M range
- Window size: 10K blocks per fetch for optimal GraphQL performance
- Auto-refills queue when <3 items remain to prevent loading delays

**Deep Linking System**:
URL parameters drive content initialization:

- `txid` - Direct transaction link
- `ownerAddress` - Filter by Arweave address
- `appName` - Filter by App-Name tag
- `minBlock`/`maxBlock` - Custom block range
- `channel` - Media type filter

**AR.IO Wayfinder Integration (v0.2.0 - Experimental)**:

- `wayfinder.ts` - AR.IO SDK integration with dynamic gateway routing (disabled by default)
- `useWayfinderContent.ts` - Content fetching hook with verification event handling
- `VerificationIndicator.tsx` - Real-time verification status display
- Content verification via trusted gateways (permagate.io, vilenarios.com)
- Intelligent caching with TTL and LRU cleanup mechanisms
- Size-aware loading to respect bandwidth thresholds
- Race condition-free verification event propagation
- Requires `VITE_ENABLE_WAYFINDER=true` to activate

**State Management**:

- Custom hook pattern for modular state management
- Main app state via `useAppState` hook
- Navigation logic in `useNavigation` hook
- Deep linking via `useDeepLink` hook
- Date filtering via `useDateRangeSlider` hook
- **NEW**: Wayfinder content state via `useWayfinderContent` hook
- Local history persisted via IndexedDB
- URL parsing drives initial state

### Component Architecture

**Core Components** (`/src/components/`):

- `MediaView.tsx` - Universal content renderer with **Wayfinder integration**, size-aware loading, and verified content display
- `DetailsDrawer.tsx` - Apple-inspired transaction metadata panel
- `DateRangeSlider.tsx` - Advanced date-based filtering with block conversion
- `TransactionInfo.tsx` - Compact metadata footer with **verification indicator**
- `VerificationIndicator.tsx` - **NEW**: Real-time content verification status display
- `ZoomOverlay.tsx` - Full-screen media viewer
- `Interstitial.tsx` - Advertisement overlay
- `AppHeader.tsx` - Application header with branding
- `AppControls.tsx` - Navigation controls with Apple-inspired buttons
- `AppFooter.tsx` - Fixed footer with app information
- `ChannelsDrawer.tsx` - Content type and date filtering drawer
- `AboutModal.tsx` - Application information modal
- `ConsentModal.tsx` - NSFW content consent dialog

**UI/UX Design System (v0.1.0)**:

- **Apple-inspired design language** with glass morphism effects
- **Dark theme** with orange/red gradient accents (#FF6A00 to #FF00CC)
- **Floating action menus** for media controls (share, download, open, details)
- **Smooth transitions** and loading states throughout
- **Content-aware sizing** - different heights for images vs text/websites
- **Mobile-first responsive design** with touch-friendly interactions

**Styling System**:

- UnoCSS for utility-first CSS
- Component-specific CSS files in `/src/styles/` with Apple-inspired aesthetics
- CSS Grid and Flexbox for responsive layouts
- PWA-ready with vite-plugin-pwa
- **NEW**: Content-type specific CSS classes for dynamic media sizing

### Advanced Date Filtering System (v0.1.0)

**Date-to-Block Conversion** (`/src/utils/dateBlockUtils.ts`):

- **Binary search algorithm** for precise date-to-block mapping
- **GraphQL integration** for efficient block timestamp queries
- **Intelligent caching** to avoid redundant API calls
- **Estimation fallbacks** for improved performance
- **Range validation** against Arweave blockchain history

**DateRangeSlider Features**:

- Visual calendar date selection
- Real-time block height conversion and display
- Validation against Arweave timeline (Genesis: June 2018)
- Error handling for invalid ranges and network failures
- Integration with main content discovery queue

**Performance Optimizations**:

- Cached binary search results for frequently accessed dates
- Range queries for better GraphQL efficiency
- Graceful degradation when exact search fails
- Background estimation for responsive UI updates

### Content Type System

**Media Types** (defined in `constants.ts`):

- `images` - PNG, JPEG, WebP, GIF
- `videos` - MP4, WebM
- `music` - MP3, WAV with enhanced audio player and wave visualization
- `websites` - HTML, Arweave manifests
- `text` - Markdown, PDF with improved readability
- `arfs` - ArFS file metadata (requires Entity-Type: file)
- `everything` - Union of all above types

**Enhanced Media Handling (v0.1.0)**:

- **Smart loading thresholds** - manual load buttons for large files
- **Content-specific sizing** - images use max-height, text/websites use fixed containers
- **Progressive enhancement** based on file size and type
- **ArFS metadata resolution** with automatic file type detection
- **Improved text rendering** with white backgrounds for readability
- **Enhanced audio player** with visual wave animation

**ArFS Special Handling**:
ArFS media type fetches JSON metadata first, then extracts `dataTxId` for actual file content.

### Configuration

**Environment Variables**:

- `VITE_GATEWAYS_GRAPHQL` - Comma-separated GraphQL endpoints (required)
- `VITE_GATEWAYS_DATA_SOURCE` - Content delivery gateways

**Wayfinder Configuration** (All disabled by default):

**In-App Configuration UI**: All Wayfinder settings can be configured directly in the Channels drawer with:

- **Real-time validation** - Instant feedback for invalid gateway URLs
- **Connection monitoring** - Live status indicators for Wayfinder connectivity
- **Auto-dependency logic** - Smart enabling/disabling of related features
- **Visual error feedback** - Red borders and inline messages for validation errors
- **One-click reset** - Restore all settings to safe defaults

**Environment Variables** (optional - can be overridden by UI):

- `VITE_ENABLE_WAYFINDER` - Legacy master switch for Wayfinder integration
- `VITE_WAYFINDER_ENABLE_ROUTING` - Smart gateway selection via AR.IO network
- `VITE_WAYFINDER_ENABLE_VERIFICATION` - Content verification via cryptographic hashes
- `VITE_WAYFINDER_GATEWAY_PROVIDER` - Provider type: network, static, simple-cache
- `VITE_WAYFINDER_GATEWAY_LIMIT` - Maximum gateways for routing (default: 5)
- `VITE_WAYFINDER_STATIC_GATEWAYS` - Custom gateway list for static provider
- `VITE_WAYFINDER_CACHE_TIMEOUT` - Gateway cache TTL in minutes (default: 1)
- `VITE_WAYFINDER_VERIFICATION_STRATEGY` - Verification method: hash, none
- `VITE_WAYFINDER_TRUSTED_GATEWAYS` - Gateways for hash verification
- `VITE_WAYFINDER_VERIFICATION_TIMEOUT` - Verification timeout in milliseconds

**Gateway Configuration**:
App supports "self" gateway mapping that derives data gateway from current hostname (e.g., `roam_user.ardrive.net` → `ardrive.net`).

### Key Technical Constraints

**Performance Considerations**:

- Content auto-skips on 404/corruption (404-resistant design)
- No autoplay for bandwidth conservation
- Background queue refilling prevents loading delays
- Smart loading thresholds for large files
- **NEW**: Content-type aware rendering optimizations

**Arweave Integration**:

- Uses public GraphQL APIs (no private keys required)
- All content fetched client-side
- Permanent hosting on Arweave blockchain
- AR.IO gateway integration for fast delivery
- **NEW**: Enhanced GraphQL queries for date/block operations

**Mobile-First Design**:

- Touch-friendly navigation with Apple-inspired controls
- PWA installable on mobile devices
- Works offline after installation
- Thumb-friendly single-tap exploration
- **NEW**: Floating action menus optimized for mobile usage

### v0.1.3 Feature Additions

**Session Statistics System** (`/src/hooks/useSessionStats.ts`, `/src/components/SessionStats.tsx`):

- Real-time session tracking with comprehensive metrics
- **localStorage persistence** - stats survive page refreshes and browser restarts
- Content viewed count, unique creators, content type distribution
- Session duration, data transfer estimates, content diversity percentage
- Oldest/newest content tracking with block heights and dates
- Beautiful Apple-inspired statistics modal with responsive design
- Keyboard shortcut `T` for quick access, floating action button
- **Proper reset functionality** - completely clears stats and localStorage on reset

**Keyboard Shortcuts System** (`/src/hooks/useKeyboardShortcuts.ts`):

- Complete keyboard navigation for accessibility and power users
- Navigation: `Space/Enter/→` (next), `Backspace/←` (previous)
- Actions: `S` (share), `D` (download), `C` (channels), `P` (privacy), `T` (statistics)
- General: `Escape` (close overlays), `?` (help)
- Smart input detection to prevent conflicts with form fields
- Comprehensive help display in console

**Content Preloading System** (`/src/hooks/usePreloading.ts`):

- Intelligent background preloading for smooth browsing experience
- Preloads next 2 transactions using `peekNextTransactions` from fetch queue
- Content-type aware: preloads images and text, skips heavy media for bandwidth
- LRU cache management with automatic cleanup (max 50 items)
- 1-second delay to avoid interfering with current content loading
- Reduces perceived loading times significantly

**Reset Confirmation Modal** (`/src/components/ResetConfirmModal.tsx`):

- Safety confirmation before clearing session data and history
- Apple-inspired modal design with clear visual communication
- Shows exactly what gets reset: statistics, history, seen content
- Prevents accidental data loss from reset button
- Integrated with main reset flow and keyboard shortcuts (Escape)
- Mobile-optimized responsive design

**Media Transition Improvements**:

- Fixed jarring content flashing during navigation
- Key-based rendering system for smooth transitions
- Enhanced CSS animations with proper opacity and transform transitions
- Better visual continuity between different content types

### Testing Infrastructure

**Testing Framework**: Vitest with jsdom environment for comprehensive testing

**Test Structure**:

- Unit tests for engine functions (`/src/engine/*.test.ts`)
- Utility function tests (`/src/utils/*.test.ts`)
- Test utilities and mocks in `/src/test/utils.ts`
- Global test setup in `/src/test/setup.ts`

**Engine Test Coverage**:

- `query.test.ts`: GraphQL operations, block height fetching, error handling
- `history.test.ts`: IndexedDB navigation history, state management
- `fetchQueue.test.ts`: Transaction queue initialization, filtering, configuration
- **NEW**: `dateBlockUtils.test.ts`: Date/block conversion, binary search, caching

**Testing Patterns**:

- Mock external dependencies (fetch, localStorage, idb-keyval, window.location)
- Use realistic transaction data for consistent testing
- Focus on business logic rather than UI components
- Comprehensive error handling and edge case coverage
- **NEW**: Binary search algorithm testing with various edge cases

**Current Test Results**: All tests pass, ensuring robust core functionality.

### v0.1.0 Release Highlights

**Major Features Added**:

- **Advanced date-based filtering** with visual date range selection
- **Apple-inspired UI redesign** with glass morphism and smooth transitions
- **Floating action menus** for better space utilization and mobile UX
- **Enhanced media rendering** with content-type specific optimizations
- **Smart loading system** with file size-based thresholds
- **Improved audio player** with visual wave animations
- **Better text readability** with white backgrounds and proper typography

**Technical Improvements**:

- **Comprehensive code documentation** with detailed comments
- **Production-ready logging** with debug statements removed
- **Enhanced error handling** throughout the application
- **Performance optimizations** for media rendering and date conversion
- **Mobile-optimized touch interactions** and responsive design

**User Experience Enhancements**:

- **Smooth content transitions** without glitchy animations
- **Content-aware sizing** prevents scrolling issues
- **Progressive loading** for large files with bandwidth consideration
- **Clear visual feedback** for loading states and user actions
- **Accessible design patterns** following modern web standards

### v0.2.0 Release Highlights - AR.IO Wayfinder Integration

**Major Features Added**:

- **AR.IO Wayfinder Integration** - Complete integration with AR.IO SDK for verified content delivery
- **Content Verification System** - Hash-based verification via trusted gateways (permagate.io, vilenarios.com)
- **Intelligent Content Caching** - TTL and LRU-based caching with verification status sync
- **Size-Aware Loading** - Bandwidth-conscious loading with content-type specific thresholds
- **Real-Time Verification UI** - Dynamic verification indicator showing content integrity status
- **Dynamic Gateway Routing** - AR.IO network integration with stake-based gateway selection

**Technical Architecture**:

- **Wayfinder Service** (`/src/services/wayfinder.ts`) - Centralized AR.IO SDK integration
- **Content Hook** (`/src/hooks/useWayfinderContent.ts`) - React hook for verified content fetching
- **Verification Component** (`/src/components/VerificationIndicator.tsx`) - Real-time verification status
- **Event-Driven Updates** - Race condition-free verification event propagation
- **Fallback Mechanisms** - Graceful degradation to direct gateways when Wayfinder unavailable

**Performance Optimizations**:

- **Throttled Cache Cleanup** - Efficient cache management with 5-minute cleanup intervals
- **Single Content Fetch** - No double-fetching or redundant verification calls
- **Memory Management** - Proper Object URL lifecycle and cleanup prevention
- **Content Type Optimization** - Single lookup with efficient fallback chains
- **Pre-Registration Event Handling** - Eliminates verification race conditions

**Security & Verification**:

- **Dual Trusted Gateways** - Multiple verification sources for enhanced security
- **Hash-Based Verification** - Content integrity validation via AR.IO network
- **Secure Content Delivery** - Verified blobs served through managed Object URLs
- **No Re-fetching** - Single verified fetch per content item ensures authenticity

**User Experience**:

- **Transparent Verification** - Subtle loading indicators that don't disrupt content flow
- **Bandwidth Respect** - Large files show manual load buttons before Wayfinder calls
- **Verification Feedback** - Clear visual indicators (green checkmark, loading spinner, error states)
- **Cached Content Performance** - Instant loading for previously verified content
- **Seamless Fallback** - Invisible fallback to direct gateways maintains user experience

**Size-Aware Loading Thresholds**:

- **Images**: Auto-load up to 25MB, manual load button for larger files
- **Videos**: Auto-load up to 200MB, manual load button for larger files
- **Audio**: Auto-load up to 50MB, manual load button for larger files
- **Text**: Auto-load up to 10MB, manual load button for larger files
- **Forced Loading**: Manual load buttons trigger verified Wayfinder fetch

**Development Guidelines for Wayfinder**:

- **Event Listener Registration**: Always register before making Wayfinder requests
- **Verification Status Sync**: Use current status from service, not cached responses
- **Content Type Handling**: Support all media types with proper Blob processing
- **Error Handling**: Implement graceful fallbacks for network and verification failures
- **Memory Management**: Properly cleanup Object URLs and event listeners

### v0.2.1 Release Highlights - Simplified Wayfinder Settings

**Major Features**:

- **Wayfinder Enabled by Default** - AR.IO integration now active out-of-the-box for better content delivery
- **Simplified Routing Modes** - Three user-friendly options: Balanced, Fast, and Fair Share
- **Verified Browsing Toggle** - Optional cryptographic content verification for enhanced security
- **Improved Settings UI** - Clean, mobile-first design with intuitive controls
- **Dynamic Gateway Selection** - Uses top 5 gateways sorted by totalDelegatedStake for reliability

**Routing Modes Explained**:

- **Balanced (Default)** - Random selection from top 20 staked gateways for optimal load distribution
- **Fast** - Routes to gateway with fastest ping response for best performance
- **Fair Share** - Round-robin rotation through top 20 gateways for equal distribution

**Technical Improvements**:

- **Cache-Aware Navigation** - Instant back/forward navigation using cached content
- **Simplified Configuration** - Removed complex settings in favor of user-friendly options
- **Smart Defaults** - Pre-configured for optimal performance and network health
- **Code Cleanup** - Removed unused components (BlockRangeSlider, useRangeSlider)
- **Type Safety** - Fixed TypeScript issues with NodeJS.Timeout references

**Configuration Changes**:

- Wayfinder now uses `totalDelegatedStake` instead of `operatorStake` for gateway sorting
- Verification uses top 5 staked gateways dynamically instead of hardcoded trusted gateways
- Simplified settings hook (`useSimplifiedWayfinderSettings`) replaces complex configuration
- All settings can be changed in-app with visual feedback and validation

**User Experience**:

- **No Configuration Required** - Works optimally out of the box
- **Clear Option Descriptions** - Each setting clearly explains its purpose
- **Mobile-Optimized UI** - Settings designed for touch interfaces
- **Instant Feedback** - Real-time connection status and validation
- **Persistent Settings** - User preferences saved across sessions

### Development Guidelines

**Code Style**:

- Use comprehensive JSDoc comments for complex functions
- Remove debug console.log statements before production
- Follow Apple-inspired design principles for new UI components
- Implement proper error handling and loading states
- Test date/block conversion functions thoroughly

**Performance**:

- Use content-type specific CSS classes for optimal rendering
- Implement smart loading thresholds for different media types
- Cache date/block conversion results to avoid redundant API calls
- Use GraphQL efficiently with proper pagination and filtering

**Mobile Optimization**:

- Design with touch-first interactions
- Use floating menus to save vertical space
- Implement proper responsive breakpoints
- Test on various mobile devices and screen sizes
