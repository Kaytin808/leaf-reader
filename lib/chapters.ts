import type { Book } from 'epubjs';
import { EpubCFI } from 'epubjs';
import type Section from 'epubjs/types/section';
import type { Location } from 'epubjs/types/rendition';
import type { Position } from './library';

export const CHAPTER_HISTORY_VERSION = 3;
export type Chapter = {
  label: string;
  href: string;
  depth: number;
  spineIndex: number;
  cfi: string;
  startsSection?: boolean;
};
type NavEntry = { label: string; href: string; subitems?: NavEntry[] };
const compare = new EpubCFI();
const normalize = (text: string) =>
  text.replace(/\s+/g, ' ').trim().toLowerCase();

// Text-point CFIs avoid ambiguous geometry in empty anchors and containers
// spanning several columns, and use the same coordinates as page mapping.
function textStart(section: Section, element: Element): string {
  const walker = section.document.createTreeWalker(element, 4);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const offset = node.textContent?.search(/\S/) ?? -1;
    if (offset >= 0) {
      const range = section.document.createRange();
      range.setStart(node, offset);
      range.collapse(true);
      return section.cfiFromRange(range);
    }
  }
  if (element.nextElementSibling)
    return textStart(section, element.nextElementSibling);
  return section.cfiFromElement(element);
}

export async function chapterIndex(book: Book): Promise<Chapter[]> {
  const result: Chapter[] = [];
  const navBase = new URL(
    book.resolve(
      book.packaging.navPath || book.packaging.ncxPath || 'toc.xhtml',
    ),
    'https://epub.local/',
  );
  const sections: Section[] = [];
  book.spine.each((section: Section) => sections.push(section));
  async function visit(items: NavEntry[], depth: number) {
    for (const item of items) {
      try {
        const url = new URL(item.href, navBase);
        if (url.origin !== navBase.origin) continue;
        const section =
          sections.find(
            (entry) =>
              decodeURIComponent(new URL(entry.url, navBase).pathname) ===
              decodeURIComponent(url.pathname),
          ) || book.section(item.href);
        if (section) {
          await Promise.resolve(section.load(book.load.bind(book)));
          const doc = section.document;
          const label = item.label.replace(/\s+/g, ' ').trim();
          const candidates = Array.from(
            doc.querySelectorAll('h1,h2,h3,h4,h5,h6,p,div'),
          );
          // Converted EPUBs can repeat one file URL for several chapters or link
          // to a wrapper containing the entire book. Find the actual heading.
          const heading = candidates.find(
            (node) =>
              normalize(node.textContent || '') === normalize(label) &&
              !node.closest('nav') &&
              !node.querySelector('a[href]') &&
              !node.querySelector('h1,h2,h3,h4,h5,h6,p,div'),
          );
          const id = decodeURIComponent(url.hash.slice(1));
          const anchor = id
            ? doc.getElementById(id) ||
              Array.from(doc.querySelectorAll('[name]')).find(
                (node) => node.getAttribute('name') === id,
              )
            : undefined;
          const target =
            heading ||
            anchor ||
            (!url.hash ? doc.body || doc.documentElement : undefined);
          if (target && label) {
            result.push({
              label,
              href: section.href + url.hash,
              depth,
              spineIndex: section.index,
              cfi: textStart(section, target),
              startsSection:
                textStart(section, target) ===
                textStart(section, doc.body || doc.documentElement),
            });
          }
        }
      } catch {
        /* Skip broken navigation entries without preventing reading. */
      }
      await visit(item.subitems || [], depth + 1);
    }
  }
  await visit(book.navigation.toc, 0);
  return result.sort(
    (a, b) => compare.compare(a.cfi, b.cfi) || a.depth - b.depth,
  );
}

export function chapterAt(
  chapters: Chapter[],
  cfi: string,
  spineIndex: number,
) {
  let found: Chapter | undefined;
  for (const chapter of chapters) {
    if (compare.compare(chapter.cfi, cfi) <= 0) found = chapter;
    else break;
  }
  // A chapter can continue across several spine files. On the first page,
  // whitespace may precede the first heading in that file.
  const first = chapters.find((chapter) => chapter.spineIndex === spineIndex);
  if (first?.startsSection && found?.spineIndex !== spineIndex) return first;
  return found || first;
}

export function repairChapterLabel(
  position: Position,
  chapters: Chapter[],
): Position {
  if (!position.location.startsWith('epubcfi(')) return position;
  const cfi = new EpubCFI(position.location);
  const chapter = chapterAt(chapters, position.location, cfi.spinePos);
  return {
    ...position,
    label: chapter?.label || `Section ${cfi.spinePos + 1}`,
    chapterHref: chapter?.href,
    chapterCfi: chapter?.cfi,
  };
}

export function positionForEpub(
  loc: Location,
  chapters: Chapter[],
  sectionCount: number,
  requestedCfi?: string,
): Position {
  const includesTarget =
    requestedCfi &&
    compare.compare(loc.start.cfi, requestedCfi) <= 0 &&
    compare.compare(requestedCfi, loc.end.cfi) <= 0;
  const location = includesTarget ? requestedCfi : loc.start.cfi;
  const progress = loc.atEnd
    ? 100
    : Math.min(
        99,
        Math.round(
          ((loc.start.index +
            (loc.start.displayed.page - 1) /
              Math.max(1, loc.start.displayed.total)) /
            Math.max(1, sectionCount)) *
            100,
        ),
      );
  return repairChapterLabel({ location, progress, label: '' }, chapters);
}
