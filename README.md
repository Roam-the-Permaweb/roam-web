# Roam v0.1.0

> A beautifully crafted, shuffle-play interface for exploring the infinite Permaweb.

**Roam** is a premium, mobile-first PWA that lets you discover random Arweave content—images, videos, music, websites, documents, and ArFS files—through an elegant, Apple-inspired interface. Just tap "Next" and let serendipity guide your digital journey.

**Pure, decentralized content discovery.**

![Roam Banner](./assets/banner.png)

---

## 🌍 Live App

**[roam.ar.io](https://roam.ar.io)** — hosted permanently on Arweave and served via [AR.IO Gateway](https://ar.io/) with [ArNS](https://docs.ar.io/arns) resolution.

---

## ✨ v0.1.0 Features

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

Roam v0.1.0 is built on a sophisticated, client-side architecture:

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
- **Vite** for lightning-fast builds and hot reload
- **UnoCSS** for utility-first styling
- **Vitest** for comprehensive testing
- **PWA** capabilities with offline support

### **Arweave Integration**
- **Public GraphQL APIs** - no private keys required
- **AR.IO Gateways** for fast, reliable content delivery
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

Create a `.env.local` file for custom gateway configuration:

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
│   ├── MediaView.tsx    # Universal content renderer
│   ├── DateRangeSlider.tsx  # Date filtering
│   ├── DetailsDrawer.tsx    # Metadata panel
│   └── ...
├── engine/              # Core data layer
│   ├── fetchQueue.ts    # Content discovery algorithms
│   ├── query.ts         # GraphQL operations  
│   └── history.ts       # Navigation management
├── hooks/               # Custom React hooks
│   ├── useAppState.ts   # Main app state
│   ├── useNavigation.ts # Navigation logic
│   └── ...
├── utils/               # Utility functions
│   ├── dateBlockUtils.ts # Date/block conversion
│   └── logger.ts        # Logging utilities
└── styles/              # Component-specific CSS
```

### **Key Design Patterns**

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

**Upcoming Features**:
- [ ] Content bookmarking and favorites
- [ ] Advanced search and filtering options
- [ ] Social features and content sharing
- [ ] Offline-first architecture improvements
- [ ] Multi-language support
- [ ] Content creator tools integration

**Performance Improvements**:
- [ ] Enhanced caching strategies
- [ ] WebAssembly date/block algorithms
- [ ] Service worker optimization
- [ ] Progressive image loading

---

*Built with ❤️ for the Permaweb community*