'use client';
/* oxlint-disable react/react-compiler -- IndexedDB is an external async store; this app does not enable the React compiler. */
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Plus,
  ArrowUpRight,
  HardDrive,
  Upload,
  Search,
  Bookmark,
  Download,
  Trash2,
  LoaderCircle,
  X,
  Pencil,
  ImagePlus,
  Target,
  Flame,
  DatabaseBackup,
  ArchiveRestore,
  Timer,
  Ellipsis,
  Library,
  BarChart3,
  Settings,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from '@/components/ui/empty';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import Reader from '@/components/reader';
import {
  listBooks,
  addBook,
  deleteBook,
  getFile,
  errorMessage,
  isBookFinished,
  updateBook,
  type LibraryBook,
} from '@/lib/library';
import {
  DEFAULT_READING_GOALS,
  combineReadingActivity,
  estimatedTimeRemainingStatus,
  localDayKey,
  normalizeReadingGoals,
  readingStreak,
  readingTimeStatus,
  weeklyReading,
  type ReadingGoals,
} from '@/lib/reading-statistics';
import {
  BACKUP_SETTING_KEYS,
  createLibraryBackup,
  inspectLibraryBackup,
  restoreLibraryBackup,
  type LibraryBackupManifest,
} from '@/lib/library-backup';
import packageInfo from '@/package.json';
import { inspectFile, METADATA_VERSION, SAMPLE_TEXT } from '@/lib/book-files';
import { ThemeList, ThemePicker } from '@/components/theme-provider';
import {
  coverQuery,
  enrichCover,
  findOnlineCover,
  needsOnlineCover,
} from '@/lib/covers';
import {
  CHAPTER_HISTORY_VERSION,
  chapterIndex,
  repairChapterLabel,
} from '@/lib/chapters';

type LibraryView = 'library' | 'goals' | 'search' | 'settings';

function greeting(hour = new Date().getHours()) {
  if (hour < 5 || hour >= 18) return 'Good evening';
  if (hour < 12) return 'Good morning';
  return 'Good afternoon';
}

