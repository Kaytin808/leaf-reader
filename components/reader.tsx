'use client';
/* oxlint-disable react/react-compiler -- Effects synchronize imperative document renderers and browser preferences; React compiler is not enabled. */
import { useEffect, useRef, useState, useCallback } from 'react';
import type { Book, Rendition } from 'epubjs';
import type { Location } from 'epubjs/types/rendition';
import type { PDFDocumentProxy, PDFDocumentLoadingTask } from 'pdfjs-dist';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark as BookmarkIcon,
  Check,
  List,
  Minus,
  Plus,
  Settings2,
  X,
  LoaderCircle,
  Trash2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import {
  getFile,
  updateBook,
  errorMessage,
  type LibraryBook,
  type Position,
} from '@/lib/library';
import { prepareEpub, splitText } from '@/lib/book-files';
import {
  CHAPTER_HISTORY_VERSION,
  chapterIndex,
  positionForEpub,
  type Chapter,
} from '@/lib/chapters';
import { ThemeButtons, useAppTheme } from '@/components/theme-provider';

type Props = {
  book: LibraryBook;
  onClose: () => void;
  onUpdate: (book: LibraryBook) => void;
};
type Theme = 'paper' | 'sepia' | 'night';
// EPUB.js resolves display/reportLocation before the animation-frame relocation event.
function reportLatestLocation(r: Rendition) {
  return new Promise<Location>((resolve, reject) => {
    const received = (location: Location) => {
      clearTimeout(timer);
      r.off('relocated', received);
      resolve(location);
    };
    const timer = setTimeout(() => {
      r.off('relocated', received);
      reject(new Error('Location reporting timed out'));
    }, 4000);
    r.on('relocated', received);
    void r.reportLocation().catch((error) => {
      clearTimeout(timer);
      r.off('relocated', received);
      reject(error);
    });
  });
}
const palette = {
  paper: { bg: '#ffffff', fg: '#243349' },
  sepia: { bg: '#f7eddc', fg: '#443b30' },
  night: { bg: '#182332', fg: '#dbe3ef' },
};
export default function Reader({ book, onClose, onUpdate }: Props) {
  const appTheme = useAppTheme();
  const initial = useRef(book);
  const callback = useRef(onUpdate);
  useEffect(() => {
    callback.current = onUpdate;
  }, [onUpdate]);
  const mount = useRef<HTMLDivElement>(null);
  const epub = useRef<Book | null>(null);
  const rendition = useRef<Rendition | null>(null);
  const pdf = useRef<PDFDocumentProxy | null>(null);
  const current = useRef<Position>(book.position);
  const [position, setPosition] = useState(book.position);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState('Place saved');
  const [page, setPage] = useState(
    Math.max(1, Number(book.position.location) || 1),
  );
  const [total, setTotal] = useState(0);
  const [textPages, setTextPages] = useState<string[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [panel, setPanel] = useState<
    'settings' | 'bookmarks' | 'chapters' | null
  >(null);
  const [theme, setTheme] = useState<Theme>('paper');
  const [fontSize, setFontSize] = useState(20);
  const [zoom, setZoom] = useState(1);
  const [pageInput, setPageInput] = useState('');
  const [atStart, setAtStart] = useState(false);
  const [atEnd, setAtEnd] = useState(false);
  const [turning, setTurning] = useState(false);
  const [closing, setClosing] = useState(false);
  const requestedCfi = useRef<string | undefined>(undefined);
  const navigationPending = useRef(false);
  useEffect(() => {
    if (appTheme.ready) setTheme(appTheme.theme === 'dark' ? 'night' : 'paper');
  }, [appTheme.theme, appTheme.ready]);
  const settings = useRef({ theme, fontSize });
  useEffect(() => {
    settings.current = { theme, fontSize };
  }, [theme, fontSize]);
  const writeQueue = useRef<Promise<unknown>>(Promise.resolve());
  const save = useCallback((next: Position) => {
    current.current = next;
    setPosition(next);
    setSaveState('Saving…');
    writeQueue.current = writeQueue.current
      .catch(() => {})
      .then(async () => {
        const updated = await updateBook(initial.current.id, {
          position: next,
          lastRead: Date.now(),
          ...(initial.current.format === 'epub'
            ? { chapterHistoryVersion: CHAPTER_HISTORY_VERSION }
            : {}),
        });
        callback.current(updated);
        setSaveState('Place saved');
      })
      .catch(() => {
        setSaveState('Could not save — check storage');
      });
  }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem('leaf-reading-settings') || '{}',
      );
      if (saved.fontSize >= 14 && saved.fontSize <= 32)
        setFontSize(saved.fontSize);
    } catch {
      /* Optional preferences. */
    }
    let cancelled = false;
    let loadingTask: PDFDocumentLoadingTask | undefined;
    let localBook: Book | undefined;
    const timer = setTimeout(() => {
      if (!cancelled)
        setError(
          'This book is taking too long to open. Return to the library and try a smaller or different file.',
        );
    }, 45000);
    async function open() {
      try {
        const file = await getFile(initial.current.id);
        if (cancelled) return;
        if (initial.current.format === 'txt') {
          const text = (await file.text()).replace(/\r\n?/g, '\n');
          const parts = splitText(text);
          if (cancelled) return;
          setTextPages(parts);
          setTotal(parts.length);
          setPage(
            Math.min(
              parts.length,
              Math.max(1, Number(initial.current.position.location) || 1),
            ),
          );
          setLoading(false);
        } else if (initial.current.format === 'pdf') {
          const pdfjs = await import('pdfjs-dist');
          const worker =
            await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
          pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
          if (cancelled) return;
          loadingTask = pdfjs.getDocument({
            data: await file.arrayBuffer(),
            cMapUrl: '/pdf-assets/cmaps/',
            cMapPacked: true,
            standardFontDataUrl: '/pdf-assets/standard_fonts/',
            wasmUrl: '/pdf-assets/wasm/',
          });
          loadingTask.onPassword = () => {
            if (!cancelled) {
              setError(
                'Password-protected PDFs are not supported in this prototype. Import an unlocked copy.',
              );
              setLoading(false);
            }
            void loadingTask?.destroy();
          };
          const document = await loadingTask.promise;
          if (cancelled) {
            await loadingTask.destroy();
            return;
          }
          pdf.current = document;
          setTotal(document.numPages);
          setPage(
            Math.min(
              document.numPages,
              Math.max(1, Number(initial.current.position.location) || 1),
            ),
          );
          setLoading(false);
        } else {
          const [{ Book: EpubBook }, bytes] = await Promise.all([
            import('epubjs'),
            prepareEpub(await file.arrayBuffer()),
          ]);
          if (cancelled || !mount.current) return;
          localBook = new EpubBook({ replacements: 'blobUrl' });
          epub.current = localBook;
          await localBook.open(bytes, 'binary');
          await localBook.ready;
          if (cancelled || !mount.current) return;
          const indexedChapters = await chapterIndex(localBook);
          if (cancelled || !mount.current) return;
          setChapters(indexedChapters);
          requestedCfi.current = initial.current.position.location || undefined;
          const r = localBook.renderTo(mount.current, {
            width: '100%',
            height: '100%',
            spread: 'none',
            flow: 'paginated',
            allowScriptedContent: false,
          });
          rendition.current = r;
          const colors = palette[settings.current.theme];
          r.themes.default({
            body: {
              color: `${colors.fg} !important`,
              background: `${colors.bg} !important`,
              'font-family': 'Georgia, serif !important',
              'line-height': '1.7 !important',
            },
            p: { 'font-size': 'inherit !important' },
          });
          r.themes.fontSize(`${settings.current.fontSize}px`);
          r.on('relocated', (loc: Location) => {
            if (cancelled || navigationPending.current) return;
            setAtStart(loc.atStart);
            setAtEnd(loc.atEnd);
            let sectionCount = 0;
            localBook?.spine.each(() => {
              sectionCount++;
            });
            save(
              positionForEpub(
                loc,
                indexedChapters,
                sectionCount,
                requestedCfi.current,
              ),
            );
          });
          r.on('displayError', () => {
            if (!cancelled)
              setError(
                'This part of the EPUB could not be displayed. Try a different chapter.',
              );
          });
          r.on('keydown', (event: KeyboardEvent) => {
            if (event.key === 'ArrowRight') {
              event.preventDefault();
              void turnRef.current(1);
            }
            if (event.key === 'ArrowLeft') {
              event.preventDefault();
              void turnRef.current(-1);
            }
          });
          try {
            await r.display(initial.current.position.location || undefined);
          } catch {
            await r.display();
          }
          if (!cancelled) setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(errorMessage(e));
          setLoading(false);
        }
      } finally {
        clearTimeout(timer);
      }
    }
    void open();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      rendition.current = null;
      epub.current = null;
      pdf.current = null;
      if (localBook) {
        try {
          localBook.destroy();
        } catch {
          /* Partially opened book. */
        }
      }
      if (loadingTask) void loadingTask.destroy();
    };
  }, [save]);

  useEffect(() => {
    try {
      localStorage.setItem(
        'leaf-reading-settings',
        JSON.stringify({ theme, fontSize }),
      );
    } catch {
      /* Reading still works without preferences. */
    }
    const r = rendition.current;
    if (r) {
      const previous = current.current.location;
      r.themes.override('color', palette[theme].fg, true);
      r.themes.override('background', palette[theme].bg, true);
      r.themes.fontSize(`${fontSize}px`);
      if (previous) void r.display(previous).catch(() => {});
    }
  }, [theme, fontSize]);

  useEffect(() => {
    if (book.format === 'epub' || loading || !total) return;
    save({
      location: String(page),
      label: `Page ${page} of ${total}`,
      progress: Math.round((page / total) * 100),
    });
    setAtStart(page <= 1);
    setAtEnd(page >= total);
    setPageInput(String(page));
    mount.current?.scrollTo(0, 0);
  }, [page, total, loading, book.format, save]);

  useEffect(() => {
    if (book.format !== 'pdf' || !pdf.current || !mount.current || loading)
      return;
    const container = mount.current;
    let cancelled = false;
    let renderTask:
      | { cancel: () => void; promise: Promise<unknown> }
      | undefined;
    let resizeTimer: ReturnType<typeof setTimeout>;
    const render = async () => {
      try {
        if (!pdf.current) return;
        const documentPage = await pdf.current.getPage(page);
        if (cancelled) return;
        renderTask?.cancel();
        const base = documentPage.getViewport({ scale: 1 });
        const width = Math.min(container.clientWidth - 32, 920) * zoom;
        const viewport = documentPage.getViewport({
          scale: width / base.width,
        });
        const pixelRatio = Math.min(
          window.devicePixelRatio || 1,
          2,
          Math.sqrt(12000000 / (viewport.width * viewport.height)),
        );
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        canvas.setAttribute('aria-label', `Page ${page} of ${total}`);
        canvas.setAttribute('role', 'img');
        container.replaceChildren(canvas);
        renderTask = documentPage.render({
          canvas,
          viewport,
          transform:
            pixelRatio !== 1 ? [pixelRatio, 0, 0, pixelRatio, 0, 0] : undefined,
        });
        await renderTask.promise;
      } catch (e) {
        if (!cancelled && (e as Error).name !== 'RenderingCancelledException')
          setError('This PDF page could not be rendered. Try another page.');
      }
    };
    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => void render(), 120);
    });
    observer.observe(container);
    void render();
    return () => {
      cancelled = true;
      observer.disconnect();
      clearTimeout(resizeTimer);
      renderTask?.cancel();
    };
  }, [page, total, loading, zoom, book.format]);

  useEffect(() => {
    if (book.format !== 'epub' || !mount.current) return;
    let timer: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (mount.current && rendition.current)
          rendition.current.resize(
            mount.current.clientWidth,
            mount.current.clientHeight,
          );
      }, 150);
    });
    observer.observe(mount.current);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [book.format]);

  async function turn(direction: -1 | 1) {
    if (loading || turning || closing || navigationPending.current) return;
    setError('');
    requestedCfi.current = undefined;
    if (book.format === 'epub') {
      setTurning(true);
      navigationPending.current = true;
      try {
        await (direction > 0
          ? rendition.current?.next()
          : rendition.current?.prev());
        if (rendition.current) {
          const location = await reportLatestLocation(rendition.current);
          persistEpubLocation(location);
          await writeQueue.current;
        }
      } catch {
        setError('Could not turn this page. Try the chapter list.');
      } finally {
        navigationPending.current = false;
        setTurning(false);
      }
    } else setPage((p) => Math.max(1, Math.min(total, p + direction)));
  }
  const turnRef = useRef(turn);
  useEffect(() => {
    turnRef.current = turn;
  });
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (
        panel ||
        (event.target instanceof HTMLElement &&
          ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(
            event.target.tagName,
          ))
      )
        return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        void turnRef.current(1);
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        void turnRef.current(-1);
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [panel]);

  const marked = book.bookmarks.some(
    (mark) => mark.location === position.location,
  );
  async function toggleBookmark() {
    if (
      !position.location ||
      loading ||
      turning ||
      closing ||
      navigationPending.current
    )
      return;
    try {
      await writeQueue.current;
      const bookmarks = marked
        ? book.bookmarks.filter((m) => m.location !== position.location)
        : [
            ...book.bookmarks,
            {
              ...position,
              id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              createdAt: Date.now(),
            },
          ];
      callback.current(await updateBook(book.id, { bookmarks }));
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function goTo(location: string) {
    if (navigationPending.current || closing) return;
    setError('');
    setPanel(null);
    try {
      if (book.format === 'epub' && rendition.current) {
        setTurning(true);
        navigationPending.current = true;
        requestedCfi.current = location.startsWith('epubcfi(')
          ? location
          : undefined;
        await rendition.current.display(location);
        const reported = await reportLatestLocation(rendition.current);
        persistEpubLocation(reported, requestedCfi.current);
        await writeQueue.current;
      } else setPage(Math.max(1, Math.min(total, Number(location) || 1)));
    } catch {
      setError('This saved location could not be opened.');
    } finally {
      navigationPending.current = false;
      setTurning(false);
    }
  }
  function persistEpubLocation(location: Location, target?: string) {
    let sectionCount = 0;
    epub.current?.spine.each(() => sectionCount++);
    setAtStart(location.atStart);
    setAtEnd(location.atEnd);
    save(positionForEpub(location, chapters, sectionCount, target));
  }
  async function closeReader() {
    if (closing || turning || navigationPending.current) return;
    setClosing(true);
    try {
      if (rendition.current && !loading) {
        navigationPending.current = true;
        persistEpubLocation(
          await reportLatestLocation(rendition.current),
          requestedCfi.current,
        );
      }
      await writeQueue.current;
      onClose();
    } catch {
      setError(
        'Your current place has not finished saving. Please try returning to the library again.',
      );
    } finally {
      navigationPending.current = false;
      setClosing(false);
    }
  }

  return (
    <div className={`reader reader-${theme}`}>
      <header className="reader-header">
        <button
          className="icon-button"
          onClick={() => void closeReader()}
          disabled={closing || turning}
          aria-label="Back to library"
          title="Back to library"
        >
          <ArrowLeft size={21} />
        </button>
        <div className="reader-book-title">
          <h1>{book.title}</h1>
          <p>{book.author}</p>
        </div>
        <div className="reader-tools">
          <ThemeButtons />
          {book.format === 'epub' && (
            <button
              className="icon-button"
              aria-label="Chapters"
              title="Chapters"
              disabled={loading}
              onClick={() => setPanel('chapters')}
            >
              <List size={20} />
            </button>
          )}
          <button
            className={`icon-button ${marked ? 'is-marked' : ''}`}
            aria-label={marked ? 'Remove bookmark here' : 'Bookmark this page'}
            title={marked ? 'Remove bookmark here' : 'Bookmark this page'}
            disabled={loading || !position.location}
            onClick={() => void toggleBookmark()}
          >
            <BookmarkIcon size={20} fill={marked ? 'currentColor' : 'none'} />
          </button>
          <button
            className="icon-button"
            aria-label="Reading settings"
            title="Reading settings"
            onClick={() => setPanel('settings')}
          >
            <Settings2 size={20} />
          </button>
        </div>
      </header>
      {error && (
        <div className="reader-error" role="alert">
          {error}
          <button
            className="icon-button"
            aria-label="Dismiss error"
            onClick={() => setError('')}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <div
        className={`reading-area ${book.format === 'txt' ? 'text-area' : book.format === 'pdf' ? 'pdf-area' : 'epub-area'}`}
        ref={mount}
        style={{ background: palette[theme].bg, color: palette[theme].fg }}
      >
        {book.format === 'txt' && !loading && (
          <article className="text-page" style={{ fontSize }}>
            <p className="chapter-kicker">{book.title}</p>
            {textPages[page - 1]?.split(/\n\n+/).map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </article>
        )}
      </div>
      {loading && !error && (
        <output className="reader-loading">
          <LoaderCircle className="spin" />
          <span>Opening your book…</span>
        </output>
      )}
      <div className="reader-bottom">
        <Progress aria-label="Reading progress" value={position.progress} />
        <div className="reader-navigation">
          <button
            className="icon-button"
            aria-label="Previous page"
            disabled={loading || turning || atStart}
            onClick={() => void turn(-1)}
          >
            <ArrowLeft size={21} />
          </button>
          <div className="reading-position">
            {book.format !== 'epub' && total > 0 ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void goTo(pageInput);
                }}
              >
                <label>
                  Page{' '}
                  <input
                    aria-label="Go to page"
                    type="number"
                    min={1}
                    max={total}
                    value={pageInput}
                    onChange={(e) => setPageInput(e.target.value)}
                  />{' '}
                  of {total}
                </label>
                <button type="submit" className="text-button">
                  Go
                </button>
              </form>
            ) : (
              <span>{loading ? 'Getting ready' : position.label}</span>
            )}
            <small>
              <Check size={12} />
              {saveState} <span>· {position.progress}%</span>
            </small>
          </div>
          <button
            className="icon-button"
            aria-label="Next page"
            disabled={loading || turning || atEnd}
            onClick={() => void turn(1)}
          >
            <ArrowRight size={21} />
          </button>
        </div>
        <button
          className="saved-places-button"
          onClick={() => setPanel('bookmarks')}
        >
          <BookmarkIcon size={14} /> Saved places
          {book.bookmarks.length > 0 ? ` · ${book.bookmarks.length}` : ''}
        </button>
      </div>
      <Dialog
        open={panel !== null}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
      >
        <DialogContent className="reader-dialog">
          <DialogTitle>
            {panel === 'settings'
              ? 'Make it your kind of reading'
              : panel === 'chapters'
                ? 'Contents'
                : 'Your saved places'}
          </DialogTitle>
          <DialogDescription>
            {panel === 'settings'
              ? 'A little adjustment goes a long way.'
              : panel === 'chapters'
                ? 'Jump to a chapter in this book.'
                : 'Bookmarks for this book, ready when you are.'}
          </DialogDescription>
          {panel === 'settings' && (
            <div className="settings-list">
              <label htmlFor="page-color">
                Page color
                <Select
                  value={theme}
                  onValueChange={(value) => {
                    if (value) {
                      setTheme(value as Theme);
                      if (value !== 'sepia')
                        appTheme.setTheme(value === 'night' ? 'dark' : 'light');
                    }
                  }}
                >
                  <SelectTrigger id="page-color">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paper">Paper</SelectItem>
                    <SelectItem value="sepia">Sepia</SelectItem>
                    <SelectItem value="night">Night</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              {book.format !== 'pdf' ? (
                <div className="setting-row">
                  <span>Text size</span>
                  <div>
                    <button
                      className="icon-button"
                      disabled={fontSize <= 14}
                      aria-label="Smaller text"
                      onClick={() => setFontSize((s) => s - 2)}
                    >
                      <Minus size={17} />
                    </button>
                    <span>{fontSize}px</span>
                    <button
                      className="icon-button"
                      disabled={fontSize >= 32}
                      aria-label="Larger text"
                      onClick={() => setFontSize((s) => s + 2)}
                    >
                      <Plus size={17} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="setting-row">
                  <span>PDF zoom</span>
                  <div>
                    <button
                      className="icon-button"
                      disabled={zoom <= 0.75}
                      aria-label="Zoom out"
                      onClick={() => setZoom((s) => s - 0.25)}
                    >
                      <Minus size={17} />
                    </button>
                    <span>{Math.round(zoom * 100)}%</span>
                    <button
                      className="icon-button"
                      disabled={zoom >= 2.5}
                      aria-label="Zoom in"
                      onClick={() => setZoom((s) => s + 0.25)}
                    >
                      <Plus size={17} />
                    </button>
                  </div>
                </div>
              )}
              <p className="settings-note">
                {book.format === 'pdf'
                  ? 'PDF pages keep their original colors and layout.'
                  : 'Your reading position stays anchored when you resize the text.'}
              </p>
            </div>
          )}
          {panel === 'chapters' && (
            <div className="chapter-list">
              {chapters.length ? (
                chapters.map((chapter, i) => (
                  <button
                    key={i}
                    style={{
                      paddingLeft: 12 + Math.min(chapter.depth, 4) * 14,
                    }}
                    onClick={() => void goTo(chapter.cfi)}
                    aria-current={
                      position.chapterCfi === chapter.cfi
                        ? 'location'
                        : undefined
                    }
                  >
                    {chapter.label || `Chapter ${i + 1}`}
                    <ArrowRight size={15} />
                  </button>
                ))
              ) : (
                <p>No table of contents in this EPUB.</p>
              )}
            </div>
          )}
          {panel === 'bookmarks' && (
            <div className="bookmark-list">
              {book.bookmarks.length ? (
                book.bookmarks.map((mark) => (
                  <div key={mark.id}>
                    <button onClick={() => void goTo(mark.location)}>
                      <BookmarkIcon size={17} />
                      <span>
                        {mark.label}
                        <small>{mark.progress}% through</small>
                      </span>
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Delete bookmark ${mark.label}`}
                      onClick={async () => {
                        try {
                          callback.current(
                            await updateBook(book.id, {
                              bookmarks: book.bookmarks.filter(
                                (m) => m.id !== mark.id,
                              ),
                            }),
                          );
                        } catch (e) {
                          setError(errorMessage(e));
                        }
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))
              ) : (
                <p>
                  No bookmarks yet. Tap the bookmark icon while you read to save
                  a place.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
