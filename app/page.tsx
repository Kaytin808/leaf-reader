'use client';
/* oxlint-disable react/react-compiler -- IndexedDB is an external async store; this app does not enable the React compiler. */
import Link from 'next/link';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Plus,
  ArrowUpRight,
  Library,
  HardDrive,
  FileText,
  Upload,
  Search,
  ArrowRight,
  Bookmark,
  Download,
  Trash2,
  LoaderCircle,
  X,
  Pencil,
  ImagePlus,
  Clock3,
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
import { Progress } from '@/components/ui/progress';
import Reader from '@/components/reader';
import {
  listBooks,
  addBook,
  deleteBook,
  getFile,
  formatBytes,
  errorMessage,
  positionLabel,
  isBookFinished,
  updateBook,
  type LibraryBook,
} from '@/lib/library';
import { readingTimeStatus } from '@/lib/reading-statistics';
import { inspectFile, METADATA_VERSION, SAMPLE_TEXT } from '@/lib/book-files';
import { ThemeButtons } from '@/components/theme-provider';
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
  const filtered = books
    .filter(
      (b) =>
        `${b.title} ${b.author} ${b.filename}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (filter === 'all' ||
          (filter === 'reading'
            ? b.lastRead > 0 && !isBookFinished(b)
            : isBookFinished(b))),
    )
    .sort((a, b) => (b.lastRead || b.addedAt) - (a.lastRead || a.addedAt));
  return (
    <main className="library-shell">
      <header className="masthead">
        <Link className="wordmark" href="/">
          <BookOpen size={27} /> Kayla’s Library
        </Link>
        <div className="masthead-actions">
          <span className="local-badge">
            <span /> Your personal reading space
          </span>
          <ThemeButtons />
        </div>
      </header>
      <section className="library-heading">
        <div>
          <p className="eyebrow">A LITTLE SPACE FOR GOOD BOOKS</p>
          <h1>Your library.</h1>
          <p>All your books. Right where you left them.</p>
        </div>
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
      </section>
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
      {recent ? (
        <section className="continue-panel">
          <div className="continue-copy">
            <span className="section-label">BACK TO YOUR STORY</span>
            <h2>{recent.title}</h2>
            <p>{recent.author}</p>
            <div className="continue-progress">
              <Progress
                value={recent.position.progress}
                aria-label="Book progress"
              />
              <span>
                {recent.position.progress}% · {positionLabel(recent.position)}
              </span>
              <span className="continue-reading-time">
                <Clock3 size={13} />
                {readingTimeStatus(
                  isBookFinished(recent),
                  isBookFinished(recent)
                    ? recent.finishedReadingTimeMs
                    : recent.readingTimeMs,
                )}
              </span>
            </div>
            <button
              className="light-button"
              onClick={() => setActiveId(recent.id)}
            >
              Continue reading <ArrowRight size={18} />
            </button>
          </div>
          <div className="continue-cover">
            <BookCover book={recent} />
          </div>
        </section>
      ) : (
        <section className="welcome-panel">
          <div>
            <span className="section-label">MAKE YOURSELF AT HOME</span>
            <h2>
              A new chapter
              <br />
              starts here.
            </h2>
            <p>
              Bring a book you love, find a comfortable spot,
              <br className="desktop-only" /> and pick up where you left off.
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
          <div className="format-list">
            <div>
              <BookOpen />
              <span>
                EPUB<small>Made for comfortable reading</small>
              </span>
            </div>
            <div>
              <FileText />
              <span>
                PDF<small>Every page, just as it was printed</small>
              </span>
            </div>
            <div>
              <FileText />
              <span>
                TXT<small>Simple words. No distractions.</small>
              </span>
            </div>
          </div>
        </section>
      )}
      <section className="shelf">
        <Tabs value={filter} onValueChange={(v) => setFilter(String(v))}>
          <div className="shelf-heading">
            <TabsList variant="line" className="shelf-tabs">
              <TabsTrigger value="all">
                <Library size={17} /> All books{' '}
                <span className="count">{books.length}</span>
              </TabsTrigger>
              <TabsTrigger value="reading">Reading</TabsTrigger>
              <TabsTrigger value="finished">Finished</TabsTrigger>
            </TabsList>
            <label className="library-search">
              <Search size={17} />
              <input
                aria-label="Search your library"
                placeholder="Find a book…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
          {['all', 'reading', 'finished'].map((tab) => (
            <TabsContent key={tab} value={tab}>
              {!ready ? (
                <output className="empty-library">
                  <LoaderCircle className="spin" /> Opening your library…
                </output>
              ) : filtered.length ? (
                <div className="book-grid">
                  {filtered.map((book) => (
                    <article className="book-card" key={book.id}>
                      <button
                        className="book-open"
                        onClick={() => setActiveId(book.id)}
                        aria-label={`Read ${book.title}`}
                      >
                        <BookCover book={book} />
                        <h3>{book.title}</h3>
                        <p>{book.author}</p>
                      </button>
                      <div className="card-progress">
                        <Progress
                          value={
                            isBookFinished(book) ? 100 : book.position.progress
                          }
                          aria-label={`${book.title} reading progress`}
                        />
                        <span>
                          {isBookFinished(book)
                            ? 'Finished'
                            : book.lastRead
                              ? `${book.position.progress}% read`
                              : 'Not started'}
                          {book.bookmarks.length > 0 && (
                            <span>
                              <Bookmark size={12} />
                              {book.bookmarks.length}
                            </span>
                          )}
                        </span>
                      </div>
                      {book.lastRead > 0 && (
                        <>
                          <p className="card-reading-time">
                            <Clock3 size={12} />
                            {readingTimeStatus(
                              isBookFinished(book),
                              isBookFinished(book)
                                ? book.finishedReadingTimeMs
                                : book.readingTimeMs,
                            )}
                          </p>
                          <p
                            className="card-location"
                            title={positionLabel(book.position)}
                          >
                            {positionLabel(book.position)}
                          </p>
                        </>
                      )}
                      <div className="book-card-footer">
                        <span>
                          {book.format.toUpperCase()} · {formatBytes(book.size)}
                        </span>
                        <div>
                          <button
                            className="icon-button"
                            title="Edit book details"
                            aria-label={'Edit ' + book.title}
                            onClick={() => openEditor(book)}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            className="icon-button"
                            title="Save or share original"
                            aria-label={`Export ${book.title}`}
                            onClick={() => void download(book)}
                          >
                            <Download size={15} />
                          </button>
                          <button
                            className="icon-button"
                            title="Remove from library"
                            aria-label={`Remove ${book.title}`}
                            onClick={() => setRemove(book)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty className="empty-library">
                  <EmptyHeader>
                    <EmptyMedia>
                      <BookOpen size={35} />
                    </EmptyMedia>
                    <EmptyTitle>
                      <h3>
                        {query
                          ? 'No books found.'
                          : filter === 'reading'
                            ? 'Your next chapter is waiting.'
                            : filter === 'finished'
                              ? 'A shelf for stories you’ve finished.'
                              : 'Your next read belongs here.'}
                      </h3>
                    </EmptyTitle>
                    <EmptyDescription>
                      {query
                        ? 'Try a different title or author.'
                        : filter === 'all'
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
      <footer>
        <HardDrive size={15} />
        <p>
          Saved on this device. Keep your original files — clearing browser data
          clears this library.
        </p>
        <span>ONE PAGE AT A TIME.</span>
      </footer>
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