export default function Home() {
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [ready, setReady] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const importLock = useRef(false);
  const [importStatus, setImportStatus] = useState('');
  const [failures, setFailures] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [dragging, setDragging] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [remove, setRemove] = useState<LibraryBook | null>(null);
  const [editing, setEditing] = useState<LibraryBook | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftAuthor, setDraftAuthor] = useState('');
  const [draftCover, setDraftCover] = useState<string | undefined>();
  const [editError, setEditError] = useState('');
  const [coverSearching, setCoverSearching] = useState(false);
  const [coverMessage, setCoverMessage] = useState('');
  const [draftCoverSource, setDraftCoverSource] =
    useState<LibraryBook['coverSource']>();
  const coverSearchRequest = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const [goals, setGoals] = useState<ReadingGoals>(DEFAULT_READING_GOALS);
  const [goalsReady, setGoalsReady] = useState(false);
  const [view, setView] = useState<LibraryView>('library');
  const [restoreCandidate, setRestoreCandidate] = useState<{
    file: File;
    manifest: LibraryBackupManifest;
  } | null>(null);
  const active = books.find((b) => b.id === activeId);
  const recent = [...books]
    .filter((b) => b.lastRead > 0 && !isBookFinished(b))
    .sort((a, b) => b.lastRead - a.lastRead)[0];
  const onUpdate = useCallback(
    (book: LibraryBook) =>
      setBooks((previous) =>
        previous.map((b) => (b.id === book.id ? book : b)),
      ),
    [],
  );
  const refresh = useCallback(async () => {
    let stored = await listBooks();
    for (const book of stored.filter(
      (item) => item.metadataVersion !== METADATA_VERSION,
    )) {
      try {
        const detected = await inspectFile(
          new File([await getFile(book.id)], book.filename),
        );
        await updateBook(book.id, {
          metadataVersion: METADATA_VERSION,
          title: book.metadataEdited ? book.title : detected.title,
          author: book.metadataEdited ? book.author : detected.author,
          cover: book.cover || detected.cover,
        });
      } catch {
        await updateBook(book.id, { metadataVersion: METADATA_VERSION }).catch(
          () => {},
        );
      }
    }
    stored = await listBooks();
    for (const book of stored.filter(
      (item) =>
        item.format === 'epub' &&
        item.lastRead > 0 &&
        item.chapterHistoryVersion !== CHAPTER_HISTORY_VERSION,
    )) {
      const { Book } = await import('epubjs');
      const { prepareEpub } = await import('@/lib/book-files');
      const document = new Book({ replacements: 'blobUrl' });
      try {
        await document.open(
          await prepareEpub(await (await getFile(book.id)).arrayBuffer()),
          'binary',
        );
        await document.ready;
        const chapters = await chapterIndex(document);
        await updateBook(book.id, (latest) => ({
          position: repairChapterLabel(latest.position, chapters),
          bookmarks: latest.bookmarks.map((mark) => ({
            ...mark,
            ...repairChapterLabel(mark, chapters),
          })),
          highlights: (latest.highlights || []).map((highlight) => ({
            ...highlight,
            ...repairChapterLabel(highlight, chapters),
          })),
          chapterHistoryVersion: CHAPTER_HISTORY_VERSION,
        }));
      } catch {
        /* A damaged book must not block the rest of the library. */
      } finally {
        document.destroy();
      }
    }
    stored = await listBooks();
    setBooks(stored);
  }, []);
  useEffect(() => {
    if (!ready) return;
    for (const book of books.filter(needsOnlineCover)) {
      void enrichCover(book)
        .then(onUpdate)
        .catch(() => {});
    }
  }, [books, ready, onUpdate]);
  useEffect(() => {
    void refresh()
      .catch((e) =>
        setNotice(`Your library could not be loaded: ${errorMessage(e)}`),
      )
      .finally(() => setReady(true));
  }, [refresh]);
  useEffect(() => {
    try {
      setGoals(
        normalizeReadingGoals(
          JSON.parse(localStorage.getItem('leaf-reading-goals') || 'null'),
        ),
      );
    } catch {
      setGoals(DEFAULT_READING_GOALS);
    } finally {
      setGoalsReady(true);
    }
  }, []);
  useEffect(() => {
    if (goalsReady)
      localStorage.setItem('leaf-reading-goals', JSON.stringify(goals));
  }, [goals, goalsReady]);
  useEffect(() => {
    const handle = () => {
      void refresh().catch(() => {});
    };
    window.addEventListener('focus', handle);
    return () => window.removeEventListener('focus', handle);
  }, [refresh]);
  async function importFiles(files: File[], openAfter = false) {
    if (importLock.current || !files.length) return;
    importLock.current = true;
    setBusy(true);
    setFailures([]);
    const errors: string[] = [];
    let added = 0,
      duplicate = 0;
    let firstId = '';
    try {
      const existing = new Set((await listBooks()).map((b) => b.id));
      for (const [index, file] of files.entries()) {
        setImportStatus(
          `Opening ${index + 1} of ${files.length}: ${file.name}`,
        );
        try {
          const book = await inspectFile(file);
          if (existing.has(book.id)) {
            duplicate++;
            firstId ||= book.id;
            continue;
          }
          await addBook(book, file);
          firstId ||= book.id;
          existing.add(book.id);
          added++;
        } catch (e) {
          errors.push(`${file.name}: ${errorMessage(e)}`);
        }
      }
      await refresh();
      setNotice(
        [
          added
            ? `${added} ${added === 1 ? 'book added' : 'books added'} to your library.`
            : '',
          duplicate
            ? `${duplicate} already in your library; existing progress kept.`
            : '',
        ]
          .filter(Boolean)
          .join(' '),
      );
      setFailures(errors);
      if (!errors.length) {
        setImportOpen(false);
        if (openAfter && firstId) setActiveId(firstId);
      }
      if (added && navigator.storage?.persist)
        void navigator.storage.persist().catch(() => {});
    } catch (e) {
      setFailures([errorMessage(e)]);
    } finally {
      setBusy(false);
      importLock.current = false;
      setImportStatus('');
      if (fileInput.current) fileInput.current.value = '';
    }
  }
  async function sample() {
    await importFiles(
      [
        new File([SAMPLE_TEXT], 'A small guide to slowing down.txt', {
          type: 'text/plain',
        }),
      ],
      true,
    );
  }
  async function download(book: LibraryBook) {
    try {
      const file = await getFile(book.id);
      const { shareBookFile } = await import('@/lib/native');
      if (await shareBookFile(file, book.filename)) return;
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = book.filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      setNotice(errorMessage(e));
    }
  }
  async function exportBackup() {
    setBusy(true);
    try {
      const settings = Object.fromEntries(
        BACKUP_SETTING_KEYS.flatMap((key) => {
          const value = localStorage.getItem(key);
          return value === null ? [] : [[key, value]];
        }),
      );
      const file = await createLibraryBackup(packageInfo.version, settings);
      const filename = `kaylas-library-backup-${localDayKey()}.zip`;
      const { shareBookFile } = await import('@/lib/native');
      if (!(await shareBookFile(file, filename))) {
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
      setNotice('Library backup created. Keep it somewhere safe.');
    } catch (error) {
      setNotice(`Backup failed: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }
  async function chooseBackup(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const { manifest } = await inspectLibraryBackup(file);
      setRestoreCandidate({ file, manifest });
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
      if (backupInput.current) backupInput.current.value = '';
    }
  }
  function openEditor(book: LibraryBook) {
    coverSearchRequest.current++;
    setCoverSearching(false);
    setCoverMessage('');
    setEditing(book);
    setDraftTitle(book.title);
    setDraftAuthor(book.author);
    setDraftCover(book.cover);
    setDraftCoverSource(book.coverSource);
    setEditError('');
  }
  async function chooseCover(file?: File) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setEditError('Choose a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setEditError('Choose a cover image smaller than 5 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setEditError('That cover image could not be read.');
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setDraftCover(reader.result);
        setDraftCoverSource('custom');
        setEditError('');
      } else {
        setEditError('That cover image could not be read.');
      }
    };
    reader.readAsDataURL(file);
  }
  async function searchCover() {
    const request = ++coverSearchRequest.current;
    setCoverSearching(true);
    setCoverMessage('');
    setEditError('');
    try {
      const cover = await findOnlineCover(draftTitle, draftAuthor);
      if (request !== coverSearchRequest.current) return;
      if (cover) {
        setDraftCover(cover);
        setDraftCoverSource('web');
        setCoverMessage('Cover found. Save details to use it.');
      } else
        setCoverMessage(
          'No matching cover found. Your current cover has been kept.',
        );
    } catch {
      if (request === coverSearchRequest.current)
        setCoverMessage(
          'Cover search is unavailable right now. Your current cover has been kept.',
        );
    } finally {
      if (request === coverSearchRequest.current) setCoverSearching(false);
    }
  }
  async function saveDetails() {
    if (!editing) return;
    if (!draftTitle.trim() || !draftAuthor.trim()) {
      setEditError('Add both a title and an author.');
      return;
    }
    try {
      const updated = await updateBook(editing.id, {
        title: draftTitle.trim(),
        author: draftAuthor.trim(),
        cover: draftCover,
        coverSource: draftCoverSource,
        coverLookup:
          draftCoverSource === 'web'
            ? {
                query: coverQuery(draftTitle, draftAuthor),
                checkedAt: Date.now(),
              }
            : undefined,
        metadataEdited: true,
        metadataVersion: METADATA_VERSION,
      });
      onUpdate(updated);
      setEditing(null);
      setNotice('Book details updated.');
    } catch (e) {
      setEditError(errorMessage(e));
    }
  }
  const booksRef = useRef(books);
  useEffect(() => {
    booksRef.current = books;
  }, [books]);
  useEffect(() => {
    type Tool = {
      name: string;
      title: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (input: unknown) => unknown;
    };
    const context = (
      document as unknown as {
        modelContext?: {
          registerTool: (
            tool: Tool,
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tools: Tool[] = [
      {
        name: 'list_local_books',
        title: 'List local books',
        description: 'List imported books and saved progress in this browser.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: () =>
          booksRef.current.map(({ id, title, format, position }) => ({
            id,
            title,
            format,
            position,
          })),
      },
      {
        name: 'open_local_book',
        title: 'Open local book',
        description:
          'Open an imported book at its saved location. Reading progress will be updated by the reader.',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        execute: async (input) => {
          const id = (input as { id?: unknown })?.id;
          if (
            typeof id !== 'string' ||
            !booksRef.current.some((b) => b.id === id)
          )
            throw new Error('Choose the id of an imported book.');
          setActiveId(id);
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
          return { id, readerOpened: true };
        },
      },
    ];
    for (const tool of tools) {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {
        /* Optional browser capability. */
      }
    }
    return () => lifecycle.abort();
  }, []);
  if (active)
    return (
      <Reader
        key={active.id}
        book={active}
        onUpdate={onUpdate}
        onClose={() => {
          setActiveId(null);
          void refresh().catch((e) => setNotice(errorMessage(e)));
        }}
      />
    );
  const byRecent = (a: LibraryBook, b: LibraryBook) =>
    (b.lastRead || b.addedAt) - (a.lastRead || a.addedAt);
  const shelfBooks = books
    .filter(
      (b) =>
        filter === 'all' ||
        (filter === 'reading'
          ? b.lastRead > 0 && !isBookFinished(b)
          : isBookFinished(b)),
    )
    .sort(byRecent);
  const searchResults = query.trim()
    ? books
        .filter((b) =>
          `${b.title} ${b.author} ${b.filename}`
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
        )
        .sort(byRecent)
    : [];
  const readingActivity = combineReadingActivity(
    books.map((book) => book.readingActivity),
  );
  const todayActivity = readingActivity[localDayKey()] || {
    readingTimeMs: 0,
    pages: 0,
  };
  const week = weeklyReading(readingActivity);
  const streak = readingStreak(readingActivity);
  const maxWeekMinutes = Math.max(1, ...week.map((day) => day.minutes));
  const maxWeekPages = Math.max(1, ...week.map((day) => day.pages));
  const finishedBooks = books
    .filter(isBookFinished)
    .sort(
      (a, b) => (b.completedAt || b.lastRead) - (a.completedAt || a.lastRead),
    );
  function openView(next: LibraryView) {
    setView(next);
    window.scrollTo(0, 0);
  }
  // Today's streak, minutes and pages. On the Library tab they open Goals.
  function goalTiles(openGoals: boolean) {
    const tiles = [
      {
        key: 'streak',
        icon: <Flame size={17} />,
        value: streak,
        label: 'day streak',
      },
      {
        key: 'minutes',
        icon: <Timer size={17} />,
        value: Math.floor(todayActivity.readingTimeMs / 60_000),
        label: `of ${goals.minutes} min`,
        progress: goals.minutes
          ? Math.min(
              100,
              (todayActivity.readingTimeMs / 60_000 / goals.minutes) * 100,
            )
          : 100,
      },
      {
        key: 'pages',
        icon: <Target size={17} />,
        value: todayActivity.pages,
        label: `of ${goals.pages} pages`,
        progress: goals.pages
          ? Math.min(100, (todayActivity.pages / goals.pages) * 100)
          : 100,
      },
    ];
    return (
      <section className="goal-tiles" aria-label="Today’s reading">
        {tiles.map((tile) => {
          const content = (
            <>
              {tile.icon}
              <strong>{tile.value}</strong>
              <span>{tile.label}</span>
              {tile.progress !== undefined && (
                <Progress
                  value={tile.progress}
                  aria-label={`${tile.label} goal progress`}
                />
              )}
            </>
          );
          return openGoals ? (
            <button
              key={tile.key}
              className="goal-tile"
              onClick={() => openView('goals')}
              aria-label={`${tile.value} ${tile.label}. Open reading goals`}
            >
              {content}
            </button>
          ) : (
            <div key={tile.key} className="goal-tile">
              {content}
            </div>
          );
        })}
      </section>
    );
  }
  function bookGrid(list: LibraryBook[]) {
    return (
      <div className="book-grid">
        {list.map((book) => (
          <article className="book-card" key={book.id}>
            <button
              className="book-open"
              onClick={() => setActiveId(book.id)}
              aria-label={`Read ${book.title}`}
            >
              <BookCover book={book} />
            </button>
            <div className="book-card-text">
              <div>
                <h3 title={book.title}>{book.title}</h3>
                <p>
                  {isBookFinished(book)
                    ? 'Finished'
                    : book.lastRead
                      ? `${book.position.progress}% read`
                      : 'Not started'}
                  {book.bookmarks.length > 0 && (
                    <span className="book-card-marks">
                      <Bookmark size={11} />
                      {book.bookmarks.length}
                    </span>
                  )}
                </p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="icon-button book-menu"
                  aria-label={`Options for ${book.title}`}
                >
                  <Ellipsis size={17} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="book-menu-list">
                  <DropdownMenuItem onClick={() => openEditor(book)}>
                    <Pencil size={15} /> Edit details
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void download(book)}>
                    <Download size={15} /> Save or share
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => setRemove(book)}
                  >
                    <Trash2 size={15} /> Remove
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {book.lastRead > 0 && !isBookFinished(book) && (
              <Progress
                className="book-card-progress"
                value={book.position.progress}
                aria-label={`${book.title} reading progress`}
              />
            )}
          </article>
        ))}
      </div>
    );
  }
  return (
    <main className={`library-shell library-view-${view}`}>
      <header className="masthead">
        <div className="masthead-title">
          <p className="library-greeting">{greeting()}, Kayla</p>
          <h1 className="wordmark">
            {view === 'library'
              ? 'Your library'
              : view === 'goals'
                ? 'Reading goals'
                : view === 'search'
                  ? 'Search'
                  : 'Settings'}
          </h1>
        </div>
        <div className="masthead-actions">
          <ThemePicker />
        </div>
      </header>
      <input
        ref={backupInput}
        type="file"
        className="sr-only"
        accept=".zip,application/zip,application/x-zip-compressed"
        aria-label="Choose a Kayla's Library backup"
        onChange={(event) => void chooseBackup(event.target.files?.[0])}
      />
      {notice && (
        <output className="library-notice">
          <span>{notice}</span>
          <button
            className="icon-button"
            aria-label="Dismiss message"
            onClick={() => setNotice('')}
          >
            <X size={16} />
          </button>
        </output>
      )}
      {view === 'library' && (
        <>
          <div className="library-actions">
            <button
              className="primary"
              onClick={() => {
                setFailures([]);
                setImportOpen(true);
              }}
              disabled={!ready || busy}
            >
              <Plus size={19} /> Import books
            </button>
          </div>
          {recent ? (
            <section
              className="continue-panel"
              aria-labelledby="continue-title"
            >
              <button
                className="continue-cover"
                onClick={() => setActiveId(recent.id)}
                aria-label={`Continue reading ${recent.title}`}
              >
                <BookCover book={recent} />
              </button>
              <div className="continue-copy">
                <span className="section-label">Continue reading</span>
                <h2 id="continue-title">{recent.title}</h2>
                <p>
                  {recent.author}
                  {recent.position.label ? ` · ${recent.position.label}` : ''}
                </p>
                <div className="continue-progress">
                  <Progress
                    value={recent.position.progress}
                    aria-label="Book progress"
                  />
                  <span>
                    {recent.position.progress}%
                    {estimatedTimeRemainingStatus(
                      recent.position.progress,
                      recent.readingTimeMs,
                    )
                      ? ` · ${estimatedTimeRemainingStatus(
                          recent.position.progress,
                          recent.readingTimeMs,
                        ).toLowerCase()}`
                      : ''}
                  </span>
                </div>
                <button
                  className="light-button"
                  onClick={() => setActiveId(recent.id)}
                >
                  <BookOpen size={17} /> Continue
                </button>
              </div>
            </section>
          ) : (
            <section className="welcome-panel">
              <div>
                <span className="section-label">Make yourself at home</span>
                <h2>A new chapter starts here.</h2>
                <p>
                  Bring a book you love, find a comfortable spot, and pick up
                  where you left off.
                </p>
                <button
                  className="light-button"
                  onClick={() => setImportOpen(true)}
                >
                  Open your first book <ArrowUpRight size={18} />
                </button>
                <button
                  className="sample-link"
                  disabled={busy || !ready}
                  onClick={() => void sample()}
                >
                  {busy ? 'Opening…' : 'Or try a short sample'}
                </button>
              </div>
            </section>
          )}
          {ready && goalTiles(true)}
          <section className="shelf">
            <Tabs value={filter} onValueChange={(v) => setFilter(String(v))}>
              <div className="shelf-heading">
                <TabsList variant="line" className="shelf-tabs">
                  <TabsTrigger value="all">
                    All books <span className="count">{books.length}</span>
                  </TabsTrigger>
                  <TabsTrigger value="reading">Reading</TabsTrigger>
                  <TabsTrigger value="finished">Finished</TabsTrigger>
                </TabsList>
              </div>
              {['all', 'reading', 'finished'].map((tab) => (
                <TabsContent key={tab} value={tab}>
                  {!ready ? (
                    <output className="empty-library">
                      <LoaderCircle className="spin" /> Opening your library…
                    </output>
                  ) : shelfBooks.length ? (
                    bookGrid(shelfBooks)
                  ) : (
                    <Empty className="empty-library">
                      <EmptyHeader>
                        <EmptyMedia>
                          <BookOpen size={35} />
                        </EmptyMedia>
                        <EmptyTitle>
                          <h3>
                            {filter === 'reading'
                              ? 'Your next chapter is waiting.'
                              : filter === 'finished'
                                ? 'A shelf for stories you’ve finished.'
                                : 'Your next read belongs here.'}
                          </h3>
                        </EmptyTitle>
                        <EmptyDescription>
                          {filter === 'all'
                            ? 'Import an EPUB, PDF, or text file to get started.'
                            : filter === 'reading'
                              ? 'Open a book from All books to start reading.'
                              : 'Books appear here when you reach the final page.'}
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </section>
        </>
      )}
      {view === 'goals' && ready && (
        <>
          {goalTiles(false)}
          <section className="goal-editor-card" aria-label="Daily goals">
            <span className="section-label">Daily goals</span>
            <p>Set how much you’d like to read each day. Use 0 to turn a goal off.</p>
            <div className="goal-editor">
              <label>
                Minutes a day
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="1440"
                  value={goals.minutes}
                  onChange={(event) =>
                    setGoals((current) =>
                      normalizeReadingGoals({
                        ...current,
                        minutes: Number(event.target.value),
                      }),
                    )
                  }
                />
              </label>
              <label>
                Pages a day
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="1000"
                  value={goals.pages}
                  onChange={(event) =>
                    setGoals((current) =>
                      normalizeReadingGoals({
                        ...current,
                        pages: Number(event.target.value),
                      }),
                    )
                  }
                />
              </label>
            </div>
          </section>
          <section
            className="reading-dashboard"
            aria-labelledby="rhythm-title"
          >
            <span className="section-label">Your reading rhythm</span>
            <h2 id="rhythm-title">Last seven days</h2>
            <div className="weekly-chart">
              {week.map((day) => (
                <div className="week-column" key={day.key}>
                  <div
                    className="week-bars"
                    title={`${day.minutes} min · ${day.pages} pages`}
                  >
                    <span
                      className="minutes-bar"
                      style={{
                        height: `${Math.max(day.minutes ? 8 : 0, (day.minutes / maxWeekMinutes) * 100)}%`,
                      }}
                    />
                    <span
                      className="pages-bar"
                      style={{
                        height: `${Math.max(day.pages ? 8 : 0, (day.pages / maxWeekPages) * 100)}%`,
                      }}
                    />
                  </div>
                  <small>{day.label.slice(0, 2)}</small>
                </div>
              ))}
            </div>
            <p className="chart-legend">
              <span className="chart-key minutes-key" /> Minutes{' '}
              <span className="chart-key pages-key" /> Pages
            </p>
            {finishedBooks.length > 0 && (
              <div className="finished-history">
                <h3>Finished books</h3>
                <div>
                  {finishedBooks.slice(0, 6).map((book) => (
                    <button key={book.id} onClick={() => setActiveId(book.id)}>
                      <BookCover book={book} />
                      <span>
                        <strong>{book.title}</strong>
                        <small>
                          {book.completedAt
                            ? new Intl.DateTimeFormat(undefined, {
                                dateStyle: 'medium',
                              }).format(book.completedAt)
                            : 'Finished'}
                          {' · '}
                          {readingTimeStatus(true, book.finishedReadingTimeMs)}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        </>
      )}
      {view === 'search' && (
        <section className="search-view">
          <label className="library-search">
            <Search size={17} />
            <input
              aria-label="Search your library"
              placeholder="Title, author, or file name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                className="icon-button"
                aria-label="Clear search"
                onClick={() => setQuery('')}
              >
                <X size={16} />
              </button>
            )}
          </label>
          {query.trim() ? (
            searchResults.length ? (
              <>
                <p className="search-count">
                  {searchResults.length}{' '}
                  {searchResults.length === 1 ? 'book' : 'books'} found
                </p>
                {bookGrid(searchResults)}
              </>
            ) : (
              <p className="search-hint">
                No books match “{query.trim()}”. Try a different title or
                author.
              </p>
            )
          ) : (
            <p className="search-hint">
              Search all {books.length} {books.length === 1 ? 'book' : 'books'}{' '}
              by title, author, or file name.
            </p>
          )}
        </section>
      )}
      {view === 'settings' && (
        <>
          <section className="settings-card" aria-labelledby="theme-title">
            <span className="section-label" id="theme-title">
              Theme
            </span>
            <ThemeList />
          </section>
          <section className="settings-card" aria-labelledby="books-title">
            <span className="section-label" id="books-title">
              Your books
            </span>
            <button
              className="settings-row"
              onClick={() => {
                setFailures([]);
                setImportOpen(true);
              }}
              disabled={!ready || busy}
            >
              <Plus size={19} />
              <span>
                <strong>Import books</strong>
                <small>Add EPUB, PDF, or text files</small>
              </span>
            </button>
            <button
              className="settings-row"
              onClick={() => void exportBackup()}
              disabled={!ready || busy}
            >
              <DatabaseBackup size={19} />
              <span>
                <strong>Back up library</strong>
                <small>Save books, progress, and settings in one file</small>
              </span>
            </button>
            <button
              className="settings-row"
              onClick={() => backupInput.current?.click()}
              disabled={!ready || busy}
            >
              <ArchiveRestore size={19} />
              <span>
                <strong>Restore a backup</strong>
                <small>Replace this library with a saved backup</small>
              </span>
            </button>
          </section>
          <footer>
            <HardDrive size={15} />
            <p>
              Saved on this device. Use Back up before reinstalling or changing
              IPA builds so your books and progress can be restored.
            </p>
            <p className="app-version">Kayla’s Library {packageInfo.version}</p>
          </footer>
        </>
      )}
      <nav className="tab-bar" aria-label="Sections">
        {(
          [
            ['library', Library, 'Library'],
            ['goals', BarChart3, 'Goals'],
            ['search', Search, 'Search'],
            ['settings', Settings, 'Settings'],
          ] as const
        ).map(([id, Icon, label]) => (
          <button
            key={id}
            aria-current={view === id ? 'page' : undefined}
            onClick={() => openView(id)}
          >
            <Icon size={23} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <Dialog
        open={importOpen}
        onOpenChange={(open) => {
          if (!busy) setImportOpen(open);
        }}
      >
        <DialogContent className="import-dialog">
          <DialogTitle>Make room for your next read.</DialogTitle>
          <DialogDescription>
            Choose books from your device. They stay here, in your browser.
          </DialogDescription>
          <div
            className={`import-drop ${dragging ? 'dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void importFiles(Array.from(e.dataTransfer.files));
            }}
          >
            <Upload size={32} />
            <h3>Drop your books here</h3>
            <p>EPUB, PDF, or TXT · up to 100 MB each</p>
            <button
              className="primary"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
            >
              {busy ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <Plus size={17} />
              )}{' '}
              Choose files
            </button>
            <input
              type="file"
              ref={fileInput}
              className="sr-only"
              accept=".epub,.pdf,.txt,application/epub+zip,application/pdf,text/plain"
              multiple
              aria-label="Import book files"
              disabled={busy}
              onChange={(e) =>
                void importFiles(Array.from(e.target.files || []))
              }
            />
          </div>
          {importStatus && (
            <output className="import-status">{importStatus}</output>
          )}
          {failures.length > 0 && (
            <div role="alert" className="import-errors">
              {failures.map((failure, i) => (
                <p key={i}>{failure}</p>
              ))}
            </div>
          )}
          <p className="settings-note">
            Use unprotected files. Kindle MOBI/AZW and DRM-protected books
            aren’t supported in this prototype.
          </p>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
            setEditError('');
          }
        }}
      >
        <DialogContent className="import-dialog">
          <DialogTitle>Edit book details</DialogTitle>
          <DialogDescription>
            Correct the title and author, or choose a cover from your device.
          </DialogDescription>
          <form
            className="book-details-form"
            onSubmit={(event) => {
              event.preventDefault();
              void saveDetails();
            }}
          >
            <div className="cover-editor">
              <div className="cover-preview">
                {draftCover ? (
                  <Image
                    unoptimized
                    width={180}
                    height={240}
                    src={draftCover}
                    alt="Selected book cover"
                  />
                ) : (
                  <BookOpen size={34} />
                )}
              </div>
              <div className="cover-editor-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={coverSearching || !draftTitle.trim()}
                  onClick={() => void searchCover()}
                >
                  {coverSearching ? (
                    <LoaderCircle size={17} className="spin" />
                  ) : (
                    <Search size={17} />
                  )}{' '}
                  {coverSearching ? 'Finding cover…' : 'Find cover online'}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={coverSearching}
                  onClick={() => coverInput.current?.click()}
                >
                  <ImagePlus size={17} /> Choose cover
                </button>
                {draftCover && (
                  <button
                    type="button"
                    className="text-button"
                    disabled={coverSearching}
                    onClick={() => {
                      setDraftCover(undefined);
                      setDraftCoverSource('default');
                    }}
                  >
                    Remove cover
                  </button>
                )}
                <input
                  ref={coverInput}
                  type="file"
                  className="sr-only"
                  accept="image/jpeg,image/png,image/webp"
                  aria-label="Choose a book cover image"
                  onChange={(event) => {
                    void chooseCover(event.target.files?.[0]);
                    event.currentTarget.value = '';
                  }}
                />
              </div>
            </div>
            {coverMessage && (
              <output className="settings-note">{coverMessage}</output>
            )}
            <label htmlFor="book-title">
              Title
              <input
                id="book-title"
                type="text"
                value={draftTitle}
                maxLength={200}
                disabled={coverSearching}
                autoComplete="off"
                onChange={(event) => setDraftTitle(event.target.value)}
              />
            </label>
            <label htmlFor="book-author">
              Author
              <input
                id="book-author"
                type="text"
                value={draftAuthor}
                maxLength={200}
                disabled={coverSearching}
                autoComplete="off"
                onChange={(event) => setDraftAuthor(event.target.value)}
              />
            </label>
            {editError && (
              <p role="alert" className="import-errors">
                {editError}
              </p>
            )}
            <p className="settings-note">
              Covers are matched through Open Library using title and author. If
              no cover is found, your current cover stays. Book files stay on
              your device.
            </p>
            <div className="book-details-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="primary"
                disabled={coverSearching}
              >
                Save details
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!restoreCandidate}
        onOpenChange={(open) => {
          if (!open && !busy) setRestoreCandidate(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Restore this library backup?</AlertDialogTitle>
          <AlertDialogDescription>
            This backup contains {restoreCandidate?.manifest.books.length || 0}{' '}
            {(restoreCandidate?.manifest.books.length || 0) === 1
              ? 'book'
              : 'books'}
            . Restoring replaces the library currently stored on this device,
            including its progress, bookmarks, highlights, covers, statistics,
            and settings.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={async () => {
                if (!restoreCandidate) return;
                setBusy(true);
                try {
                  const manifest = await restoreLibraryBackup(
                    restoreCandidate.file,
                  );
                  for (const key of BACKUP_SETTING_KEYS) {
                    const value = manifest.settings[key];
                    if (value === undefined) localStorage.removeItem(key);
                    else localStorage.setItem(key, value);
                  }
                  setRestoreCandidate(null);
                  await refresh();
                  setNotice(
                    `Restored ${manifest.books.length} ${manifest.books.length === 1 ? 'book' : 'books'} and all saved reading data.`,
                  );
                  window.setTimeout(() => window.location.reload(), 350);
                } catch (error) {
                  setRestoreCandidate(null);
                  setNotice(`Restore failed: ${errorMessage(error)}`);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Restore and replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={!!remove}
        onOpenChange={(open) => {
          if (!open) setRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Remove this book?</AlertDialogTitle>
          <AlertDialogDescription>
            “{remove?.title}” and its saved places will be removed from this
            browser. Your original file won’t be changed.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep book</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                if (!remove) return;
                try {
                  await deleteBook(remove.id);
                  await refresh();
                  setRemove(null);
                } catch (e) {
                  setNotice(errorMessage(e));
                  setRemove(null);
                }
              }}
            >
              Remove book
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
function BookCover({ book }: { book: LibraryBook }) {
  const [failed, setFailed] = useState<string>();
  return (
    <div className={`book-cover cover-${book.format}`}>
      {book.cover && failed !== book.cover ? (
        <Image
          unoptimized
          width={240}
          height={320}
          src={book.cover}
          alt=""
          onError={() => setFailed(book.cover)}
        />
      ) : (
        <div className="type-cover">
          <span className="cover-format">{book.format.toUpperCase()}</span>
          <strong>{book.title}</strong>
          <span className="cover-rule" />
          <small>{book.author}</small>
          <BookOpen size={21} />
        </div>
      )}
    </div>
  );
}
