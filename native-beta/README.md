# Kayla’s Library — Readium beta

This is an isolated native SwiftUI experiment. It does not replace or migrate the stable Capacitor app.

## Current beta scope

- Import local, DRM-free EPUB files from the iOS Files picker.
- Read with a single Readium navigator instance and resume from Readium's saved Locator.
- Tap the left or right edge to change pages.
- Lock page turns, change text size, and switch between light and night themes.
- Enter Focus Mode without presenting a second reader. The SwiftUI toolbars disappear and the existing navigator grows only within the device safe area, below the status bar and above the home indicator.
- Keep the screen awake while the reader is open.

The beta uses its own bundle identifier and local library folder. Books from the stable app must be imported again. PDF support, highlights, and production migration are intentionally outside this first Focus Mode comparison build.

## Install

The GitHub Actions artifact contains an unsigned IPA for signing or sideloading with the user's own Apple account and preferred compatible tool. The IPA is not intended for App Store distribution.
