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
**Roam** is a Preact-based PWA for discovering random Arweave content. The app uses a shuffle-play interface where users tap "Next" to explore transactions filtered by content type (images, videos, music, websites, text, ArFS files, or everything).

### Key Architectural Patterns

**Engine Layer** (`/src/engine/`):
- `query.ts` - GraphQL API calls to Goldsky endpoints for transaction discovery
- `fetchQueue.ts` - Sliding window-based transaction queue with background refill mechanism  
- `history.ts` - IndexedDB-persisted navigation history using idb-keyval

**Content Discovery Algorithm**:
The app uses a sophisticated windowing system to efficiently explore Arweave's 1.6M+ blocks:
- "New" content: Slides from recent blocks downward (most recent first)
- "Old" content: Random windows in blocks 100K-1.6M range
- Window size: 10K blocks per fetch
- Auto-refills queue when <3 items remain

**Deep Linking System**:
URL parameters drive content initialization:
- `txid` - Direct transaction link
- `ownerAddress` - Filter by Arweave address
- `appName` - Filter by App-Name tag  
- `minBlock`/`maxBlock` - Custom block range
- `channel` - Media type filter

**State Management**:
- Main app state in App.tsx (monolithic but functional)
- Local history persisted via IndexedDB
- URL parsing drives initial state
- Zustand imported but underutilized

### Component Architecture

**Core Components** (`/src/components/`):
- `MediaView.tsx` - Main content renderer with type-specific handling
- `DetailsDrawer.tsx` - Transaction metadata panel  
- `BlockRangeSlider.tsx` - Custom block range selector
- `ZoomOverlay.tsx` - Full-screen media viewer
- `Interstitial.tsx` - Advertisement overlay

**Styling System**:
- UnoCSS for utility-first CSS
- Component-specific CSS files in `/src/styles/`
- PWA-ready with vite-plugin-pwa

### Content Type System

**Media Types** (defined in `constants.ts`):
- `images` - PNG, JPEG, WebP, GIF
- `videos` - MP4, WebM  
- `music` - MP3, WAV
- `websites` - HTML, Arweave manifests
- `text` - Markdown, PDF
- `arfs` - ArFS file metadata (requires Entity-Type: file)
- `everything` - Union of all above types

**ArFS Special Handling**:
ArFS media type fetches JSON metadata first, then extracts `dataTxId` for actual file content.

### Configuration

**Environment Variables**:
- `VITE_GATEWAYS_GRAPHQL` - Comma-separated GraphQL endpoints (required)
- `VITE_GATEWAYS_DATA_SOURCE` - Content delivery gateways

**Gateway Configuration**:
App supports "self" gateway mapping that derives data gateway from current hostname (e.g., `roam_user.ardrive.net` → `ardrive.net`).

### Key Technical Constraints

**Performance Considerations**:
- Content auto-skips on 404/corruption (404-resistant design)
- No autoplay for bandwidth conservation
- Background queue refilling prevents loading delays
- Lazy loading for large files

**Arweave Integration**:
- Uses public GraphQL APIs (no private keys required)
- All content fetched client-side
- Permanent hosting on Arweave blockchain
- AR.IO gateway integration for fast delivery

**Mobile-First Design**:
- Touch-friendly navigation
- PWA installable on mobile devices  
- Works offline after installation
- Thumb-friendly single-tap exploration

### Testing Infrastructure

**Testing Framework**: Vitest with jsdom environment for engine layer unit testing

**Test Structure**:
- Unit tests for engine functions (`/src/engine/*.test.ts`)
- Test utilities and mocks in `/src/test/utils.ts`
- Global test setup in `/src/test/setup.ts`

**Engine Test Coverage**:
- `query.test.ts`: GraphQL operations, block height fetching, error handling
- `history.test.ts`: IndexedDB navigation history, state management
- `fetchQueue.test.ts`: Transaction queue initialization, filtering, configuration

**Testing Patterns**:
- Mock external dependencies (fetch, localStorage, idb-keyval, window.location)
- Use realistic transaction data for consistent testing
- Focus on business logic rather than UI components
- Comprehensive error handling and edge case coverage

**Test Results**: All 19 tests pass across 3 test files, ensuring the core data layer is robust and reliable.