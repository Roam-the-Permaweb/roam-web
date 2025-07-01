# Roam v0.2.0

> A beautifully crafted, shuffle-play interface for exploring the infinite Permaweb with **AR.IO Wayfinder integration**.

**Roam** is a premium, mobile-first PWA that lets you discover random Arweave content—images, videos, music, websites, documents, and ArFS files—through an elegant, Apple-inspired interface with **verified content delivery**. Just tap "Next" and let serendipity guide your digital journey through the **secure, verified Permaweb**.

**Pure, decentralized content discovery with cryptographic verification.**

![Roam Banner](./assets/banner.png)

---

## 🌍 Live App

**[roam.ar.io](https://roam.ar.io)** — hosted permanently on Arweave and served via [AR.IO Gateway](https://ar.io/) with [ArNS](https://docs.ar.io/arns) resolution.

---

## ✨ v0.2.0 Features - AR.IO Wayfinder Integration

### 🔐 **Content Verification & Security**
- **AR.IO Wayfinder integration** for cryptographic content verification
- **Hash-based verification** via trusted gateways (permagate.io, vilenarios.com)
- **Real-time verification status** with visual indicators (green checkmark, loading spinner)
- **Secure content delivery** through verified blob serving
- **Dynamic gateway routing** with AR.IO network stake-based selection

### 🚀 **Intelligent Content Caching**
- **Smart content caching** with TTL and LRU-based cleanup
- **Verification status sync** - cached content shows correct verification state
- **Memory-efficient** Object URL lifecycle management
- **Race condition-free** verification event propagation
- **Bandwidth-conscious** size-aware loading with manual thresholds

### 📊 **Size-Aware Loading System**
- **Images**: Auto-load up to 25MB, manual button for larger files
- **Videos**: Auto-load up to 200MB, manual button for larger files  
- **Audio**: Auto-load up to 50MB, manual button for larger files
- **Text**: Auto-load up to 10MB, manual button for larger files
- **Forced loading**: Manual buttons trigger verified Wayfinder fetch

### 🛡 **Enhanced Security Features**
- **No double-fetching** - single verified fetch per content item
- **Transparent verification** - subtle UI that doesn't disrupt browsing
- **Fallback mechanisms** - graceful degradation to direct gateways
- **Memory leak prevention** - proper cleanup and resource management

---

## ⚙️ Wayfinder Configuration

### **Default Settings**

Roam comes with optimized default settings that work out of the box:

- **Wayfinder**: Enabled by default for optimal content delivery
- **Routing Mode**: Balanced (random selection from top 20 staked gateways)
- **Verified Browsing**: Disabled by default for faster performance
- **Gateway Cache**: 1-hour TTL for efficiency

### **User-Configurable Settings**

Access Wayfinder settings through the **Channels drawer** (filter icon) in the app:

#### **1. Wayfinder Toggle**
- **Enabled (Default)**: Uses AR.IO network for smart gateway routing
- **Disabled**: Falls back to direct gateway connections

#### **2. Routing Modes**

| Mode | Description | Best For |
|------|-------------|----------|
| **Balanced** (Default) | Random selection from top 20 staked gateways | General use - mix of speed and distribution |
| **Fast** | Pings top 10 gateways and selects fastest | Users prioritizing speed |
| **Fair Share** | Round-robin through top 30 gateways | Supporting network decentralization |

#### **3. Verified Browsing**
- **Disabled (Default)**: Faster content loading without verification
- **Enabled**: Cryptographic verification using top 5 staked gateways
- Verification uses SHA-256 hash comparison to ensure content integrity
- Visual indicators show verification status (✓ = verified, ⏳ = verifying)

#### **4. Help Improve AR.IO Network (Telemetry)**
- **Disabled (Default)**: No data is collected - privacy-first approach
- **Enabled**: Share anonymous performance metrics with AR.IO
- When enabled, sends a 10% sample of:
  - Gateway routing performance (response times, success rates)
  - Request success/failure rates (no content data)
  - Aggregate performance metrics (no personal information)
- **Never collects**: Transaction IDs, content data, personal information, or browsing history
- Uses OpenTelemetry standard for industry-standard telemetry collection

#### **5. Advanced Settings**
- **Custom AO Compute Unit URL**: Override default CU for gateway information
  - Default: `https://cu.ardrive.io`
  - Alternative: `https://cu.ao-testnet.xyz`

### **Fallback Gateway Logic**

When Wayfinder is unavailable, Roam intelligently selects fallback gateways:

| Hostname Pattern | Fallback Gateway |
|-----------------|------------------|
| `roam.ar.io` | `https://arweave.net` |
| `roam.gateway.com` | `https://gateway.com` |
| `localhost` / dev | `https://arweave.net` |
| Direct gateway hosting | Uses hosting gateway |
| Default | `https://arweave.net` |

### **Content Size Thresholds**

To respect bandwidth, Roam auto-loads content up to these limits:

| Content Type | Auto-load Limit | Above Limit |
|--------------|-----------------|-------------|
| **Images** | 25 MB | Shows "Load Content" button |
| **Videos** | 200 MB | Shows "Load Content" button |
| **Audio** | 50 MB | Shows "Load Content" button |
| **Text** | 10 MB | Shows "Load Content" button |

### **Configuration Persistence**

- All settings are saved to browser localStorage
- Settings persist across sessions
- Configuration key: `wayfinder-config`
- Telemetry preference is preserved across sessions (opt-in only)

---

## ✨ v0.1.0 Features (Previous Release)

### 🎨 **Apple-Inspired Design**
- **Glass morphism effects** with subtle backdrop blur
- **Dark theme** with vibrant orange-to-pink gradient accents
- **Smooth transitions** and loading states throughout
- **Content-aware layouts** that adapt to different media types

### 📅 **Advanced Date Filtering**
- **Visual date range picker** with calendar interface
- **Real-time block conversion** using binary search algorithms  
- **Smart validation** against Arweave blockchain history
- **Performance caching** for instant date-to-block mapping

### 🎛 **Enhanced Content Discovery**
- **Content channels**: Images, videos, music, websites, text, ArFS files, or everything
- **Time filters**: New content (recent blocks) or old content (random historical windows)
- **Smart algorithms**: Sliding window system efficiently explores Arweave's 1.6M+ blocks
- **Background prefetching**: Queue refills automatically for seamless browsing

### 📱 **Mobile-First Experience**  
- **Floating action menus** for space-efficient interactions
- **Touch-optimized controls** with generous tap targets
- **Progressive Web App** - install like a native app
- **Bandwidth conscious** - manual load for large files, no autoplay

### 🔗 **Deep Linking & Sharing**
- **Direct transaction links** (`?txid=abc123`)
- **Content filtering URLs** (`?channel=images&recency=new`)  
- **Date range permalinks** (`?minBlock=1000000&maxBlock=1100000`)
- **Owner filtering** (`?ownerAddress=xyz789`)
- **App filtering** (`?appName=MyApp`)

### 🎵 **Enhanced Media Support**
- **Smart image sizing** with zoom functionality
- **Rich audio player** with animated wave visualizations
- **PDF viewer** with responsive sizing
- **Text rendering** with improved readability
- **Video player** with optimized controls
- **ArFS file support** with metadata resolution

### 🛡 **Privacy & Safety**
- **NSFW consent system** with privacy screen toggles
- **404-resistant design** automatically skips corrupted content
- **Local-only history** - your browsing stays private
- **Secure iframe sandboxing** for external content

---

## 🧠 How It Works

Roam v0.2.0 is built on a sophisticated, client-side architecture with AR.IO Wayfinder integration:

### **AR.IO Wayfinder Verification System**
- **AR.IO SDK integration** with dynamic gateway routing via network stake
- **Hash-based content verification** using trusted gateways for integrity validation
- **Intelligent content caching** with verification status synchronization
- **Size-aware loading** respects bandwidth with content-type specific thresholds
- **Event-driven verification** with race condition-free status propagation

### **Content Discovery Engine**
- **Sliding window algorithm** efficiently explores Arweave's massive blockchain
- **GraphQL queries** to Goldsky endpoints for transaction discovery
- **Smart caching** prevents duplicate content and improves performance
- **Background queue management** maintains smooth user experience

### **Date-to-Block Conversion**
- **Binary search algorithm** maps calendar dates to exact block heights
- **GraphQL integration** fetches block timestamps efficiently
- **Intelligent fallbacks** ensure functionality even with network issues
- **Cache optimization** stores results for instant re-access

### **Modern Tech Stack**
- **Preact** for lightweight, fast UI rendering
- **TypeScript** for type-safe development
- **AR.IO SDK** for verified content delivery and gateway routing
- **Vite** for lightning-fast builds and hot reload
- **UnoCSS** for utility-first styling
- **Vitest** for comprehensive testing
- **PWA** capabilities with offline support

### **Arweave Integration**
- **AR.IO Wayfinder** for verified content delivery with cryptographic validation
- **Public GraphQL APIs** - no private keys required
- **Dynamic gateway routing** via AR.IO network with stake-based selection
- **Trusted gateway verification** using permagate.io and vilenarios.com
- **Client-side only** - your data never touches our servers
- **Permanent hosting** on the Arweave blockchain

---

## 🚀 Getting Started

### **Prerequisites**
- Node.js 18+ 
- npm or pnpm

### **Development Setup**

```bash
# Clone the repository
git clone https://github.com/yourusername/roam-web.git
cd roam-web

# Install dependencies
npm install

# Start development server
npm run dev

# Open http://localhost:5173
```

### **Available Scripts**

```bash
# Development
npm run dev              # Start dev server with hot reload
npm run build            # Production build
npm run preview          # Preview production build

# Testing  
npm test                 # Run tests in watch mode
npm run test:run         # Run tests once
npm run test:coverage    # Generate coverage report
npm run test:ui          # Open Vitest UI

# Linting & Type Checking
npm run lint             # ESLint checking
npm run typecheck        # TypeScript checking
```

### **Environment Configuration**

Create a `.env.local` file for custom gateway and Wayfinder configuration:

```bash
# GraphQL endpoints (required)
VITE_GATEWAYS_GRAPHQL=https://goldsky-arweave-api.com/graphql,https://arweave-search.goldsky.com/graphql

# Data gateways (optional - defaults to arweave.net)
VITE_GATEWAYS_DATA_SOURCE=https://arweave.net,https://ar-io.net,self
```

**Gateway Notes**:
- `self` automatically derives gateway from current hostname
- Multiple gateways provide automatic failover
- AR.IO gateways offer enhanced performance and reliability

**Wayfinder Configuration**:
- Wayfinder is now **enabled by default** with optimized settings
- All configuration is done through the in-app UI (Channels drawer)
- No environment variables needed for Wayfinder - settings persist in localStorage
- See the [Wayfinder Configuration](#️-wayfinder-configuration) section above for details

---

## 📦 Building & Deployment

### **Production Build**

```bash
npm run build
```

This creates optimized static files in the `/dist` directory.

### **Deploy to Arweave**

Deploy the `/dist` folder using any Arweave uploading tool:

- **[ArDrive](https://ardrive.io/)** - Web interface and CLI
- **[Permaweb Deploy](https://deploy.permaweb.tools/)** - GitHub Actions integration  
- **[ArLink](https://arlink.ar.io/)** - Simple web uploader
- **[Arkb](https://github.com/textury/arkb)** - CLI deployment tool

### **Deploy to Traditional Web**

The build also works on traditional hosting:
- Vercel
- Netlify  
- GitHub Pages
- Any static hosting service

---

## 🧪 Testing

Roam includes comprehensive test coverage:

```bash
# Run all tests
npm test

# Generate coverage report  
npm run test:coverage

# Interactive test UI
npm run test:ui
```

**Test Coverage**:
- ✅ Engine layer (data fetching, queue management)
- ✅ Date/block conversion algorithms  
- ✅ GraphQL query handling
- ✅ Navigation history management
- ✅ Utility functions and edge cases

---

## 🔧 Architecture

### **Project Structure**

```
src/
├── components/          # UI components
│   ├── MediaView.tsx    # Universal content renderer with Wayfinder integration
│   ├── VerificationIndicator.tsx # Real-time verification status display
│   ├── DateRangeSlider.tsx  # Date filtering
│   ├── DetailsDrawer.tsx    # Metadata panel
│   └── ...
├── services/            # External service integrations (NEW)
│   ├── wayfinder.ts     # AR.IO Wayfinder SDK integration
│   └── wayfinderTypes.ts # TypeScript interfaces for Wayfinder
├── engine/              # Core data layer
│   ├── fetchQueue.ts    # Content discovery algorithms
│   ├── query.ts         # GraphQL operations  
│   └── history.ts       # Navigation management
├── hooks/               # Custom React hooks
│   ├── useAppState.ts   # Main app state
│   ├── useWayfinderContent.ts # Verified content fetching hook (NEW)
│   ├── useNavigation.ts # Navigation logic
│   └── ...
├── utils/               # Utility functions
│   ├── dateBlockUtils.ts # Date/block conversion
│   └── logger.ts        # Logging utilities
└── styles/              # Component-specific CSS
```

### **Key Design Patterns**

- **AR.IO Wayfinder integration** for verified content delivery with caching
- **Event-driven verification** with race condition-free status propagation
- **Size-aware loading** with bandwidth-conscious thresholds
- **Custom hooks** for modular state management
- **Sliding window algorithm** for efficient content discovery
- **Binary search** for precise date-to-block mapping
- **Progressive enhancement** for optimal loading
- **Content-type aware rendering** for better UX

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

### **Quick Start for Contributors**

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes and add tests
4. Ensure all tests pass (`npm test`)
5. Commit with descriptive messages
6. Push and create a Pull Request

### **Development Guidelines**

- Follow TypeScript best practices
- Add comprehensive JSDoc comments
- Write tests for new functionality
- Follow the Apple-inspired design system
- Ensure mobile-first responsive design

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

---

## 🙏 Acknowledgments

- **Arweave** - The permanent, decentralized web protocol
- **AR.IO** - Gateway network for fast content delivery
- **Goldsky** - GraphQL API infrastructure
- **The Permaweb Community** - For building the future of the web

---

## 📞 Support

- **Documentation**: See [CLAUDE.md](./CLAUDE.md) for detailed technical documentation
- **Issues**: Report bugs and request features via [GitHub Issues](https://github.com/yourusername/roam-web/issues)
- **Community**: Join the Arweave Discord for community support

---

## 🗺 Roadmap

**✅ v0.2.0 Completed**:
- [x] **AR.IO Wayfinder integration** with verified content delivery
- [x] **Content verification system** with hash-based validation
- [x] **Intelligent caching** with TTL and LRU cleanup
- [x] **Size-aware loading** with bandwidth-conscious thresholds
- [x] **Real-time verification UI** with status indicators

**Upcoming Features (v0.3.0+)**:
- [ ] Content bookmarking and favorites
- [ ] Advanced search and filtering options
- [ ] Social features and content sharing
- [ ] Offline-first architecture improvements
- [ ] Multi-language support
- [ ] Content creator tools integration

**Performance Improvements**:
- [x] **Enhanced caching strategies** (Wayfinder integration)
- [ ] WebAssembly date/block algorithms
- [ ] Service worker optimization
- [ ] Progressive image loading

---

*Built with ❤️ for the Permaweb community*