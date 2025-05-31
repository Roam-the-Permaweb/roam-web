# Roam v0.1.2 Release Notes

## 🚀 Major Performance Improvements

### Progressive GraphQL Pagination
- **10x faster initial load times** - Content now appears in 2-3 seconds instead of 10-30 seconds
- **Smart pagination** - Fetches only 200 items initially (was fetching 5,000-20,000+)
- **Seamless background loading** - Queue refills happen invisibly while you browse
- **Cursor-based continuation** - Picks up where you left off, no duplicate fetching

### Enhanced Randomization & Duplicate Prevention
- **Cryptographically secure randomness** - Uses `crypto.getRandomValues()` for better entropy
- **Cross-session memory** - Remembers up to 10,000 viewed items across page refreshes
- **Fisher-Yates shuffle** - All content batches are perfectly randomized
- **<1% duplicate chance** - Near-zero probability of seeing the same content twice

## 🛡️ Reliability & Stability Enhancements

### GraphQL Gateway Protection
- **Rate limiting** - Respects gateway limits with 5 requests/minute throttling
- **Exponential backoff** - Smart retry delays (1s → 2s → 4s) with ±30% jitter
- **Error classification** - Only retries on transient errors, fails fast on client errors
- **Memory leak prevention** - Automatic cleanup of expired cursors every minute

### Concurrency & Thread Safety
- **Mutex protection** - Prevents race conditions during queue operations
- **Synchronized refills** - Background operations can't corrupt the queue
- **Safe async handling** - Proper lock management around network operations

## 🎨 UI/UX Improvements (from v0.1.1)

### Mobile Experience
- **iOS pinch-to-zoom** - Native gesture support in image viewer
- **Larger touch targets** - 44-56px buttons meet iOS Human Interface Guidelines
- **Swipe navigation** - Swipe left/right to browse content
- **Fixed bottom navigation** - Controls stay in thumb-reach zone

### Visual Enhancements
- **Maximized content area** - 80vh image heights, 75vh videos
- **Glass morphism design** - Consistent Apple-inspired aesthetic
- **Subtle about button** - Unobtrusive info icon with 30% opacity
- **Enhanced media types** - Added SVG, AVIF, OGG, WebM, MP4, FLAC support

## 🐛 Bug Fixes

- **Fixed GraphQL cursor error** - Correctly uses `cursor` field from edges
- **Fixed build asset paths** - Static assets now in `/public` directory
- **Fixed TypeScript compilation** - Resolved all type errors
- **Fixed test coverage** - All 61 tests passing

## 📊 Technical Improvements

- **Reduced bundle size** - Only ~1KB increase despite major features
- **Better error messages** - More descriptive GraphQL error handling
- **Improved logging** - Debug logs for pagination and rate limiting
- **Enhanced test suite** - Added tests for pagination and cursor management

## 🔧 Configuration

No configuration changes required. The app automatically:
- Manages rate limits per gateway
- Cleans up expired data
- Handles pagination seamlessly
- Prevents duplicate content

## 🙏 Acknowledgments

Thanks to our users for feedback on performance and mobile UX. This release directly addresses the most requested improvements.

---

**Full Changelog**: https://github.com/roam-the-permaweb/roam-web/compare/v0.1.1...v0.1.2