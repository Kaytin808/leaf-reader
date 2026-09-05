# Install Leaf on your iPhone

This build requires iOS/iPadOS 17 or later. The IPA contains the reader and its
PDF/EPUB engines, so the computer and local web server are not needed to read.
An internet connection is used only when looking up cover art.

## Download a build

1. On GitHub, open this repository's **Actions** tab.
2. Open **Build Leaf IPA**, then select a successful run.
3. Under **Artifacts**, download **Leaf-unsigned-<build number>**.
4. Save the ZIP to Files on your iPhone and tap it to extract it.
5. Locate **Leaf-unsigned.ipa** in the extracted folder (it may be under `build`).

## Open with LiveContainer

1. Install and configure LiveContainer first, following its
   [official installation guide](https://livecontainer.github.io/docs/intro/).
2. In LiveContainer, tap **+** and choose **Leaf-unsigned.ipa**.
3. Select Leaf and launch it.
4. Tap **Import books** and choose an EPUB, PDF, or TXT from Files.

LiveContainer handles guest app signing with its configured certificate, or
uses its supported JIT mode. This IPA is intentionally unsigned: it cannot be
installed by simply tapping it in Files. You can alternatively sign the IPA
using your existing sideloading tool and Apple account. Apple credentials and
certificates are never used by this GitHub workflow.

If the Files picker does not appear inside LiveContainer, enable **Fix File
Picker** in Leaf's app-specific LiveContainer settings. See the
[official LiveContainer guide](https://github.com/LiveContainer/LiveContainer#features--guides).

## Your library and updates

- Import books again on the iPhone: the desktop browser's library does not sync.
- EPUB/PDF/TXT files, bookmarks, reading position, and successful cover lookups
  are saved in Leaf's local WebView storage.
- Use **Save or share original** on a book to export it through the iOS share sheet.
- Keep original book files. Removing Leaf or its LiveContainer data container
  removes that library; updates should use the existing container.
- For another build, open **Actions → Build Leaf IPA → Run workflow**. Source
  changes also start a build automatically.

The workflow verifies the reader, compiles an arm64 iPhone app on GitHub's Mac
runner, and checks the IPA archive. Actual device behavior and LiveContainer
compatibility still need an on-device check after the first build.
