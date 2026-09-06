# Kayla’s Library

A local web prototype for a personal book reader. Open EPUB, PDF and UTF-8 TXT files, keep a library in IndexedDB, save bookmarks, resume reading, and track active reading time for each book.

## Run locally

Requires Node.js 22.13 or newer.

    npm install
    npm run dev

Open http://localhost:3000. Choose **Import books**, or open the original short sample.

## iPhone app and GitHub IPA build

The Capacitor iOS project bundles the same reader for iOS/iPadOS 17+.
`npm run ios:sync` builds the standalone assets and copies them into the iOS
project. The installed app does not depend on the local web server.

Push this project to a GitHub repository. The **Build Kayla's Library IPA** workflow tests
the reader on Linux, then builds an unsigned arm64 IPA on a Mac runner using
Xcode 26.3. You can also run it from **Actions → Build Kayla's Library IPA → Run workflow**.
Download the **Kaylas-Library-unsigned-<build number>** artifact from the successful run.
The workflow has read-only repository permissions and needs no Apple secrets.
Your account's normal GitHub Actions usage limits apply.

See [iPhone installation instructions](docs/INSTALL-IOS.md) for LiveContainer
import and updates. A completed GitHub Mac build and an on-device check are
required before treating an IPA as verified on an iPhone.

Native development on a Mac requires Node 22.13+ and Xcode 26+:

    npm ci
    npm run ios:sync
    npm run ios:open

To check the standalone bundle on this computer:

    npm run build:mobile
    npm run verify:mobile
    npm run preview:mobile

## Supported behavior

- Multi-file import and drag/drop, with content-based duplicate detection.
- EPUB title, author and embedded raster cover extraction, including older
  cover-page manifests; PDF title, author, and first-page cover extraction.
- Editable title, author, and cover for every imported book.
- Automatic Open Library cover lookup by title, author, and matching edition;
  successful images are cached with the book. The existing/default cover is
  kept when there is no match or the network is unavailable. The book editor
  also offers **Find cover online** to retry or replace a cover.
- EPUB chapter navigation, exact table-of-contents chapter history, and
  font-independent CFI position bookmarks.
- PDF page navigation, page-number bookmarks and zoom.
- TXT pagination, preserving all characters and stable logical pages.
- Persistent light/dark app controls, plus paper, sepia, and night reader
  themes; EPUB/TXT font-size controls.
- Saved library, reading progress, bookmarks, original-file download and confirmed removal.
- Library search and reading/finished filters.
- EPUB scripts and external navigation disabled; chapter sanitization and restrictive content policies.

Book files are stored only in this browser at this origin. They are not
uploaded or synced between devices. Online cover lookup sends only the title
and author to Open Library. Keep the originals: clearing site data, using
another browser, changing the URL/port, or browser storage eviction can make
the shelf unavailable. The local development server must remain running for
the desktop development preview. The iOS app includes its own offline assets
and keeps a separate library; import your books on the phone as well.

## Limits

100 MB per file; EPUB expansion limited to 250 MB and 6,000 entries. Very large illustrated books can still exceed a phone's memory. DRM-protected books, password-protected PDFs, MOBI/AZW, comic archives, and Word documents are not supported. Convert supported, unprotected source files before importing.

EPUB progress percentages are approximate, based on sections; resumption uses the exact CFI. PDF pages keep their original colors and are canvas-rendered (no text selection or search yet). TXT pages are logical chunks rather than printed pages.

## Validation

    npm test
    npm run typecheck
    npm run build
    npm run build:mobile
    npm run verify:mobile

Tests exercise import validation, EPUB sanitization and the EPUB engine, real
table-of-contents chapter tracking, PDF parsing and pixel rendering, IndexedDB
file/progress/bookmark durability, concurrent metadata updates, and lossless
text pagination. These are automated component-engine/storage tests, not an
iPhone or LiveContainer compatibility certification.

Chapter regressions include several chapter links sharing one file or wrapper,
chapter boundaries on the same displayed page, a chapter continuing across
spine files, and repairs of stale saved labels without changing locations.

Optional WebMCP tools are feature-detected: list_local_books and
open_local_book. They use the same library and reader state and were detected
in the live local preview.
