'use client';

import { useEffect, useRef, useState } from 'react';
import Reader from '@/components/reader';
import { prepareEpub } from '@/lib/book-files';
import { getFile, type LibraryBook } from '@/lib/library';
import { EnginePositionController } from '@/lib/reader-engine/controller';
import { PositionDiagnostics } from '@/lib/reader-engine/diagnostics';
import {
  captureEpubTextAnchor,
  recoverEpubCfi,
  verifyEpubTextAnchor,
} from '@/lib/reader-engine/epub-text-anchor';
import {
  getEnginePosition,
  putEnginePosition,
} from '@/lib/reader-engine/storage';
import type { EnginePosition } from '@/lib/reader-engine/types';

type Props = {
  book: LibraryBook;
  onClose: () => void;
  onUpdate: (book: LibraryBook) => void;
};

type PreparedReader = {
  book: LibraryBook;
  controller?: EnginePositionController;
};

export default function EngineBetaReader({ book, onClose, onUpdate }: Props) {
  // The component is keyed by book id in the library screen. Keep the opening
  // snapshot stable while Reader reports progress updates back to its parent;
  // otherwise every save would restart this preparation effect.
  const openingBook = useRef(book);
  const [prepared, setPrepared] = useState<PreparedReader>();
  const [error, setError] = useState('');

  useEffect(() => {
    const book = openingBook.current;
    let cancelled = false;
    const prepare = async () => {
      if (book.format !== 'epub') {
        setPrepared({ book });
        return;
      }
      try {
        const diagnostics = await PositionDiagnostics.create(book.id);
        const controller = new EnginePositionController(book.id, diagnostics);
        const stored = await getEnginePosition(book.id);
        controller.seed(stored);
        if (!stored) {
          if (!cancelled) setPrepared({ book, controller });
          return;
        }

        const operationId = crypto.randomUUID();
        const startedAt = performance.now();
        await diagnostics.record({
          type: 'restore.attempt',
          operationId,
          source: 'open',
          position: stored,
          result: 'success',
          startedAt,
        });

        const [{ Book: EpubBook }, file] = await Promise.all([
          import('epubjs'),
          getFile(book.id),
        ]);
        const document = new EpubBook({ replacements: 'blobUrl' });
        let resolved: EnginePosition | undefined;
        try {
          await document.open(
            await prepareEpub(await file.arrayBuffer()),
            'binary',
          );
          await document.ready;
          if (await verifyEpubTextAnchor(document, stored.cfi, stored.quote)) {
            resolved = stored;
            await diagnostics.record({
              type: 'restore.verify',
              operationId,
              source: 'open',
              position: stored,
              result: 'success',
              startedAt,
            });
          } else {
            await diagnostics.record({
              type: 'restore.verify',
              operationId,
              source: 'open',
              position: stored,
              result: 'mismatch',
              reason: 'cfi-text-mismatch',
              startedAt,
            });
            const recoveredCfi = await recoverEpubCfi(
              document,
              stored.spineHref,
              stored.quote,
            );
            if (recoveredCfi) {
              const captured = await captureEpubTextAnchor(
                document,
                recoveredCfi,
              );
              resolved = {
                ...stored,
                cfi: recoveredCfi,
                spineHref: captured.spineHref,
                quote: captured.quote,
                revision: stored.revision + 1,
                capturedAt: new Date().toISOString(),
              };
              controller.seed(resolved);
              await putEnginePosition(resolved);
              await diagnostics.record({
                type: 'restore.recover',
                operationId,
                source: 'open',
                position: resolved,
                result: 'recovered',
                reason: 'text-quote-match',
                startedAt,
              });
            }
          }
        } finally {
          document.destroy();
        }

        if (resolved) {
          await diagnostics.record({
            type: 'restore.commit',
            operationId,
            source: 'open',
            position: resolved,
            result: 'success',
            startedAt,
          });
        } else {
          await diagnostics.record({
            type: 'restore.reject',
            operationId,
            source: 'open',
            position: stored,
            result: 'rejected',
            reason: 'quote-not-found',
            startedAt,
          });
        }

        if (!cancelled) {
          setPrepared({
            controller,
            book: resolved
              ? {
                  ...book,
                  position: {
                    ...book.position,
                    location: resolved.cfi,
                    progress: Math.round(resolved.progression * 100),
                  },
                }
              : book,
          });
        }
      } catch (cause) {
        if (!cancelled)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Engine V2 could not prepare this book.',
          );
      }
    };
    void prepare();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error)
    return (
      <main className="engine-beta-loading" role="alert">
        <h1>Engine V2 could not open this book</h1>
        <p>{error}</p>
        <button className="primary" onClick={onClose}>
          Return to beta library
        </button>
      </main>
    );
  if (!prepared)
    return (
      <main className="engine-beta-loading">
        <p>Verifying your exact reading position…</p>
      </main>
    );

  return (
    <Reader
      book={prepared.book}
      onUpdate={onUpdate}
      enginePositionController={prepared.controller}
      onClose={() => {
        if (prepared.controller)
          void prepared.controller.flush().finally(onClose);
        else onClose();
      }}
    />
  );
}
