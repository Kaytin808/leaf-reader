import type { Book } from 'epubjs';
import type Section from 'epubjs/types/section';
import { createTextQuote, normalizeQuoteText } from './position-model';
import type { TextQuoteAnchor } from './types';

function textNodeAt(range: Range) {
  if (range.startContainer.nodeType === Node.TEXT_NODE)
    return range.startContainer as Text;
  const document = range.startContainer.ownerDocument;
  const walker = document?.createTreeWalker(
    range.startContainer,
    NodeFilter.SHOW_TEXT,
  );
  return walker?.nextNode() as Text | null;
}

export async function captureEpubTextAnchor(book: Book, cfi: string) {
  const range = await book.getRange(cfi);
  const node = textNodeAt(range);
  if (!node?.data) throw new Error('cfi-has-no-text');
  let rawOffset = range.startContainer === node ? range.startOffset : 0;
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
