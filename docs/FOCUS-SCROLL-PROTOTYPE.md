# Kayla's Focus Scroll — throwaway prototype

This build exists only to compare two reading experiences before Milestone 3
is designed. It is not production Engine V2 code.

- Normal reading remains the stable v0.1.13 paginated reader.
- Entering Focus captures the live rendition's raw start CFI, expands the
  reading area inside the iPhone safe areas, switches the same rendition to
  `scrolled-doc`, and explicitly displays that raw CFI.
- Exiting Focus captures the current scrolled CFI, restores `paginated`, and
  explicitly displays the captured CFI in the normal toolbar-sized viewport.
- Side taps and arrow-key page turns are disabled while Focus scrolling is
  active so a tap cannot accidentally skip to another EPUB section.
- The experiment does not import or call Engine V2's navigation queue, position
  authority, or layout cache.

epub.js `scrolled-doc` scrolls continuously within the current EPUB spine
section. At a section boundary, exit Focus and use the normal next page or
chapter controls. Crossing book sections automatically is outside this small
prototype.

## What to test

1. Open a reflowable EPUB in normal mode and confirm normal page turns are
   unchanged.
2. Remember the first sentence on the current normal page, then enter Focus.
   Confirm Focus begins at that sentence rather than an earlier page.
3. Scroll slowly, rapidly, and with momentum. Confirm the page stays below the
   iPhone status bar and above the home indicator.
4. Stop on a distinctive sentence, exit Focus, and confirm the paginated page
   contains that sentence without returning to an older saved page.
5. Repeat entry and exit five times at different positions.
6. Try selecting/highlighting text and opening an illustration while scrolled.
7. Reach the end of the current section and decide whether requiring a return
   to normal mode feels acceptable for this experiment.

Report whether scrolling feels better than page turns, whether entry lands at
the expected sentence, and whether exit returns to the correct normal page.
