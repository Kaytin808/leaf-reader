# Kayla's Library Engine Beta — Milestone 1

This beta installs beside Kayla's Library. It uses bundle id
`com.kaytin808.leafreader.enginebeta`, legacy-beta database
`leaf-library-engine-beta`, and Engine V2 database `leaf-reader-engine-v2`.
It does not share books, positions, bookmarks, or settings with the stable app.

With the **Engine V2** switch off, the V2 reader is not mounted and its database
is not opened or read. The switch defaults to off.

## What Milestone 1 tests

Milestone 1 replaces only the position authority with an EPUB CFI plus a
text-quote recovery anchor. Page navigation remains on the stable reader path;
the single navigation queue is Milestone 2 and is not enabled here.

## Diagnostics export format

The library's **Export log** button shares a JSON file with this shape:

```json
{
  "schemaVersion": 1,
  "sessionId": "random UUID for this reading session",
  "exportedAt": "ISO-8601 timestamp",
  "app": {
    "version": "0.1.13-engine-beta.1",
    "engine": "v2-position",
    "featureFlagEnabled": true
  },
  "book": {
    "bookIdHash": "SHA-256 hash",
    "format": "epub"
  },
  "events": [
    {
      "sequence": 1,
      "timestamp": "ISO-8601 timestamp",
      "type": "position.capture | position.persist | restore.attempt | restore.verify | restore.recover | restore.commit | restore.reject",
      "operationId": "UUID joining events from one operation",
      "source": "open | page-turn | close | viewport | font-change",
      "revision": 1,
      "spineHrefHash": "SHA-256 hash",
      "cfi": "exact EPUB CFI",
      "quote": {
        "exactHash": "SHA-256 hash",
        "prefixHash": "SHA-256 hash",
        "suffixHash": "SHA-256 hash",
        "exactLength": 96
      },
      "layoutSignature": {
        "viewportWidth": 390,
        "viewportHeight": 664,
        "fontSize": 20,
        "fontFamily": "publisher",
        "lineHeight": 1.55,
        "margin": "comfortable",
        "flow": "paginated"
      },
      "result": "success | mismatch | recovered | rejected",
      "reason": null,
      "durationMs": 12
    }
  ]
}
```

`revision` identifies the newest authoritative position. `cfi` is retained
because it is required to diagnose pagination. Book identity, spine filenames,
and the text quote itself are hashed; no title, author, file path, filename, or
raw book text is exported.

## On-device test

1. Keep the stable app installed and sideload this beta separately.
2. Open the beta and confirm the flask button says **Legacy engine**.
3. Import a DRM-free EPUB into the beta. This is a separate copy by design.
4. Tap the flask and enable **Engine V2**.
5. Open the EPUB, turn forward at least five pages, and note a distinctive
   sentence on the final page.
6. Return to the library, reopen the book, and confirm the same sentence/page.
7. Change font size, turn forward twice, return to the library, and reopen.
   Confirm the latest sentence is restored rather than an earlier page.
8. Optionally repeat one close/reopen after entering and leaving Focus Mode.
9. Return to the library, tap **Export log**, and send the JSON file back for
   Milestone 1 verification.

If anything regresses, turn **Engine V2** off. The beta then uses its isolated
copy of the stable reader path; your installed stable app is unaffected.
