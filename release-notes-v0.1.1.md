# 🎉 Roam v0.1.1 - Mobile UX Improvements

This patch release addresses user-reported issues from v0.1.0, focusing on improving the mobile experience.

## 🐛 Bug Fixes

### iOS Pinch-to-Zoom Support
- **Fixed**: Pinch gesture not working on iOS devices in the image zoom overlay
- **Added**: Proper touch event handling for multi-touch gestures
- **Improved**: Simultaneous pinch-zoom and pan support for better image exploration

## 📱 Mobile UX Enhancements

### Bigger Touch Targets
- **Increased**: Media action button sizes from 32px to 42px (44px for toggle button)
- **Expanded**: Button spacing from 0.375rem to 0.625rem for easier tapping
- **Updated**: Privacy toggle button to match new larger size (44px)
- **Applied**: iOS-recommended minimum touch target sizes throughout

### Thumb-Friendly Navigation
- **Moved**: Navigation controls (Back, Next, Roam) below the media viewer
- **Benefit**: Easier one-handed operation on mobile devices
- **Adjusted**: Layout spacing to maintain visual balance with new positioning

## 🔧 Technical Details

### Changes Made
- Enhanced `ZoomOverlay` component with proper touch event handlers
- Increased all floating button sizes and spacing in CSS
- Restructured app layout to position controls at bottom
- Maintained backward compatibility with all existing features

### Files Modified
- `src/components/ZoomOverlay.tsx` - Touch gesture support
- `src/styles/media-view.css` - Button sizing improvements
- `src/app.tsx` - Layout restructuring
- `src/styles/app.css` - Control positioning adjustments

## 📱 Testing

All changes have been tested to ensure:
- ✅ Touch gestures work correctly on iOS/Android
- ✅ Buttons are easily tappable on small screens
- ✅ Navigation is accessible with one hand
- ✅ All existing functionality remains intact
- ✅ All 58 tests continue to pass

## 💻 Installation

### Update Web App
The changes will be automatically available at [roam.ar.io](https://roam.ar.io)

### Update PWA
1. Close the Roam app completely
2. Reopen to receive the update
3. You may need to clear cache if updates don't appear

### Development
```bash
git pull origin main
npm install
npm run dev
```

---

**Full Changelog**: https://github.com/Roam-the-Permaweb/roam-web/compare/v0.1.0...v0.1.1