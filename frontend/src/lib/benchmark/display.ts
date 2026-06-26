/** Display-only formatting for Benchmark slugs (does not change filter values). */

const titleCaseWord = (word: string): string =>
  word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : '';

/** Title-case each word; preserves separators (space, /, _, -). */
export const toTitleCase = (text: string): string =>
  text
    .split(/([\s/_-]+)/)
    .map((part) => (/^[a-zA-Z]/.test(part) ? titleCaseWord(part) : part))
    .join('');

export const slicePickerSlugToLabel = (s: string): string => {
  if (!s) return '';
  const segmentToPhrase = (segment: string): string => {
    const words = segment
      .replace(/-/g, ' ')
      .split(/_+/)
      .flatMap((piece) => piece.trim().split(/\s+/))
      .filter(Boolean);
    return words.map(titleCaseWord).join(' ');
  };
  return s
    .replace(/^_/, '')
    .split(/___+/)
    .map(segmentToPhrase)
    .filter(Boolean)
    .join(' & ');
};

/** Filesystem-safe slice folder name */
export const slugifySliceId = (url: string): string => {
  const path = url
    .replace(/^https:\/\/www\.appsflyer\.com\/benchmarks\/?/i, '')
    .replace(/\/$/, '');
  return path.replace(/\//g, '__').replace(/[^a-zA-Z0-9_-]+/g, '_') || 'slice';
};
