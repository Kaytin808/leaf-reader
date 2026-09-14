# Kayla's Library Engine Beta — Milestone 2

Milestone 2 adds one FIFO navigation queue to the isolated Engine V2 path.
The queue serializes initial restoration, forward/back page turns, chapter and
bookmark jumps, font reflow, viewport reflow, and the final close report. It
waits for the resulting V2 position to settle before starting another command.

The stable app is unchanged. In this beta, turning Engine V2 off bypasses the
queue and calls the existing legacy operation directly. Focus and normal mode
both call the same page-turn function; Focus does not mount another rendition.
Chapter-boundary CFIs are also covered: when a chapter begins with a short
heading, V2 keeps the exact CFI and finds the next readable text for its recovery
quote instead of silently retaining the prior section's position.

## Diagnostics schema

The export retains the Milestone 1 fields and identifies this build as:

```json
{
  "schemaVersion": 1,
  "app": {
    "version": "0.1.13-engine-beta.2",
    "engine": "v2-position-navigation",
    "featureFlagEnabled": true
  }
}
```

Navigation operations add these event types:

```text
navigation.enqueue
navigation.start
navigation.complete
navigation.fail
```

Each navigation event retains the normal hashed position fields and adds:

```json
{
  "navigation": {
    "kind": "restore | turn | jump | font-reflow | viewport-reflow | close",
    "direction": "-1 | 1 | null",
    "sequence": 4,
    "queueDepthAtEnqueue": 1,
    "waitMs": 0,
    "operationDurationMs": 18
  }
}
```

- `sequence` is the authoritative FIFO operation number.
- `queueDepthAtEnqueue` shows how many operations were waiting, including this
  operation.
- `waitMs` measures time spent waiting for an earlier operation.
- `operationDurationMs` includes epub.js navigation and the resulting V2
  position settlement.
- `navigation.enqueue` and `navigation.start` describe the position before the
  operation. `navigation.complete` describes the settled position afterward.
- `navigation.fail` means the epub.js operation failed. A diagnostics-export
  failure itself never blocks navigation.

As before, no title, author, filename, path, or raw book text is exported.

## On-device acceptance test

Use the same EPUB already imported into Engine Beta.

### Session A

1. Confirm Engine V2 is on and open the EPUB.
2. In normal mode, turn forward three pages at a comfortable pace.
3. Enter Focus Mode and turn forward four pages.
4. Turn backward three pages while still in Focus Mode.
5. Exit Focus Mode and turn forward once.
6. Open a saved highlight/bookmark or chapter to exercise one jump.
7. Change font size once, wait for fitting to finish, and turn forward twice.
8. Close the reader, then export and save the first JSON log.

### Session B

1. Reopen the same EPUB and confirm the exact last passage from Session A.
2. Turn forward once, then backward once.
3. Close the reader and export the second JSON log.

Send both logs for verification. The exporter currently keeps the latest reader
session, so exporting after Session A is necessary before reopening.

Acceptance requires monotonically increasing navigation sequences, one
`enqueue → start → complete` chain per operation, no overlapping starts, exact
CFI/quote persistence, correct forward/back movement, a font-reflow event, and
an exact Session B restore.
