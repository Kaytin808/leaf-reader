import type { Book } from 'epubjs';
import type Section from 'epubjs/types/section';
import { createTextQuote, normalizeQuoteText } from './position-model';
import type { TextQuoteAnchor } from './types';

function readableTextAt(range: Range) {
  const document = range.startContainer.ownerDocument;
  const root = document?.body ?? document?.documentElement;
  if (!document || !root) return null;
  if (range.startContainer.nodeType === Node.TEXT_NODE) {
    const node = range.startContainer as Text;
    if (normalizeQuoteText(node.data.slice(range.startOffset)).length >= 8)
      return { node, rawOffset: range.startOffset };
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const startToStart = document.defaultView?.Range.START_TO_START ?? 0;
  let node = walker.nextNode() as Text | null;
  while (node) {
    if (range.startContainer !== node) {
      const nodeStart = document.createRange();
      nodeStart.setStart(node, 0);
      nodeStart.collapse(true);
      const startsAtOrAfterAnchor =
        range.compareBoundaryPoints(startToStart, nodeStart) <= 0;
      if (startsAtOrAfterAnchor && normalizeQuoteText(node.data).length >= 8)
        return { node, rawOffset: 0 };
    }
    node = walker.nextNode() as Text | null;
  }
  return null;
}

export async function captureEpubTextAnchor(book: Book, cfi: string) {
  const range = await book.getRange(cfi);
  const readable = readableTextAt(range);
  if (!readable?.node.data) throw new Error('cfi-has-no-readable-text');
  const { node } = readable;
  let { rawOffset } = readable;
  while (rawOffset < node.data.length && /\s/.test(node.data[rawOffset]))
    rawOffset++;
  const leadingWhitespace = node.data.match(/^\s*/)?.[0].length ?? 0;
  const before = node.data
    .slice(leadingWhitespace, rawOffset)
    .replace(/\s+/g, ' ');
  const text = normalizeQuoteText(node.data);
  const quote = createTextQuote(text, before.length);
  if (quote.exact.length < 8) throw new Error('quote-too-short');
  const section = book.spine.get(cfi);
  return { quote, spineHref: section.href };
}

type SearchableSection = Omit<Section, 'find'> & {
  find(query: string): { cfi: string; excerpt: string }[];
};

export async function recoverEpubCfi(
  book: Book,
  spineHref: string,
  quote: TextQuoteAnchor,
) {
  const section = book.spine.get(spineHref) as unknown as SearchableSection;
  if (!section) return undefined;
  // epub.js returns a promise here although its legacy declaration says
  // `Document`; Promise.resolve supports both forms.
  await Promise.resolve(section.load(book.load.bind(book)));
  const matches = section.find(quote.exact);
  if (matches.length !== 1) return undefined;
  return matches[0].cfi;
}

export async function verifyEpubTextAnchor(
  book: Book,
  cfi: string,
  quote: TextQuoteAnchor,
) {
  try {
    const captured = await captureEpubTextAnchor(book, cfi);
    return captured.quote.exact === quote.exact;
  } catch {
    return false;
  }
}
