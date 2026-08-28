import type { DictionaryOccurrence } from './types';

export function text(value: unknown): string {
  if (value == null) return '';
  return String(value);
}

export function normalized(value: unknown): string {
  return text(value).normalize('NFKC').toLocaleLowerCase();
}

export function naturalCompare(a: unknown, b: unknown): number {
  return text(a).localeCompare(text(b), undefined, { numeric: true, sensitivity: 'base' });
}

export function distinctSorted(
  rows: DictionaryOccurrence[],
  selector: (row: DictionaryOccurrence) => unknown,
): string[] {
  return Array.from(new Set(rows.map(selector).map(text).filter(Boolean))).sort(naturalCompare);
}

export function isNonUnicodePlaceholder(row: DictionaryOccurrence): boolean {
  return Boolean(row.character?.includes('['));
}

export function occurrenceSearchText(row: DictionaryOccurrence): string {
  return normalized([
    row.character,
    row.simplified,
    row.romanization,
    row.modernRomanization,
    row.simpleRomanization,
    row.latinDefinition,
    row.englishDefinition,
    row.semanticRadical,
    row.phoneticRadical,
  ].filter(Boolean).join(' '));
}
