'use client';
/* oxlint-disable react/react-compiler -- Effects synchronize imperative document renderers and browser preferences; React compiler is not enabled. */
import { useEffect, useRef, useState, useCallback } from 'react';
import type { Book, Rendition } from 'epubjs';
import type { Location } from 'epubjs/types/rendition';
import type Contents from 'epubjs/types/contents';
import type { PDFDocumentProxy, PDFDocumentLoadingTask } from 'pdfjs-dist';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark as BookmarkIcon,
  Check,
  Clock,
  Eye,
  EyeOff,
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
import { Slider } from '@/components/ui/slider';
import {
  getFile,
  updateBook,
  errorMessage,
  epubPageLabel,
  isBookFinished,
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
import { bindReaderTaps } from '@/lib/reader-gestures';
import { ImagePage, PdfPage, ZoomControls } from '@/components/zoom-reader';
import { bindNativeReaderTaps } from '@/lib/native-reader-taps';
import { version } from '@/package.json';
import { ReadingClock, readingTimeStatus } from '@/lib/reading-statistics';
import {
  DEFAULT_READING_PREFERENCES,
  FONT_STACKS,
  LETTER_SPACING,
  LINE_HEIGHTS,
  PAGE_MARGINS,
  normalizeReadingPreferences,
  type ReadingAlignment,
  type ReadingFont,
  type ReadingMargin,
  type ReadingSpacing,
  type ReadingTheme,
} from '@/lib/reading-settings';

type Props = {
  book: LibraryBook;
  onClose: () => void;
  onUpdate: (book: LibraryBook) => void;
};
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
  const mount = useRef<HTMLElement>(null);
  const focusModeButton = useRef<HTMLButtonElement>(null);
  const showControlsButton = useRef<HTMLButtonElement>(null);
  const epub = useRef<Book | null>(null);
  const reflowableEpub = useRef(true);
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
  const chapterData = useRef<Chapter[]>([]);
  const [panel, setPanel] = useState<
    'settings' | 'bookmarks' | 'chapters' | null
  >(null);
  const [theme, setTheme] = useState<ReadingTheme>('paper');
  const [fontSize, setFontSize] = useState(
    DEFAULT_READING_PREFERENCES.fontSize,
  );
  const [font, setFont] = useState<ReadingFont>(
    DEFAULT_READING_PREFERENCES.font,
  );
  const [spacing, setSpacing] = useState<ReadingSpacing>(
    DEFAULT_READING_PREFERENCES.spacing,
  );
  const [margin, setMargin] = useState<ReadingMargin>(
    DEFAULT_READING_PREFERENCES.margin,
  );
  const [alignment, setAlignment] = useState<ReadingAlignment>(
    DEFAULT_READING_PREFERENCES.alignment,
  );
  const [brightness, setBrightness] = useState(
    DEFAULT_READING_PREFERENCES.brightness,
  );
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsVisibleRef = useRef(true);
  const setReaderControls = useCallback((visible: boolean) => {
    controlsVisibleRef.current = visible;
    setControlsVisible(visible);
    requestAnimationFrame(() =>
      (visible ? focusModeButton : showControlsButton).current?.focus({
        preventScroll: true,
      }),
    );
  }, []);
  const toggleControls = useCallback(
    () => setReaderControls(!controlsVisibleRef.current),
    [setReaderControls],
  );
  const [zoom, setZoom] = useState(1);
  const [zoomReset, setZoomReset] = useState(0);
  function changeZoom(value: number) {
    setZoom(value);
    if (value === 1) setZoomReset((key) => key + 1);
  }
  const [picture, setPicture] = useState<{ src: string; alt: string } | null>(
    null,
  );
  const interaction = useRef({ blocked: true });
  const [pageInput, setPageInput] = useState('');
  const [atStart, setAtStart] = useState(false);
  const [atEnd, setAtEnd] = useState(false);
  const [turning, setTurning] = useState(false);
  const [closing, setClosing] = useState(false);
  const readingClock = useRef(new ReadingClock(book.readingTimeMs ?? 0));
  const persistedReadingTime = useRef(book.readingTimeMs ?? 0);
  const finishedReadingTime = useRef(book.finishedReadingTimeMs);
  const completed = useRef(isBookFinished(book));
  const [isCompleted, setIsCompleted] = useState(isBookFinished(book));
  const [readingTime, setReadingTime] = useState(
    book.finishedReadingTimeMs ?? book.readingTimeMs ?? 0,
  );
  const writeQueue = useRef<Promise<unknown>>(Promise.resolve());
  interaction.current.blocked =
    loading || turning || closing || !!panel || !!picture;
  const requestedCfi = useRef<string | undefined>(undefined);
  const navigationPending = useRef(false);
  const previousAppTheme = useRef(appTheme.theme);
  const storedReaderTheme = useRef(false);
  useEffect(() => {
    if (
      appTheme.ready &&
      (!storedReaderTheme.current ||
        previousAppTheme.current !== appTheme.theme)
    )
      setTheme(appTheme.theme === 'dark' ? 'night' : 'paper');
    previousAppTheme.current = appTheme.theme;
  }, [appTheme.theme, appTheme.ready]);
  const settings = useRef({
    theme,
    fontSize,
    font,
    spacing,
    margin,
    alignment,
  });
  useEffect(() => {
    settings.current = { theme, fontSize, font, spacing, margin, alignment };
  }, [theme, fontSize, font, spacing, margin, alignment]);
  const save = useCallback((next: Position, reachedEnd = false) => {
    const now = Date.now();
    const normalized = {
      ...next,
      progress: reachedEnd ? 100 : Math.min(next.progress, 99),
    };
    const elapsed = readingClock.current.capture(now);
    const completing = reachedEnd && !completed.current;
    if (completing) {
      readingClock.current.pause(now);
      completed.current = true;
      setIsCompleted(true);
      finishedReadingTime.current = elapsed;
      setReadingTime(elapsed);
    }
    persistedReadingTime.current = Math.max(
      persistedReadingTime.current,
      elapsed,
    );
    current.current = normalized;
    setPosition(normalized);
    setSaveState('Saving…');
    writeQueue.current = writeQueue.current
      .catch(() => {})
      .then(async () => {
        const updated = await updateBook(initial.current.id, (latest) => {
          const wasFinished = isBookFinished(latest);
          const totalReadingTime = Math.max(latest.readingTimeMs ?? 0, elapsed);
          return {
            position: normalized,
            lastRead: now,
            readingTimeMs: totalReadingTime,
            ...((reachedEnd || wasFinished) && {
              completedAt: latest.completedAt ?? now,
            }),
            ...(completing &&
              !wasFinished && {
                finishedReadingTimeMs: totalReadingTime,
              }),
            ...(initial.current.format === 'epub'
              ? { chapterHistoryVersion: CHAPTER_HISTORY_VERSION }
              : {}),
          };
        });
        completed.current = isBookFinished(updated);
        setIsCompleted(completed.current);
        finishedReadingTime.current = updated.finishedReadingTimeMs;
        callback.current(updated);
        setSaveState('Place saved');
      })
      .catch(() => {
        setSaveState('Could not save — check storage');
      });
  }, []);

  const flushReadingTime = useCallback((pause = false) => {
    const now = Date.now();
    if (pause) readingClock.current.pause(now);
    else readingClock.current.capture(now);
    const elapsed = readingClock.current.totalMs;
    setReadingTime(elapsed);
    if (elapsed <= persistedReadingTime.current || completed.current) return;
    persistedReadingTime.current = elapsed;
    writeQueue.current = writeQueue.current
      .catch(() => {})
      .then(async () => {
        const updated = await updateBook(initial.current.id, (latest) => ({
          readingTimeMs: Math.max(latest.readingTimeMs ?? 0, elapsed),
        }));
        callback.current(updated);
      });
  }, []);

  useEffect(() => {
    if (loading || panel || picture || isCompleted) {
      if (!loading) flushReadingTime(true);
      return;
    }
    const clock = readingClock.current;
    clock.start(Date.now());
    const activity = () => {
      if (document.visibilityState !== 'visible') return;
      clock.activity(Date.now());
      setReadingTime(clock.totalMs);
    };
    const visibility = () => {
      if (document.visibilityState === 'visible') clock.start(Date.now());
      else flushReadingTime(true);
    };
    const interval = window.setInterval(() => {
      clock.capture(Date.now());
      setReadingTime(clock.totalMs);
      if (clock.totalMs - persistedReadingTime.current >= 30_000)
        flushReadingTime();
    }, 10_000);
    document.addEventListener('visibilitychange', visibility);
    const pageHide = () => flushReadingTime(true);
    window.addEventListener('pagehide', pageHide);
    for (const event of ['pointerdown', 'touchstart', 'keydown'] as const)
      window.addEventListener(event, activity, { passive: true });
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', pageHide);
      for (const event of ['pointerdown', 'touchstart', 'keydown'] as const)
        window.removeEventListener(event, activity);
      flushReadingTime(true);
    };
  }, [loading, panel, picture, isCompleted, flushReadingTime]);

  useEffect(() => {
    try {
      const raw = JSON.parse(
        localStorage.getItem('leaf-reading-settings') || '{}',
      );
      storedReaderTheme.current =
        raw &&
        typeof raw === 'object' &&
        ['paper', 'sepia', 'night'].includes(raw.theme);
      const saved = normalizeReadingPreferences(raw);
      setTheme(saved.theme);
      setFontSize(saved.fontSize);
      setFont(saved.font);
      setSpacing(saved.spacing);
      setMargin(saved.margin);
      setAlignment(saved.alignment);
      setBrightness(saved.brightness);
    } catch {
      /* Optional preferences. */
    }
    let cancelled = false;
    let loadingTask: PDFDocumentLoadingTask | undefined;
    let localBook: Book | undefined;
    const contentListeners = new Map<Contents, () => void>();
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
          reflowableEpub.current =
            localBook.packaging.metadata.layout !== 'pre-paginated';
          if (cancelled || !mount.current) return;
          const indexedChapters = await chapterIndex(localBook);
          if (cancelled || !mount.current) return;
          setChapters(indexedChapters);
          chapterData.current = indexedChapters;
          requestedCfi.current = initial.current.position.location || undefined;
          const r = localBook.renderTo(mount.current, {
            width: '100%',
            height: '100%',
            spread: 'none',
            flow: 'paginated',
            allowScriptedContent: false,
          });
          rendition.current = r;
          r.hooks.content.register((contents: Contents) => {
            const doc = contents.document;
            contentListeners.set(
              contents,
              bindReaderTaps(doc, {
                enabled: () => !interaction.current.blocked,
                bounds: () => {
                  // A paginated EPUB iframe can be wider than the visible page.
                  const frame =
                    contents.window.frameElement?.getBoundingClientRect();
                  const area = mount.current?.getBoundingClientRect();
                  return {
                    left: (area?.left ?? 0) - (frame?.left ?? 0),
                    width: area?.width ?? contents.window.innerWidth,
                  };
                },
                turn: (direction) => void turnRef.current(direction),
                center: toggleControls,
                image: (image) => setPicture(image),
              }),
            );
          });
          r.hooks.unloaded.register((view: { contents?: Contents }) => {
            if (view.contents) {
              contentListeners.get(view.contents)?.();
              contentListeners.delete(view.contents);
            }
          });
          const colors = palette[settings.current.theme];
          const typography = reflowableEpub.current
            ? {
                'font-family': `${FONT_STACKS[settings.current.font]} !important`,
                'letter-spacing': `${LETTER_SPACING[settings.current.font]} !important`,
                'line-height': `${LINE_HEIGHTS[settings.current.spacing]} !important`,
                'text-align': `${settings.current.alignment} !important`,
                'padding-left': `${PAGE_MARGINS[settings.current.margin]}px !important`,
                'padding-right': `${PAGE_MARGINS[settings.current.margin]}px !important`,
                'margin-left': '0 !important',
                'margin-right': '0 !important',
                'box-sizing': 'border-box !important',
              }
            : {};
          r.themes.default({
            body: {
              color: `${colors.fg} !important`,
              background: `${colors.bg} !important`,
              ...typography,
            },
            ...(reflowableEpub.current
              ? {
                  p: {
                    'font-size': 'inherit !important',
                    'font-family': 'inherit !important',
                    'letter-spacing': 'inherit !important',
                    'line-height': 'inherit !important',
                    'text-align': 'inherit !important',
                  },
                }
              : {}),
          });
          if (reflowableEpub.current)
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
                settings.current.fontSize,
              ),
              loc.atEnd,
            );
          });
          r.on('displayError', () => {
            if (!cancelled)
              setError(
                'This part of the EPUB could not be displayed. Try a different chapter.',
              );
          });
          r.on('keydown', (event: KeyboardEvent) => {
            if (interaction.current.blocked) return;
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
      for (const dispose of contentListeners.values()) dispose();
      contentListeners.clear();
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
  }, [save, toggleControls]);

  useEffect(() => {
    try {
      localStorage.setItem(
        'leaf-reading-settings',
        JSON.stringify({
          theme,
          fontSize,
          font,
          spacing,
          margin,
          alignment,
          brightness,
        }),
      );
    } catch {
      /* Reading still works without preferences. */
    }
  }, [theme, fontSize, font, spacing, margin, alignment, brightness]);

  useEffect(() => {
    const r = rendition.current;
    if (!r) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const reflow = async () => {
      if (cancelled || rendition.current !== r) return;
      if (navigationPending.current) {
        timer = setTimeout(() => void reflow(), 80);
        return;
      }
      navigationPending.current = true;
      setTurning(true);
      const previous = current.current.location;
      try {
        r.themes.override('color', palette[theme].fg, true);
        r.themes.override('background', palette[theme].bg, true);
        if (reflowableEpub.current) {
          r.themes.override('font-family', FONT_STACKS[font], true);
          r.themes.override('letter-spacing', LETTER_SPACING[font], true);
          r.themes.override('line-height', String(LINE_HEIGHTS[spacing]), true);
          r.themes.override('text-align', alignment, true);
          r.themes.override('padding-left', `${PAGE_MARGINS[margin]}px`, true);
          r.themes.override('padding-right', `${PAGE_MARGINS[margin]}px`, true);
          r.themes.fontSize(`${fontSize}px`);
        }
        if (previous) await r.display(previous);
        const reported = await reportLatestLocation(r);
        if (!cancelled) {
          let count = 0;
          epub.current?.spine.each(() => count++);
          requestedCfi.current = previous;
          setAtStart(reported.atStart);
          setAtEnd(reported.atEnd);
          save(
            positionForEpub(
              reported,
              chapterData.current,
              count,
              previous,
              fontSize,
            ),
            reported.atEnd,
          );
        }
      } catch {
        if (!cancelled)
          setError(
            'Could not finish resizing the text. Try adjusting the text size again.',
          );
      } finally {
        navigationPending.current = false;
        if (rendition.current === r) setTurning(false);
      }
    };
    // Coalesce rapid size changes and only save the final, repaginated location.
    timer = setTimeout(() => void reflow(), 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [theme, fontSize, font, spacing, margin, alignment, save]);

  useEffect(() => {
    if (book.format === 'epub' || loading || !total) return;
    save(
      {
        location: String(page),
        label: `Page ${page} of ${total}`,
        progress: Math.round((page / total) * 100),
      },
      page >= total,
    );
    setAtStart(page <= 1);
    setAtEnd(page >= total);
    setPageInput(String(page));
    mount.current?.scrollTo(0, 0);
  }, [page, total, loading, book.format, save]);

  useEffect(() => {
    if (book.format === 'pdf' || !mount.current) return;
    const area = mount.current;
    return bindReaderTaps(area, {
      enabled: () => !interaction.current.blocked,
      bounds: () => area.getBoundingClientRect(),
      turn: (direction) => void turnRef.current(direction),
      center: toggleControls,
    });
  }, [book.format, toggleControls]);

  useEffect(() => {
    if (!mount.current) return;
    return bindNativeReaderTaps(mount.current, {
      enabled: () => !interaction.current.blocked,
      canTurn: () => book.format !== 'pdf' || zoom <= 1,
      turn: (direction) => void turnRef.current(direction),
      center: toggleControls,
      image: (image) => setPicture(image),
    });
  }, [book.format, zoom, toggleControls]);

  useEffect(() => {
    if (book.format !== 'epub' || !mount.current) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      const resizeAtCurrentPage = async () => {
        const area = mount.current;
        const r = rendition.current;
        if (cancelled || !area || !r) return;
        if (navigationPending.current) {
          timer = setTimeout(() => void resizeAtCurrentPage(), 80);
          return;
        }
        const previous = current.current.location;
        navigationPending.current = true;
        setTurning(true);
        try {
          r.resize(area.clientWidth, area.clientHeight);
          if (previous) await r.display(previous);
          const reported = await reportLatestLocation(r);
          if (!cancelled && rendition.current === r) {
            let sectionCount = 0;
            epub.current?.spine.each(() => sectionCount++);
            requestedCfi.current = previous;
            setAtStart(reported.atStart);
            setAtEnd(reported.atEnd);
            save(
              positionForEpub(
                reported,
                chapterData.current,
                sectionCount,
                previous,
                settings.current.fontSize,
              ),
              reported.atEnd,
            );
          }
        } catch {
          if (!cancelled)
            setError(
              'The page could not be fitted to the screen. Your saved place is unchanged.',
            );
        } finally {
          navigationPending.current = false;
          if (!cancelled && rendition.current === r) setTurning(false);
        }
      };
      timer = setTimeout(() => void resizeAtCurrentPage(), 160);
    });
    observer.observe(mount.current);
    return () => {
      cancelled = true;
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [book.format, save]);

  async function turn(direction: -1 | 1) {
    if (
      loading ||
      turning ||
      closing ||
      panel ||
      picture ||
      navigationPending.current ||
      (direction < 0 && atStart) ||
      (direction > 0 && atEnd)
    )
      return;
    if (document.visibilityState === 'visible' && !completed.current)
      readingClock.current.activity(Date.now());
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
      if (event.key === 'Escape' && !controlsVisible && !panel && !picture) {
        event.preventDefault();
        setReaderControls(true);
        return;
      }
      if (
        panel ||
        picture ||
        (zoom > 1 &&
          event.target instanceof Element &&
          event.target.closest('.zoom-viewport')) ||
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
  }, [panel, picture, zoom, controlsVisible, setReaderControls]);

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
    if (document.visibilityState === 'visible' && !completed.current)
      readingClock.current.activity(Date.now());
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
        const details = current.current.epubPage;
        if (
          details &&
          book.bookmarks.some(
            (mark) => mark.location === location && !mark.epubPage,
          )
        ) {
          callback.current(
            await updateBook(book.id, (stored) => ({
              bookmarks: stored.bookmarks.map((mark) =>
                mark.location === location && !mark.epubPage
                  ? { ...mark, epubPage: details }
                  : mark,
              ),
            })),
          );
        }
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
    save(
      positionForEpub(
        location,
        chapters,
        sectionCount,
        target,
        settings.current.fontSize,
      ),
      location.atEnd,
    );
  }
  async function closeReader() {
    if (closing || turning || navigationPending.current) return;
    setClosing(true);
    flushReadingTime(true);
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
    <div
      className={`reader reader-${theme} ${controlsVisible ? '' : 'reader-focus'}`}
      aria-busy={loading}
    >
      <p id="reader-touch-help" className="sr-only">
        Tap the left or right side to turn pages. Tap the center to show or hide
        reading controls. Use the left and right arrow keys to turn pages and
        Escape to show hidden controls.
      </p>
      <output className="sr-only" aria-live="polite" aria-atomic="true">
        {loading
          ? 'Opening book'
          : `${position.label}. ${position.progress}% read.`}
      </output>
      <header
        className="reader-header"
        aria-hidden={!controlsVisible}
        inert={!controlsVisible}
      >
        <button
          className="icon-button"
          onClick={() => void closeReader()}
          disabled={closing}
          aria-label="Back to library"
          title="Back to library"
        >
          <ArrowLeft size={21} />
        </button>
        <div className="reader-book-title">
          <h1>{book.title}</h1>
          <p>{book.author}</p>
        </div>
        <div className="reader-tools" role="toolbar" aria-label="Reader tools">
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
          <button
            ref={focusModeButton}
            className="icon-button"
            aria-label="Hide controls and focus on reading"
            title="Focus reading"
            aria-pressed={!controlsVisible}
            disabled={loading}
            onClick={toggleControls}
          >
            <EyeOff size={20} />
          </button>
        </div>
      </header>
      {!controlsVisible && (
        <button
          ref={showControlsButton}
          className="reader-show-controls"
          aria-label="Show reading controls"
          title="Show reading controls"
          onClick={() => setReaderControls(true)}
        >
          <Eye size={18} />
          <span className="sr-only">Controls</span>
        </button>
      )}
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
      <section
        className={`reading-area ${book.format === 'txt' ? 'text-area' : book.format === 'pdf' ? 'pdf-area' : 'epub-area'}`}
        ref={mount}
        aria-label={`${book.title} reading page`}
        aria-describedby="reader-touch-help"
        aria-keyshortcuts="ArrowLeft ArrowRight Escape"
        style={{ background: palette[theme].bg, color: palette[theme].fg }}
      >
        {book.format === 'pdf' && !loading && pdf.current && (
          <PdfPage
            resetKey={zoomReset}
            key={page}
            document={pdf.current}
            page={page}
            zoom={zoom}
            onZoom={setZoom}
            onTurn={(direction) => {
              if (!interaction.current.blocked) void turnRef.current(direction);
            }}
            onCenter={toggleControls}
            onError={setError}
          />
        )}
        {book.format === 'txt' && !loading && (
          <article
            className="text-page"
            style={{
              fontSize,
              fontFamily: FONT_STACKS[font],
              letterSpacing: LETTER_SPACING[font],
              lineHeight: LINE_HEIGHTS[spacing],
              paddingLeft: PAGE_MARGINS[margin],
              paddingRight: PAGE_MARGINS[margin],
              textAlign: alignment,
            }}
          >
            <p className="chapter-kicker">{book.title}</p>
            {textPages[page - 1]?.split(/\n\n+/).map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </article>
        )}
        <div
          className="reading-dimmer"
          style={{ opacity: (100 - brightness) / 100 }}
          aria-hidden="true"
        />
      </section>
      {loading && !error && (
        <output className="reader-loading">
          <LoaderCircle className="spin" />
          <span>Opening your book…</span>
        </output>
      )}
      <div
        className="reader-bottom"
        aria-hidden={!controlsVisible}
        inert={!controlsVisible}
      >
        <Progress
          aria-label="Reading progress"
          aria-valuetext={`${position.progress}% read`}
          value={position.progress}
        />
        {book.format === 'pdf' && !loading && (
          <ZoomControls zoom={zoom} onChange={changeZoom} />
        )}
        <div className="reader-navigation">
          <button
            className="icon-button"
            aria-label="Previous page"
            disabled={loading || atStart}
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
              <>
                <span>{loading ? 'Getting ready' : position.label}</span>
                <span className="epub-page-counter">
                  {loading
                    ? 'Calculating pages…'
                    : epubPageLabel(position) ||
                      'Page details appear after opening this section'}
                </span>
              </>
            )}
            <small>
              <Check size={12} />
              {saveState} <span>· {position.progress}%</span>
              <span className="reader-time">
                · <Clock size={12} />
                {readingTimeStatus(
                  isCompleted,
                  isCompleted ? finishedReadingTime.current : readingTime,
                )}
              </span>
            </small>
          </div>
          <button
            className="icon-button"
            aria-label="Next page"
            disabled={loading || atEnd}
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
              <p className="settings-note">Kayla’s Library {version}</p>
              <label htmlFor="page-color">
                Page color
                <Select
                  value={theme}
                  onValueChange={(value) => {
                    if (value) {
                      setTheme(value as ReadingTheme);
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
              {book.format !== 'pdf' &&
              (book.format !== 'epub' || reflowableEpub.current) ? (
                <>
                  <label htmlFor="reading-font">
                    Font style
                    <Select
                      value={font}
                      onValueChange={(value) =>
                        value && setFont(value as ReadingFont)
                      }
                    >
                      <SelectTrigger id="reading-font">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="book">Book serif</SelectItem>
                        <SelectItem value="classic">Classic</SelectItem>
                        <SelectItem value="sans">Modern sans</SelectItem>
                        <SelectItem value="accessible">
                          Easy-read sans
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <div className="setting-row">
                    <span>Text size</span>
                    <div>
                      <button
                        className="icon-button"
                        disabled={fontSize <= 14}
                        aria-label="Smaller text"
                        onClick={() => setFontSize((size) => size - 2)}
                      >
                        <Minus size={17} />
                      </button>
                      <span>{fontSize}px</span>
                      <button
                        className="icon-button"
                        disabled={fontSize >= 40}
                        aria-label="Larger text"
                        onClick={() => setFontSize((size) => size + 2)}
                      >
                        <Plus size={17} />
                      </button>
                    </div>
                  </div>
                  <label htmlFor="line-spacing">
                    Line spacing
                    <Select
                      value={spacing}
                      onValueChange={(value) =>
                        value && setSpacing(value as ReadingSpacing)
                      }
                    >
                      <SelectTrigger id="line-spacing">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="compact">Compact</SelectItem>
                        <SelectItem value="comfortable">Comfortable</SelectItem>
                        <SelectItem value="airy">Airy</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <label htmlFor="page-margins">
                    Page margins
                    <Select
                      value={margin}
                      onValueChange={(value) =>
                        value && setMargin(value as ReadingMargin)
                      }
                    >
                      <SelectTrigger id="page-margins">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="narrow">Narrow</SelectItem>
                        <SelectItem value="standard">Standard</SelectItem>
                        <SelectItem value="wide">Wide</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <label htmlFor="text-alignment">
                    Text alignment
                    <Select
                      value={alignment}
                      onValueChange={(value) =>
                        value && setAlignment(value as ReadingAlignment)
                      }
                    >
                      <SelectTrigger id="text-alignment">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="left">Left</SelectItem>
                        <SelectItem value="justify">Justified</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                </>
              ) : (
                book.format === 'pdf' && (
                  <ZoomControls zoom={zoom} onChange={changeZoom} />
                )
              )}
              {book.format === 'epub' && !reflowableEpub.current && (
                <p className="settings-note">
                  This illustrated EPUB uses a fixed page design, so its fonts,
                  spacing, and margins stay unchanged.
                </p>
              )}
              <div className="brightness-control">
                <div>
                  <span>Page brightness</span>
                  <output>{brightness}%</output>
                </div>
                <Slider
                  aria-label="Page brightness"
                  min={50}
                  max={100}
                  step={5}
                  value={[brightness]}
                  onValueChange={(value) =>
                    setBrightness(
                      (Array.isArray(value) ? value[0] : value) ?? 100,
                    )
                  }
                />
              </div>
              <p className="settings-note">
                {book.format === 'pdf'
                  ? 'Pinch to zoom up to 400%, then drag to pan. Fit width resets the page. Side taps turn pages only at 100% zoom; center taps always show or hide controls.'
                  : 'Tap the left or right side to turn a page. Tap the center to show or hide controls. Tap EPUB illustrations to enlarge them. Your place stays saved.'}
              </p>
              <p className="settings-note">
                Easy-read sans adds wider letter spacing. Reader controls use
                larger touch targets, clear keyboard focus, and your device’s
                reduced-motion preference.
              </p>
              {book.format === 'epub' && (
                <p className="settings-note">
                  EPUB screen pages are counted within each book section, not a
                  printed edition. Larger text creates more pages. Bookmarks
                  return to the exact passage even when page numbers change.
                </p>
              )}
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
                        {mark.epubPage && (
                          <small>
                            {epubPageLabel(mark)}
                            {mark.epubPage.fontSize
                              ? ` · ${mark.epubPage.fontSize}px text`
                              : ''}
                          </small>
                        )}
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
      <Dialog
        open={picture !== null}
        onOpenChange={(open) => {
          if (!open) setPicture(null);
        }}
      >
        <DialogContent className="image-zoom-dialog">
          <DialogTitle>Illustration</DialogTitle>
          <DialogDescription>
            Pinch or use + to zoom. Drag to explore. Closing returns to the same
            page.
          </DialogDescription>
          {picture && (
            <ImagePage key={picture.src} src={picture.src} alt={picture.alt} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
