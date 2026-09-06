# Install Kayla’s Library on your iPhone

This build requires iOS/iPadOS 17 or later. The IPA contains the reader and its
PDF/EPUB engines, so the computer and local web server are not needed to read.
An internet connection is used only when looking up cover art.

## Download a build

1. On GitHub, open this repository's **Actions** tab.
2. Open **Build Kayla's Library IPA**, then select a successful run.
3. Under **Artifacts**, download **Kaylas-Library-unsigned-<build number>**.
4. Save the ZIP to Files on your iPhone and tap it to extract it.
5. Locate **Kaylas-Library-unsigned.ipa** in the extracted folder (it may be under `build`).

## Open with LiveContainer

1. Install and configure LiveContainer first, following its
   [official installation guide](https://livecontainer.github.io/docs/intro/).
2. In LiveContainer, tap **+** and choose **Kaylas-Library-unsigned.ipa**.
3. Select Kayla’s Library and launch it.
4. Tap **Import books** and choose an EPUB, PDF, or TXT from Files.

LiveContainer handles guest app signing with its configured certificate, or
uses its supported JIT mode. This IPA is intentionally unsigned: it cannot be
installed by simply tapping it in Files. You can alternatively sign the IPA
using your existing sideloading tool and Apple account. Apple credentials and
certificates are never used by this GitHub workflow.

If the Files picker does not appear inside LiveContainer, enable **Fix File
Picker** in Kayla’s Library’s app-specific LiveContainer settings. See the
[official LiveContainer guide](https://github.com/LiveContainer/LiveContainer#features--guides).

## Your library and updates

- Tap the left/right side of a reading page to go back/forward. The middle
  stays still; links, long-press selection, dragging, and multi-touch do not turn pages.
- PDF: pinch or use the zoom buttons (100–400%). Drag to pan; **Fit width**
  returns to the fitted page and resets its position. Side taps are disabled
  above 100% so you can explore safely; the arrow buttons still change pages.
- EPUB: tap an embedded illustration or map to open its separate zoom view.
  Pinch or use the buttons, then close to return to the same reading position.
  Illustrations inside links keep their original link behavior.
- EPUB page counters show screen pages within the current book section, even
  without a chapter list. They recalculate when text size changes. New bookmarks
  include the page/section and text size when saved, but always reopen the exact
  passage. These are not print-edition page numbers or whole-book page totals.

- Import books again on the iPhone: the desktop browser's library does not sync.
- EPUB/PDF/TXT files, bookmarks, reading position, and successful cover lookups
  are saved in Kayla’s Library’s local WebView storage.
- Use **Save or share original** on a book to export it through the iOS share sheet.
- Keep original book files. Removing Kayla’s Library or its LiveContainer data container
  removes that library; updates should use the existing container.
- For another build, open **Actions → Build Kayla's Library IPA → Run workflow**. Source
  changes also start a build automatically.

The workflow verifies the reader, compiles an arm64 iPhone app on GitHub's Mac
runner, and checks the IPA archive. Actual device behavior and LiveContainer
compatibility still need an on-device check after the first build.
