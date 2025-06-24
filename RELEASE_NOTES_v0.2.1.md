# Roam v0.2.1 Release Notes

## 🚀 Simplified Wayfinder Settings

We're excited to announce Roam v0.2.1, which brings a dramatically simplified AR.IO Wayfinder integration that's enabled by default for a better content discovery experience.

### What's New

#### 🎯 Wayfinder Enabled by Default
- AR.IO integration is now active out-of-the-box
- No configuration required - just install and explore
- Optimal settings pre-configured for best performance

#### 🎮 Simplified Routing Modes
Choose from three user-friendly options:
- **Balanced** (Default) - Randomly selects from top 20 staked gateways for optimal load distribution
- **Fast** - Routes to the gateway with the fastest ping response
- **Fair Share** - Round-robin rotation through top 20 gateways for equal distribution

#### 🔒 Verified Browsing Toggle
- Optional cryptographic content verification
- Ensures content hasn't been tampered with
- Uses top 5 staked gateways for verification

#### 🎨 Improved Settings UI
- Clean, mobile-first design
- Intuitive toggle controls
- Real-time connection status
- Visual feedback for all settings

### Technical Improvements

#### ⚡ Performance Enhancements
- **Cache-Aware Navigation** - Instant back/forward navigation using cached content
- **Smart Gateway Selection** - Uses totalDelegatedStake for more reliable gateway sorting
- **Optimized Defaults** - Pre-configured for best performance and network health

#### 🧹 Code Cleanup
- Removed unused components (BlockRangeSlider, useRangeSlider)
- Simplified configuration system
- Fixed TypeScript issues
- Cleaner, more maintainable codebase

### What This Means for You

#### For New Users
- Zero configuration required
- Better content loading out of the box
- Simple, understandable settings

#### For Existing Users
- Your existing settings will be migrated
- Improved performance with cache-aware navigation
- Cleaner, more intuitive settings interface

### Breaking Changes
- None! This update is fully backward compatible

### Bug Fixes
- Fixed content type styling in settings drawer
- Removed confusing "Active" status indicator
- Corrected Verified Browsing description
- Fixed settings persistence issues

### Coming Next
We're continuing to improve Roam's content discovery experience. Stay tuned for more updates!

### Feedback
We love hearing from our users! Report issues or suggest features at:
https://github.com/anthropics/roam-the-permaweb/issues

---

**Full Changelog**: https://github.com/anthropics/roam-the-permaweb/compare/v0.2.0...v0.2.1