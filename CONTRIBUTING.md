# Contributing to Roam v0.1.0

Thanks for your interest in contributing to **Roam** — a beautifully crafted, Apple-inspired PWA for discovering random Arweave content across the Permaweb. We welcome contributions of all kinds: code, issues, feedback, design, documentation, and innovative ideas.

---

## 🧠 What is Roam?

Roam is a premium content discovery platform for the Permaweb. It lets users explore random Arweave content through an elegant, shuffle-play interface with advanced filtering by media type, date ranges, and content creators—all wrapped in a stunning Apple-inspired design.

**Roam v0.1.0 is:**

- 🎨 **Apple-inspired** with glass morphism and smooth transitions  
- 📱 **Mobile-first** with touch-optimized interactions
- 📅 **Date-intelligent** with advanced block/timestamp conversion
- ⚡ **Built with modern tech**: Preact + TypeScript + Vite + Vitest
- 🔍 **Fully client-side** with no backend dependencies
- 🌌 **Permaweb-native** deployed permanently on Arweave

---

## 🛠 Tech Stack & Architecture

### **Frontend Framework**
- **Preact** for lightweight, fast UI rendering
- **TypeScript** for type-safe development  
- **Vite** for lightning-fast builds and HMR
- **UnoCSS** for utility-first styling
- **PWA** capabilities with offline support

### **Arweave Integration**  
- **GraphQL APIs** (Goldsky) for transaction discovery
- **AR.IO Gateways** for fast content delivery
- **Binary search algorithms** for date-to-block conversion
- **Smart caching** for optimal performance

### **Testing & Quality**
- **Vitest** for unit and integration testing
- **TypeScript** for compile-time error catching
- **ESLint** for code quality and consistency
- **Comprehensive test coverage** for core engine layer

### **Design System**
- **Apple-inspired aesthetics** with glass morphism
- **Dark theme** with orange-to-pink gradient accents  
- **Content-aware layouts** that adapt to media types
- **Floating action menus** for space efficiency

---

## 🧑‍💻 Ways to Contribute

| Type | Description | How to Help |
|------|-------------|-------------|
| 💡 **Feature Ideas** | Advanced filtering, bookmarks, social features | [Open a feature request](https://github.com/your-org/roam-web/issues/new) |
| 🐛 **Bug Reports** | UI glitches, performance issues, broken functionality | Create detailed issue with reproduction steps |
| 🎨 **UI/UX Polish** | Apple design improvements, animations, accessibility | Fork, improve, and submit PR with screenshots |
| 🔧 **Media Handlers** | Support for new content types and file formats | Extend `MediaView.tsx` with new renderers |
| 📅 **Date Filtering** | Improve binary search, caching, date validation | Enhance `dateBlockUtils.ts` functions |
| 🧪 **Testing** | Unit tests, integration tests, edge case coverage | Add tests in `*.test.ts` files |
| 📱 **Mobile UX** | Touch interactions, responsive design, PWA features | Test and improve mobile experience |
| 🔌 **Integrations** | ENS, IPFS, AO protocols, wallet connections | Propose and implement new integrations |
| 🌐 **Translations** | Multi-language support and internationalization | Help make Roam globally accessible |
| 📚 **Documentation** | Code comments, guides, API documentation | Improve README, CLAUDE.md, and inline docs |

---

## 📁 Project Structure

```bash
src/
├── components/          # UI Components
│   ├── MediaView.tsx    # Universal content renderer
│   ├── DateRangeSlider.tsx  # Advanced date filtering
│   ├── DetailsDrawer.tsx    # Apple-inspired metadata panel
│   ├── TransactionInfo.tsx  # Compact content metadata
│   └── ...              # Other UI components
├── engine/              # Core Data Layer  
│   ├── fetchQueue.ts    # Sliding window content discovery
│   ├── query.ts         # GraphQL operations & caching
│   └── history.ts       # Navigation history management
├── hooks/               # Custom React Hooks
│   ├── useAppState.ts   # Main application state
│   ├── useNavigation.ts # Navigation logic & actions
│   ├── useDateRangeSlider.ts # Date filtering state
│   └── ...              # Other custom hooks
├── utils/               # Utility Functions
│   ├── dateBlockUtils.ts # Date/block conversion algorithms
│   └── logger.ts        # Logging and debugging utilities
├── styles/              # Component-Specific CSS
│   ├── media-view.css   # Media rendering styles
│   ├── app.css          # Global application styles
│   └── ...              # Other style modules
├── test/                # Testing Infrastructure
│   ├── setup.ts         # Global test configuration
│   ├── utils.ts         # Test utilities and mocks
│   └── ...              # Test helpers
└── constants.ts         # Application-wide constants
```

---

## 🔧 Development Setup

### **Prerequisites**
- **Node.js 18+** (LTS recommended)
- **npm** or **pnpm** package manager
- **Git** for version control

### **Quick Start**

1. **Fork & Clone**
   ```bash
   # Fork the repository on GitHub first
   git clone https://github.com/YOUR_USERNAME/roam-web.git
   cd roam-web
   ```

2. **Install Dependencies**
   ```bash
   npm install
   # or
   pnpm install
   ```

3. **Environment Setup** (Optional)
   ```bash
   # Create .env.local for custom gateways
   cp .env.example .env.local
   # Edit .env.local with your preferred gateways
   ```

4. **Start Development Server**
   ```bash
   npm run dev
   # Open http://localhost:5173
   ```

### **Available Scripts**

```bash
# Development
npm run dev              # Start dev server with hot reload
npm run build            # Production build
npm run preview          # Preview production build locally

# Testing & Quality
npm test                 # Run tests in watch mode  
npm run test:run         # Run all tests once
npm run test:coverage    # Generate coverage report
npm run test:ui          # Open interactive Vitest UI
npm run lint             # ESLint code quality check
npm run typecheck        # TypeScript type checking

# Utilities
npm run clean            # Clean build artifacts
```

---

## 🧪 Testing Guidelines

Roam has comprehensive test coverage focusing on the core engine layer:

### **Writing Tests**
- **Unit tests** for utility functions (especially `dateBlockUtils.ts`)
- **Integration tests** for engine components (`fetchQueue.ts`, `query.ts`)
- **Edge case testing** for error handling and boundary conditions
- **Mock external dependencies** (fetch, localStorage, GraphQL APIs)

### **Testing Best Practices**
```typescript
// Example test structure
describe('dateBlockUtils', () => {
  beforeEach(() => {
    // Setup mocks and reset state
  })
  
  it('should convert dates to blocks accurately', async () => {
    // Test with realistic data
    // Assert expected behavior
    // Cover edge cases
  })
})
```

### **Running Tests**
```bash
# Watch mode during development
npm test

# Single run for CI/CD
npm run test:run

# Coverage report
npm run test:coverage

# Interactive UI for debugging
npm run test:ui
```

---

## ✅ Pull Request Guidelines

### **Before Submitting**

- [ ] **Code Quality**
  - [ ] Code runs locally without errors
  - [ ] All tests pass (`npm run test:run`)
  - [ ] TypeScript compiles without errors (`npm run typecheck`)
  - [ ] ESLint passes without warnings (`npm run lint`)

- [ ] **Documentation**
  - [ ] Add JSDoc comments for complex functions
  - [ ] Update relevant documentation (README, CLAUDE.md)
  - [ ] Include clear PR description explaining changes

- [ ] **Testing**
  - [ ] Add tests for new functionality
  - [ ] Verify existing tests still pass
  - [ ] Test on both mobile and desktop
  - [ ] Test with different content types and edge cases

- [ ] **Design & UX**
  - [ ] Follow Apple-inspired design principles
  - [ ] Ensure responsive design works on all screen sizes
  - [ ] Include screenshots/videos for UI changes
  - [ ] Verify smooth animations and transitions

### **PR Description Template**

```markdown
## 🎯 Purpose
Brief description of what this PR accomplishes

## 🔧 Changes Made
- List of specific changes
- New features added
- Bugs fixed
- Performance improvements

## 🧪 Testing
- [ ] Unit tests added/updated
- [ ] Manual testing completed
- [ ] Mobile testing verified
- [ ] Edge cases considered

## 📸 Screenshots/Videos
Include visual evidence for UI changes

## 📋 Checklist
- [ ] Code follows project conventions
- [ ] Tests pass
- [ ] Documentation updated
- [ ] No breaking changes (or properly documented)
```

---

## 🎨 Design System Guidelines

### **Apple-Inspired Principles**
- **Clarity**: Clear visual hierarchy and readable typography
- **Deference**: UI defers to content, not overwhelming users
- **Depth**: Layers and glass morphism create spatial relationships

### **Color Palette**
```css
/* Primary Gradient */
--gradient-primary: linear-gradient(135deg, #FF6A00, #FF00CC);

/* Background Colors */
--bg-primary: rgba(15, 1, 33, 0.95);  /* Deep dark */
--bg-secondary: rgba(255, 255, 255, 0.05);  /* Glass cards */

/* Text Colors */
--text-primary: #ffffff;
--text-secondary: rgba(255, 255, 255, 0.7);
--text-accent: #FF6A00;
```

### **Component Patterns**
- **Glass morphism cards** with backdrop blur
- **Floating action buttons** with shadow and hover effects
- **Smooth transitions** using `cubic-bezier(0.25, 0.46, 0.45, 0.94)`
- **Content-aware layouts** that adapt to media types

---

## 🚀 Deployment & Release

### **Development Process**
1. Create feature branch from `main`
2. Implement changes with tests
3. Create pull request with detailed description
4. Code review and testing
5. Merge to `main` after approval

### **Release Process**
- **Semantic versioning** (v0.1.0, v0.1.1, v0.2.0)
- **Changelog maintenance** with clear feature descriptions
- **Tag releases** with GitHub releases
- **Deploy to Arweave** using permanent storage

---

## 📬 Community & Support

### **Getting Help**
- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: Questions and community chat
- **Discord**: Real-time community support (link to Arweave Discord)

### **Contribution Recognition**
- Contributors are recognized in release notes
- Significant contributions earn maintainer privileges
- Community members can propose architectural changes

---

## 💡 Future Roadmap Ideas

**Looking for inspiration?** Consider contributing to these upcoming features:

### **Content & Discovery**
- Advanced search and filtering capabilities
- Content bookmarking and favorites system
- Creator profiles and following functionality
- Content recommendations based on viewing history

### **Technical Improvements**
- WebAssembly date/block conversion for performance
- Service worker optimization for offline functionality
- Progressive image loading and caching strategies
- Multi-language internationalization support

### **Social Features**
- Content sharing and social interactions
- Comments and reactions system
- Community curated collections
- Integration with social protocols

### **Developer Tools**
- Content creator analytics dashboard
- API for third-party integrations
- Plugin system for community extensions
- Advanced debugging and monitoring tools

---

## 💥 Code of Conduct

We foster an inclusive, respectful community where everyone can contribute meaningfully:

### **Our Standards**
- **Be respectful** of different viewpoints and experiences
- **Be constructive** in feedback and criticism
- **Be collaborative** and help others learn and grow
- **Be patient** with newcomers and different skill levels

### **Unacceptable Behavior**
- Harassment, discrimination, or toxic behavior
- Spam, off-topic discussions, or promotional content
- Sharing private information without consent
- Any behavior that creates an unwelcoming environment

**Enforcement**: Issues will be addressed promptly by maintainers. Serious violations may result in temporary or permanent bans.

---

## 🙏 Recognition

### **Current Contributors**
Thank you to everyone who has helped make Roam better! Contributors are recognized in our release notes and project documentation.

### **Special Thanks**
- **Arweave Team** - For building the permanent web
- **AR.IO Network** - For fast, reliable gateway infrastructure  
- **Goldsky** - For GraphQL API infrastructure
- **The Permaweb Community** - For continuous inspiration and support

---

**Ready to explore the Permaweb together?**  
`🚀 Fork • Build • Contribute • Repeat`

*Join us in building the future of decentralized content discovery.*