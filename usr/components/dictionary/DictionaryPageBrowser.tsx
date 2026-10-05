import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type {
  AntinomyRelation,
  AntinomyTerm,
  CompositeSyllable,
  CompositeWordRelation,
  DictionaryPageOccurrence,
  DictionaryPagePayload,
  GraphicVariant,
  SynonymRelation,
} from './pageTypes';
import { downloadDictionaryExport, type DictionaryExportPayload, type DictionaryExportRecord, type ExportFormat } from './exportUtils';
import './dictionary-page.css';

const PAGE_CACHE_LIMIT = 3;
const pageCache = new Map<number, DictionaryPagePayload>();

type LineGroup = {
  key: string;
  line: string | number | null;
  occurrences: DictionaryPageOccurrence[];
  special: boolean;
  specialReplacement: string | null;
};

type SynonymCandidate = { item: SynonymRelation; occurrence: DictionaryPageOccurrence };

type AntinomyCandidate = { item: AntinomyRelation; occurrence: DictionaryPageOccurrence };
type CompositeCandidate = { item: CompositeWordRelation; occurrence: DictionaryPageOccurrence };

type SynonymGroup = {
  position: string;
  candidates: SynonymCandidate[];
  representative: SynonymCandidate;
};

type Selection =
  | { kind: 'synonym'; group: SynonymGroup }
  | { kind: 'graphic'; item: GraphicVariant; occurrence: DictionaryPageOccurrence };


type DictionarySearchRelationCharacter = {
  character: string | null;
  simplified: string | null;
};

type DictionarySearchSynonym = DictionarySearchRelationCharacter & {
  romanization: string | null;
  modernRomanization: string | null;
  simpleRomanization: string | null;
};

type DictionarySearchEntry = {
  occurrenceId: string | number | null;
  page: number;
  line: string | number | null;
  wordId: string | number | null;
  characterId: string | number | null;
  character: string | null;
  simplified: string | null;
  glyphLink: string | null;
  romanization: string | null;
  modernRomanization: string | null;
  simpleRomanization: string | null;
  typology: string | null;
  latinDefinition: string | null;
  glosses: string[];
  graphicVariants: DictionarySearchRelationCharacter[];
  synonyms: DictionarySearchSynonym[];
};

type DictionarySearchPayload = {
  generatedAt: string;
  count: number;
  entries: DictionarySearchEntry[];
};

type SearchResultRow = {
  page: number;
  line: string | number | null;
  entries: DictionarySearchEntry[];
  records: DictionaryExportRecord[];
};

type SearchField = 'all' | 'character' | 'romanisation' | 'definition' | 'glosses' | 'variants' | 'synonyms';

const SEARCH_FIELD_OPTIONS: Array<{ value: SearchField; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'character', label: 'Character' },
  { value: 'romanisation', label: 'Romanization' },
  { value: 'definition', label: 'Definition' },
  { value: 'glosses', label: 'Glosses' },
  { value: 'variants', label: 'Variants' },
  { value: 'synonyms', label: 'Synonyms' },
];

let searchIndexCache: DictionarySearchPayload | null = null;
let searchIndexPromise: Promise<DictionarySearchPayload> | null = null;
let exportIndexCache: DictionaryExportPayload | null = null;
let exportIndexPromise: Promise<DictionaryExportPayload> | null = null;

function text(value: unknown): string {
  return value == null ? '' : String(value);
}

function normalize(value: unknown): string {
  return text(value).normalize('NFKC').toLocaleLowerCase();
}

function stripHtml(value: string | null | undefined): string {
  return text(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function naturalCompare(a: unknown, b: unknown): number {
  return text(a).localeCompare(text(b), undefined, { numeric: true, sensitivity: 'base' });
}

function typologyRank(value: string | null): number {
  const v = normalize(value);
  if (v === 'principale') return 0;
  if (v === 'alternativa alla principale') return 1;
  if (v === 'variante') return 2;
  if (v === 'alternativa alla variante') return 3;
  return 9;
}

function specialDefinition(value: string | null): boolean {
  const clean = normalize(stripHtml(value)).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return clean === 'change radical' || clean === 'empty page';
}

const EDITORIAL_WORD_IDS = new Set(['249', '9696']);
const EDITORIAL_SENTINELS = new Set([
  'null',
  'change radical',
  'empty page',
  'bf change radical',
  'before change radical',
  'before radical',
]);

function editorialToken(value: unknown): string {
  return normalize(value).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function specialOccurrence(row: DictionaryPageOccurrence): boolean {
  if (row.wordId != null && EDITORIAL_WORD_IDS.has(String(row.wordId))) return true;
  if (specialDefinition(row.latinDefinition)) return true;

  const character = editorialToken(row.character || row.simplified);
  const romanization = editorialToken(row.romanization);
  return Boolean(character && romanization
    && EDITORIAL_SENTINELS.has(character)
    && EDITORIAL_SENTINELS.has(romanization));
}

function isPlaceholder(character: string | null): boolean {
  return Boolean(character?.includes('['));
}

function glyphLabel(character: string | null, simplified: string | null): string {
  return isPlaceholder(character) ? (simplified || character || '—') : (character || simplified || '—');
}

function glyphDisplay(
  character: string | null,
  simplified: string | null,
  glyphLink: string | null,
) {
  const placeholder = isPlaceholder(character);
  const label = glyphLabel(character, simplified);

  if (placeholder && glyphLink) {
    return (
      <a
        className="dsl-glyph-link"
        href={glyphLink}
        target="_blank"
        rel="noreferrer"
        title="Historical non-Unicode form: open external glyph reference"
        onClick={event => event.stopPropagation()}
      >
        {label}<sup>*</sup>
      </a>
    );
  }

  return <>{label}{placeholder ? <sup>*</sup> : null}</>;
}

function characterRecordUrl(characterId: string | number | null): string | null {
  if (characterId == null) return null;
  const base = import.meta.env.BASE_URL || '/';
  return `${base.replace(/\/?$/, '/')}characters/view?id=${encodeURIComponent(String(characterId))}`;
}

function recordGlyph(
  characterId: string | number | null,
  character: string | null,
  simplified: string | null,
  glyphLink: string | null,
) {
  const label = glyphLabel(character, simplified);
  const placeholder = isPlaceholder(character);
  const recordUrl = characterRecordUrl(characterId);

  return (
    <span className="dsl-record-glyph">
      {recordUrl ? (
        <a className="dsl-character-record-link" href={recordUrl} onClick={event => event.stopPropagation()} title="Open character record">
          {label}
        </a>
      ) : <span>{label}</span>}
      {placeholder ? (glyphLink ? (
        <a
          className="dsl-external-glyph-star"
          href={glyphLink}
          target="_blank"
          rel="noreferrer"
          onClick={event => event.stopPropagation()}
          title="Open external historical glyph reference"
        >*</a>
      ) : <sup>*</sup>) : null}
    </span>
  );
}

const CJK_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

function chineseStrokeNumber(value: string | number | null): string {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return text(value);
  if (n < 10) return CJK_DIGITS[n];
  if (n < 20) return `十${n % 10 ? CJK_DIGITS[n % 10] : ''}`;
  if (n < 100) return `${CJK_DIGITS[Math.floor(n / 10)]}十${n % 10 ? CJK_DIGITS[n % 10] : ''}`;
  return String(n);
}

function rememberPage(page: number, payload: DictionaryPagePayload) {
  if (pageCache.has(page)) pageCache.delete(page);
  pageCache.set(page, payload);
  while (pageCache.size > PAGE_CACHE_LIMIT) {
    const oldest = pageCache.keys().next().value as number | undefined;
    if (oldest == null) break;
    pageCache.delete(oldest);
  }
}

function dataUrl(page: number): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.replace(/\/?$/, '/')}data/dictionary/page/${page}.json`;
}

async function fetchPage(page: number, signal?: AbortSignal): Promise<DictionaryPagePayload> {
  const cached = pageCache.get(page);
  if (cached) {
    rememberPage(page, cached);
    return cached;
  }

  const response = await fetch(dataUrl(page), { signal, cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Dictionary page ${page} could not be loaded (HTTP ${response.status}).`);
  }
  const payload = await response.json() as DictionaryPagePayload;
  rememberPage(page, payload);
  return payload;
}

function pageFromLocation(): number {
  if (typeof window === 'undefined') return 1;
  const value = Number(new URLSearchParams(window.location.search).get('page') || '1');
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function groupOccurrences(rows: DictionaryPageOccurrence[]): LineGroup[] {
  const byLine = new Map<string, DictionaryPageOccurrence[]>();

  for (const row of rows) {
    const k = text(row.line);
    const group = byLine.get(k) ?? [];
    group.push(row);
    byLine.set(k, group);
  }

  const raw = Array.from(byLine.entries())
    .map(([key, occurrences]) => ({
      key,
      line: occurrences[0]?.line ?? null,
      occurrences: [...occurrences].sort((a, b) => {
        const role = typologyRank(a.typology) - typologyRank(b.typology);
        return role || naturalCompare(a.id, b.id);
      }),
      special: occurrences.length > 0 && occurrences.every(specialOccurrence),
      specialReplacement: null as string | null,
    }))
    .sort((a, b) => naturalCompare(a.line, b.line));

  // Reconstruction rule supplied for editorial rows:
  // special lines remain empty, except when a later normal line exists on the
  // same page; then their Latin-definition cell displays the next entry's
  // historical radical value, when that field is actually available.
  for (let i = 0; i < raw.length; i += 1) {
    if (!raw[i].special) continue;
    const nextContent = raw.slice(i + 1).find(group => !group.special);
    if (!nextContent) continue;
    raw[i].specialReplacement = nextContent.occurrences
      .map(row => row.historicalRadical?.value || '')
      .find(Boolean) || null;
  }

  return raw;
}

function dedupeGraphicVariants(group: LineGroup): Array<{ item: GraphicVariant; occurrence: DictionaryPageOccurrence }> {
  const seen = new Set<string>();
  const out: Array<{ item: GraphicVariant; occurrence: DictionaryPageOccurrence }> = [];

  for (const occurrence of group.occurrences) {
    for (const item of occurrence.graphicVariants) {
      const k = [item.sourceCharacterId, item.relatedCharacterId, normalize(item.evidentialStatus)].join('|');
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ item, occurrence });
    }
  }
  return out;
}

function explicitSynonyms(group: LineGroup): SynonymCandidate[] {
  const out: SynonymCandidate[] = [];
  for (const occurrence of group.occurrences) {
    for (const item of occurrence.synonyms) {
      if (item.internal === false) continue;
      out.push({ item, occurrence });
    }
  }
  return out.sort((a, b) => {
    const pos = naturalCompare(a.item.position, b.item.position);
    if (pos) return pos;
    return naturalCompare(a.item.relationId, b.item.relationId);
  });
}

function synonymAssessmentRank(value: string | null): number {
  const v = normalize(value);
  if (v.includes('sinonimo corretto')) return 0;
  if (v.includes('sinonimi vaghi')) return 1;
  if (v.includes('no sinonimia')) return 3;
  return 2;
}

function groupSynonymsByPosition(group: LineGroup): SynonymGroup[] {
  const byPosition = new Map<string, SynonymCandidate[]>();
  for (const candidate of explicitSynonyms(group)) {
    const position = text(candidate.item.position);
    if (!['1', '2', '3', '4'].includes(position)) continue;
    const list = byPosition.get(position) ?? [];
    list.push(candidate);
    byPosition.set(position, list);
  }

  return Array.from(byPosition.entries()).map(([position, candidates]) => {
    const sorted = [...candidates].sort((a, b) => {
      const assessment = synonymAssessmentRank(a.item.assessment) - synonymAssessmentRank(b.item.assessment);
      if (assessment) return assessment;
      const reading = naturalCompare(a.item.relatedRomanization, b.item.relatedRomanization);
      if (reading) return reading;
      return naturalCompare(a.item.relationId, b.item.relationId);
    });
    return { position, candidates: sorted, representative: sorted[0] };
  }).sort((a, b) => naturalCompare(a.position, b.position));
}

function synonymCandidateSets(group: SynonymGroup) {
  const seen = new Set<string>();
  const candidates = group.candidates.filter(candidate => {
    const k = [candidate.item.relatedWordId, candidate.item.relatedRomanization, candidate.item.relatedEnglishDefinition].map(text).join('|');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const correct = candidates.filter(candidate => normalize(candidate.item.assessment).includes('sinonimo corretto'));
  const vague = candidates.filter(candidate => normalize(candidate.item.assessment).includes('sinonimi vaghi'));
  const allNegative = candidates.length > 0 && candidates.every(candidate => normalize(candidate.item.assessment).includes('no sinonimia'));

  if (correct.length) return { picks: correct, alternatives: candidates.filter(candidate => !correct.includes(candidate)) };
  if (vague.length) return { picks: vague, alternatives: candidates.filter(candidate => !vague.includes(candidate)) };
  if (allNegative) return { picks: candidates.slice(0, 1), alternatives: [] };
  return { picks: candidates.slice(0, 1), alternatives: candidates.slice(1) };
}


function isAntinomyOccurrence(row: DictionaryPageOccurrence): boolean {
  return normalize(row.typology) === 'antinomy';
}

function antinomiesForGroup(group: LineGroup): AntinomyCandidate[] {
  const seen = new Set<string>();
  const out: AntinomyCandidate[] = [];

  for (const occurrence of group.occurrences) {
    for (const item of occurrence.antinomies ?? []) {
      const relationKey = [
        item.relationId,
        item.left.wordId,
        item.right.wordId,
      ].map(text).join('|');
      if (seen.has(relationKey)) continue;
      seen.add(relationKey);
      out.push({ item, occurrence });
    }
  }

  return out;
}

function blankAntinomyDefinition(value: string | null): boolean {
  const clean = normalize(stripHtml(value)).replace(/\s+/g, ' ').trim();
  return !clean || clean === 'empty' || clean === 'null' || clean === 'nan';
}

function antinomyDefinitions(group: LineGroup): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of group.occurrences) {
    const value = row.latinDefinition;
    if (blankAntinomyDefinition(value)) continue;
    const key = text(value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function antinomyTermReading(term: AntinomyTerm): string {
  return term.romanization || term.modernRomanization || term.simpleRomanization || '—';
}

function AntinomyTermCard({ term }: { term: AntinomyTerm }) {
  return (
    <div className="dsl-ant-term">
      <span className="dsl-ant-glyph">
        {recordGlyph(term.characterId, term.character, term.simplified, term.glyphLink)}
      </span>
      <em>{antinomyTermReading(term)}</em>
    </div>
  );
}

function UnderRevisionCard() {
  return (
    <div className="dsl-ant-revision" title="The manuscript contains a lexical item here, but its stable database relation has not yet been encoded.">
      <span>UNDER REVISION</span>
      <small>relation not yet resolved</small>
    </div>
  );
}


function isCompositeOccurrence(row: DictionaryPageOccurrence): boolean {
  return normalize(row.typology) === 'composti';
}

function blankCompositeDefinition(value: string | null): boolean {
  const clean = normalize(stripHtml(value)).replace(/\s+/g, ' ').trim();
  return !clean || clean === 'empty' || clean === 'null' || clean === 'nan';
}

function compositesForOccurrence(occurrence: DictionaryPageOccurrence): CompositeCandidate[] {
  return [...(occurrence.composites ?? [])]
    .sort((a, b) => naturalCompare(a.compositeId, b.compositeId))
    .map(item => ({ item, occurrence }));
}

function unresolvedWordReference(value: unknown): boolean {
  const clean = normalize(value).trim();
  return !clean || clean === 'null' || clean === 'nan';
}

function compositeSlots(group: LineGroup): Array<{ occurrence: DictionaryPageOccurrence | null; item: CompositeWordRelation | null; blank: boolean; unresolved: boolean }> {
  const sorted = [...group.occurrences].sort((a, b) => naturalCompare(a.id, b.id));
  return [0, 1].map(index => {
    const occurrence = sorted[index] ?? null;
    if (!occurrence) return { occurrence: null, item: null, blank: true, unresolved: false };
    const blank = blankCompositeDefinition(occurrence.latinDefinition);
    const item = blank ? null : compositesForOccurrence(occurrence)[0]?.item ?? null;
    const unresolved = !blank && (!item || unresolvedWordReference(item.second?.wordId));
    return { occurrence, item, blank, unresolved };
  });
}

function compositeFirstSyllable(rows: DictionaryPageOccurrence[]): CompositeSyllable {
  for (const row of [...rows].sort((a, b) => naturalCompare(a.id, b.id))) {
    const first = compositesForOccurrence(row)[0]?.item.first;
    if (first && (first.character || first.simplified || first.romanization)) return first;
  }
  return {
    wordId: null,
    characterId: null,
    character: '打',
    simplified: '打',
    glyphLink: null,
    romanizationId: null,
    romanization: 'ta\\',
    modernRomanization: null,
    simpleRomanization: null,
  };
}

function compositeReading(term: CompositeSyllable): string {
  return term.romanization || term.modernRomanization || term.simpleRomanization || '—';
}

function CompositeTermCard({ term }: { term: CompositeSyllable }) {
  return (
    <div className="dsl-comp-term">
      <span className="dsl-comp-glyph">
        {recordGlyph(term.characterId, term.character, term.simplified, term.glyphLink)}
      </span>
      <em>{compositeReading(term)}</em>
    </div>
  );
}

function isParticulaeNumeralesOccurrence(row: DictionaryPageOccurrence): boolean {
  return normalize(row.typology) === 'particulae numerales';
}

function blankParticulaeDefinition(value: string | null): boolean {
  return blankCompositeDefinition(value);
}

function occurrenceAsAppendixTerm(occurrence: DictionaryPageOccurrence): CompositeSyllable {
  return {
    wordId: occurrence.wordId,
    characterId: occurrence.characterId,
    character: occurrence.character,
    simplified: occurrence.simplified,
    glyphLink: occurrence.glyphLink,
    romanizationId: occurrence.romanizationId,
    romanization: occurrence.romanization,
    modernRomanization: occurrence.modernRomanization,
    simpleRomanization: occurrence.simpleRomanization,
  };
}

function particulaeSlots(group: LineGroup): Array<{ occurrence: DictionaryPageOccurrence | null; blank: boolean; unresolved: boolean }> {
  const sorted = [...group.occurrences].sort((a, b) => naturalCompare(a.id, b.id));
  return [0, 1].map(index => {
    const occurrence = sorted[index] ?? null;
    if (!occurrence) return { occurrence: null, blank: true, unresolved: false };
    const blank = blankParticulaeDefinition(occurrence.latinDefinition);
    const unresolved = !blank && unresolvedWordReference(occurrence.wordId);
    return { occurrence, blank, unresolved };
  });
}

function positionClass(position: string): string {
  return `pos-${position}`;
}

function strokeMarker(group: LineGroup): string {
  const boundary = group.occurrences.find(row => row.strokeBoundary);
  return boundary ? chineseStrokeNumber(boundary.historicalStrokes) : '';
}

function isMainAlternative(row: DictionaryPageOccurrence): boolean {
  return normalize(row.typology) === 'alternativa alla principale';
}

function isVariantOccurrence(row: DictionaryPageOccurrence): boolean {
  return normalize(row.typology) === 'variante';
}

function isVariantAlternative(row: DictionaryPageOccurrence): boolean {
  return normalize(row.typology) === 'alternativa alla variante';
}

function englishTypologyLabel(value: string | null): string {
  const v = normalize(value);
  if (v === 'principale') return 'Main';
  if (v === 'alternativa alla principale') return 'Alternative to main';
  if (v === 'variante') return 'Variant';
  if (v === 'alternativa alla variante') return 'Alternative to variant';
  return value || 'Other';
}

function englishSynonymAssessment(value: string | null): string {
  const v = normalize(value);
  if (v.includes('sinonimo corretto')) return 'Confirmed synonym';
  if (v.includes('sinonimi vaghi')) return 'Vague synonymy';
  if (v.includes('no sinonimia')) return 'No synonymy';
  return value || 'Unassessed';
}

function visibleSynonymNote(value: string | null): string | null {
  if (!value) return null;
  const v = normalize(value).replace(/[.,;:!?]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (v.includes('il carattere era probabilmente associato a diversa romanizzazione')) return null;
  if (v.includes('probabilmente associato') && v.includes('diversa romanizzazione')) return null;
  return value;
}

function SlashBreakText({ value }: { value: string }) {
  const parts = text(value).split('/');
  return (
    <>
      {parts.map((part, index) => (
        <span className="dsl-slash-chunk" key={`${index}-${part}`}>
          {part}{index < parts.length - 1 ? <><span aria-hidden="true">/</span><wbr /></> : null}
        </span>
      ))}
    </>
  );
}

function foldedSearch(value: unknown): string {
  return normalize(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[˘¯ˆ^'’`´·]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function searchIndexUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.replace(/\/?$/, '/')}data/dictionary/search-index.json?v=relation-search-3`;
}

function exportIndexUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.replace(/\/?$/, '/')}data/dictionary/export-index.json?v=structured-export-2`;
}

async function fetchExportIndex(): Promise<DictionaryExportPayload> {
  if (exportIndexCache) return exportIndexCache;
  if (!exportIndexPromise) {
    exportIndexPromise = fetch(exportIndexUrl(), { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error(`Dictionary export index could not be loaded (HTTP ${response.status}).`);
        const payload = await response.json() as DictionaryExportPayload;
        exportIndexCache = payload;
        return payload;
      })
      .finally(() => { exportIndexPromise = null; });
  }
  return exportIndexPromise;
}

async function fetchSearchIndex(): Promise<DictionarySearchPayload> {
  if (searchIndexCache) return searchIndexCache;
  if (!searchIndexPromise) {
    searchIndexPromise = fetch(searchIndexUrl(), { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error(`Dictionary search index could not be loaded (HTTP ${response.status}).`);
        const payload = await response.json() as DictionarySearchPayload;
        searchIndexCache = payload;
        return payload;
      })
      .finally(() => { searchIndexPromise = null; });
  }
  return searchIndexPromise;
}

function searchScore(entry: DictionarySearchEntry, rawQuery: string, fields: SearchField[] = ['all']): number | null {
  const query = normalize(rawQuery);
  const foldedQuery = foldedSearch(rawQuery);
  if (!query) return null;

  const searchAll = fields.length === 0 || fields.includes('all');
  const includesField = (field: Exclude<SearchField, 'all'>) => searchAll || fields.includes(field);
  let best: number | null = null;
  const consider = (score: number, matched: boolean) => {
    if (matched && (best == null || score < best)) best = score;
  };
  const exactPrefixContains = (values: string[], exactScore: number, prefixScore: number, containsScore: number) => {
    consider(exactScore, values.some(value => value === query));
    consider(prefixScore, values.some(value => value.startsWith(query)));
    consider(containsScore, values.some(value => value.includes(query)));
  };

  if (includesField('character')) {
    // Historical and simplified forms are intentionally searched together.
    const values = [entry.character, entry.simplified].filter(Boolean).map(value => normalize(value));
    exactPrefixContains(values, 0, 10, 20);
  }

  if (includesField('romanisation')) {
    const values = [entry.romanization, entry.modernRomanization, entry.simpleRomanization]
      .filter(Boolean)
      .map(value => normalize(value));
    const foldedValues = [entry.romanization, entry.modernRomanization, entry.simpleRomanization]
      .filter(Boolean)
      .map(foldedSearch);
    exactPrefixContains(values, 1, 11, 21);
    if (foldedQuery) {
      consider(30, foldedValues.some(value => value === foldedQuery));
      consider(31, foldedValues.some(value => value.startsWith(foldedQuery)));
      consider(32, foldedValues.some(value => value.includes(foldedQuery)));
    }
  }

  if (includesField('variants')) {
    // Graphic variants also match their simplified Chinese form.
    const values = (entry.graphicVariants ?? [])
      .flatMap(item => [item.character, item.simplified])
      .filter(Boolean)
      .map(value => normalize(value));
    exactPrefixContains(values, 2, 12, 22);
  }

  if (includesField('synonyms')) {
    // Synonyms match historical/simplified characters and all available readings.
    const characterValues = (entry.synonyms ?? [])
      .flatMap(item => [item.character, item.simplified])
      .filter(Boolean)
      .map(value => normalize(value));
    const romanValues = (entry.synonyms ?? [])
      .flatMap(item => [item.romanization, item.modernRomanization, item.simpleRomanization])
      .filter(Boolean)
      .map(value => normalize(value));
    const foldedRomanValues = (entry.synonyms ?? [])
      .flatMap(item => [item.romanization, item.modernRomanization, item.simpleRomanization])
      .filter(Boolean)
      .map(foldedSearch);
    exactPrefixContains(characterValues, 3, 13, 23);
    exactPrefixContains(romanValues, 4, 14, 24);
    if (foldedQuery) {
      consider(33, foldedRomanValues.some(value => value === foldedQuery));
      consider(34, foldedRomanValues.some(value => value.startsWith(foldedQuery)));
      consider(35, foldedRomanValues.some(value => value.includes(foldedQuery)));
    }
  }

  if (includesField('definition')) {
    const definition = normalize(entry.latinDefinition);
    const foldedDefinition = foldedSearch(entry.latinDefinition);
    if (definition) {
      consider(40, definition === query);
      consider(41, definition.startsWith(query));
      consider(42, definition.includes(query));
      if (foldedQuery) consider(43, foldedDefinition.includes(foldedQuery));
    }
  }

  if (includesField('glosses')) {
    const values = (entry.glosses ?? []).filter(Boolean).map(value => normalize(value));
    const foldedValues = (entry.glosses ?? []).filter(Boolean).map(foldedSearch);
    exactPrefixContains(values, 44, 45, 46);
    if (foldedQuery) consider(47, foldedValues.some(value => value.includes(foldedQuery)));
  }

  return best;
}

function matchingSearchEntries(entries: DictionarySearchEntry[], rawQuery: string, fields: SearchField[] = ['all']): DictionarySearchEntry[] {
  const scored = entries
    .map(entry => ({ entry, score: searchScore(entry, rawQuery, fields) }))
    .filter((item): item is { entry: DictionarySearchEntry; score: number } => item.score != null)
    .sort((a, b) => a.score - b.score
      || a.entry.page - b.entry.page
      || naturalCompare(a.entry.line, b.entry.line)
      || naturalCompare(a.entry.romanization, b.entry.romanization));

  // Relations in appendix rows can yield more than one lexical search entry for
  // the same occurrence. Keep the best-scoring representative in the UI/export.
  const seen = new Set<string>();
  const deduped: DictionarySearchEntry[] = [];
  for (const item of scored) {
    const key = item.entry.occurrenceId == null
      ? `${item.entry.page}|${item.entry.line ?? ''}|${item.entry.wordId ?? ''}`
      : String(item.entry.occurrenceId);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item.entry);
  }
  return deduped;
}

function searchDefinitionSnippet(entry: DictionarySearchEntry): string {
  const value = text(entry.latinDefinition).replace(/\s+/g, ' ').trim();
  if (!value) return '';
  return value.length > 115 ? `${value.slice(0, 112)}…` : value;
}

function searchGlyph(entry: DictionarySearchEntry): string {
  return isPlaceholder(entry.character)
    ? `${entry.simplified || entry.character || '—'}*`
    : (entry.character || entry.simplified || '—');
}

function resultLocusKey(page: string | number | null | undefined, line: string | number | null | undefined): string {
  return `${text(page)}|${text(line)}`;
}

function resultRecordTypologyRank(record: DictionaryExportRecord): number {
  return typologyRank(record.typology);
}

function uniqueSearchRecords(records: DictionaryExportRecord[]): DictionaryExportRecord[] {
  const seen = new Set<string>();
  return records.filter(record => {
    const key = String(record.occurrenceId);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => resultRecordTypologyRank(a) - resultRecordTypologyRank(b)
    || naturalCompare(a.occurrenceId, b.occurrenceId));
}

function resultGraphicVariants(records: DictionaryExportRecord[]) {
  const seen = new Set<string>();
  return records.flatMap(record => record.graphicVariants ?? []).filter(item => {
    const key = [item.character, item.simplified, normalize(item.status), item.glyphLink].map(text).join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resultSynonyms(records: DictionaryExportRecord[]) {
  const candidates = records.flatMap(record => record.synonyms ?? [])
    .filter(item => item.internal !== false);
  const positioned = candidates.filter(item => ['1', '2', '3', '4'].includes(text(item.position)));

  if (positioned.length) {
    const byPosition = new Map<string, typeof positioned>();
    for (const item of positioned) {
      const position = text(item.position);
      const list = byPosition.get(position) ?? [];
      list.push(item);
      byPosition.set(position, list);
    }
    return Array.from(byPosition.entries())
      .sort(([a], [b]) => naturalCompare(a, b))
      .map(([, items]) => [...items].sort((a, b) => {
        const assessment = synonymAssessmentRank(a.assessment) - synonymAssessmentRank(b.assessment);
        if (assessment) return assessment;
        return naturalCompare(a.romanisation, b.romanisation);
      })[0]);
  }

  const seen = new Set<string>();
  return candidates.filter(item => {
    const key = [item.character, item.simplified, item.romanisation, normalize(item.assessment)].map(text).join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function SearchResultFolioRow({ result, onOpen }: { result: SearchResultRow; onOpen: () => void }) {
  const records = uniqueSearchRecords(result.records);
  const fallbackEntry = result.entries[0];
  const primary = records.find(record => normalize(record.typology) === 'principale') ?? records[0] ?? null;
  const secondaryReadings = records.filter(record => normalize(record.typology) === 'alternativa alla principale' && Boolean(record.romanisation));
  const variants = records.filter(record => normalize(record.typology) === 'variante');
  const hiddenDefinitionIds = new Set(
    records
      .filter(record => ['alternativa alla principale', 'alternativa alla variante'].includes(normalize(record.typology)))
      .map(record => String(record.occurrenceId)),
  );
  const extraDefinitions = records.filter(record => {
    if (primary && String(record.occurrenceId) === String(primary.occurrenceId)) return false;
    if (hiddenDefinitionIds.has(String(record.occurrenceId))) return false;
    if (normalize(record.typology) === 'variante') return false;
    return Boolean(record.latinDefinition);
  });
  const graphics = resultGraphicVariants(records);
  const synonyms = resultSynonyms(records);
  const glosses = uniqueValues(records.flatMap(record => (record.glosses ?? []).map(item => item.value)));
  const radical = records.map(record => record.historicalRadical).find(Boolean) || '';
  const page = result.page;
  const line = result.line;

  const fallbackCharacter = fallbackEntry
    ? (isPlaceholder(fallbackEntry.character)
      ? `${fallbackEntry.simplified || fallbackEntry.character || '—'}*`
      : (fallbackEntry.character || fallbackEntry.simplified || '—'))
    : '—';
  const antonym = records.flatMap(record => record.antonyms ?? [])[0];
  const compound = records.flatMap(record => record.compounds ?? [])[0];
  const relatedCharacterFallback = antonym
    ? `${antonym.leftCharacter || '—'} ↔ ${antonym.rightCharacter || '—'}`
    : compound ? `${compound.firstCharacter || '—'} + ${compound.secondCharacter || '—'}` : fallbackCharacter;
  const relatedReadingFallback = antonym
    ? `${antonym.leftRomanisation || '—'} ↔ ${antonym.rightRomanisation || '—'}`
    : compound ? `${compound.firstRomanisation || '—'} + ${compound.secondRomanisation || '—'}` : null;
  const primaryCharacter = primary
    ? glyphDisplay(primary.character, primary.simplified, primary.glyphLink)
    : fallbackEntry
      ? glyphDisplay(fallbackEntry.character, fallbackEntry.simplified, fallbackEntry.glyphLink)
      : relatedCharacterFallback;
  const primaryReading = primary?.romanisation || primary?.modernRomanisation || primary?.simpleRomanisation
    || fallbackEntry?.romanization || fallbackEntry?.modernRomanization || fallbackEntry?.simpleRomanization
    || relatedReadingFallback || primary?.typology || fallbackEntry?.typology || '—';

  return (
    <article
      className="dsl-entry dsl-search-table-row"
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      title={`Open page ${page}${line != null && text(line) ? `, line ${line}` : ''}`}
    >
      <div className="dsl-cell dsl-search-locus-cell">
        <strong>p. {page}</strong>
        <span>{line != null && text(line) ? `l. ${line}` : '—'}</span>
      </div>
      <div className="dsl-cell dsl-search-radical-cell">
        {radical ? <strong className="dsl-search-radical">{radical}</strong> : <span className="dsl-muted">—</span>}
      </div>
      <div className="dsl-cell dsl-lexeme dsl-search-lexeme">
        <span className="dsl-main-char">{primaryCharacter}</span>
        <div className="dsl-reading-stack">
          <em className="dsl-main-reading">{primaryReading}</em>
          {secondaryReadings.map(record => (
            <div className="dsl-secondary-reading" key={String(record.occurrenceId)}>
              <span aria-hidden="true" />
              <em>{record.romanisation}</em>
            </div>
          ))}
        </div>
      </div>
      <div className="dsl-cell dsl-definition dsl-search-definition">
        {primary?.latinDefinition ? (
          <div className={variants.some(record => Boolean(record.latinDefinition)) ? 'dsl-main-definition with-variants' : 'dsl-main-definition'}>
            {variants.some(record => Boolean(record.latinDefinition)) ? <span className="dsl-definition-label">Main definition</span> : null}
            <DefinitionHtml html={primary.latinDefinition} />
          </div>
        ) : fallbackEntry?.latinDefinition ? <DefinitionHtml html={fallbackEntry.latinDefinition} /> : null}
        {variants.map(record => record.latinDefinition ? (
          <div className="dsl-def-block dsl-variant-definition" key={String(record.occurrenceId)}>
            <div className="dsl-def-type">
              <span>(Variant)</span>
              {record.romanisation ? <b>{record.romanisation}</b> : null}
            </div>
            <div className="dsl-def-copy"><DefinitionHtml html={record.latinDefinition} /></div>
          </div>
        ) : null)}
        {extraDefinitions.map(record => (
          <div className="dsl-def-block" key={String(record.occurrenceId)}>
            <div className="dsl-def-type">
              <span>({englishTypologyLabel(record.typology)})</span>
              {record.romanisation ? <b>{record.romanisation}</b> : null}
            </div>
            <div className="dsl-def-copy"><DefinitionHtml html={record.latinDefinition} /></div>
          </div>
        ))}
        {!primary?.latinDefinition && !fallbackEntry?.latinDefinition && !variants.some(record => Boolean(record.latinDefinition)) && !extraDefinitions.length ? (
          <span className="dsl-muted">—</span>
        ) : null}
      </div>
      <div className="dsl-cell dsl-gloss dsl-search-gloss">
        {glosses.length ? glosses.map(value => <span key={value}><GlossText value={value} /></span>) : <span className="dsl-muted">—</span>}
      </div>
      <div className="dsl-cell dsl-graphic dsl-search-relations">
        {graphics.length ? graphics.map((item, index) => (
          <span className="dsl-search-relation-token" key={`${item.character || item.simplified || 'variant'}-${index}`}>
            {glyphLabel(item.character, item.simplified)}{isPlaceholder(item.character) ? <sup>*</sup> : null}
          </span>
        )) : <span className="dsl-muted">—</span>}
      </div>
      <div className="dsl-cell dsl-synonyms dsl-search-relations">
        {synonyms.length ? synonyms.map((item, index) => (
          <span className="dsl-search-relation-token" key={`${item.character || item.simplified || 'synonym'}-${item.position ?? index}`}>
            {glyphLabel(item.character, item.simplified)}{isPlaceholder(item.character) ? <sup>*</sup> : null}
            {item.romanisation ? <em>{item.romanisation}</em> : null}
          </span>
        )) : <span className="dsl-muted">—</span>}
      </div>
    </article>
  );
}

function primaryOccurrence(group: LineGroup): DictionaryPageOccurrence | undefined {
  return group.occurrences.find(row => normalize(row.typology) === 'principale') ?? group.occurrences[0];
}

function uniqueValues(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function DefinitionHtml({ html }: { html: string | null }) {
  if (!html) return null;
  // latin_definition_2 is an editorial field and intentionally stores inline HTML.
  return <div className="dsl-latin-html" dangerouslySetInnerHTML={{ __html: html }} />;
}

function GlossNoteModal({ note, onClose }: { note: string; onClose: () => void }) {
  return (
    <div
      className="dsl-gloss-note-backdrop"
      role="presentation"
      onMouseDown={event => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="dsl-gloss-note-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Gloss note"
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="dsl-gloss-note-head">
          <div>
            <span className="dsl-gloss-note-kicker">EDITORIAL NOTE</span>
            <strong>Gloss note</strong>
          </div>
          <button type="button" className="dsl-gloss-note-close" onClick={onClose} aria-label="Close gloss note">×</button>
        </div>
        <div className="dsl-gloss-note-copy">{note}</div>
      </div>
    </div>
  );
}

function GlossText({ value }: { value: string }) {
  const [activeNote, setActiveNote] = useState<string | null>(null);
  const raw = text(value);

  // Two supported editorial syntaxes coexist in the source data:
  //   *[https://…] / *(https://…)  -> external glyph reference
  //   *[editorial note] / *(editorial note) -> local note modal
  // For backwards compatibility, a bare [URL] or (URL) is still accepted.
  // Non-starred bracketed text (e.g. [?役]) is deliberately left untouched.
  const marker = /\*{1,3}\s*(?:\(([^)]*)\)|\[([^\]]*)\])|(?:\((https?:\/\/[^)\s]+)\)|\[(https?:\/\/[^\]\s]+)\])/giu;
  const parts: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = marker.exec(raw)) !== null) {
    const before = raw.slice(cursor, match.index);
    const payload = (match[1] ?? match[2] ?? match[3] ?? match[4] ?? '').trim();
    const isUrl = /^https?:\/\/\S+$/iu.test(payload);
    const characterMatch = before.match(/^(.*)(\p{Script=Han})(\s*)$/us);

    if (!payload) {
      parts.push(before, match[0]);
      cursor = marker.lastIndex;
      continue;
    }

    if (characterMatch) {
      if (characterMatch[1]) parts.push(characterMatch[1]);

      if (isUrl) {
        parts.push(
          <a
            className="dsl-gloss-ref"
            href={payload}
            target="_blank"
            rel="noreferrer"
            title="Open external character reference"
            onClick={event => event.stopPropagation()}
            key={`gloss-ref-${key++}`}
          >
            {characterMatch[2]}<sup>*</sup>
          </a>,
        );
      } else {
        parts.push(
          <button
            type="button"
            className="dsl-gloss-note-ref"
            title="Open editorial gloss note"
            aria-label={`Open note attached to ${characterMatch[2]}`}
            onClick={event => {
              event.stopPropagation();
              setActiveNote(payload);
            }}
            key={`gloss-note-${key++}`}
          >
            {characterMatch[2]}<sup>*</sup>
          </button>,
        );
      }

      if (characterMatch[3]) parts.push(characterMatch[3]);
    } else {
      // A note may occasionally occupy the whole gloss and therefore have no
      // preceding Han character (e.g. a standalone "*(see image …)" marker).
      parts.push(before);
      if (isUrl) {
        parts.push(
          <a
            className="dsl-gloss-note-standalone external"
            href={payload}
            target="_blank"
            rel="noreferrer"
            title="Open external gloss reference"
            onClick={event => event.stopPropagation()}
            key={`gloss-standalone-url-${key++}`}
          >
            REF.*
          </a>,
        );
      } else {
        parts.push(
          <button
            type="button"
            className="dsl-gloss-note-standalone"
            onClick={event => {
              event.stopPropagation();
              setActiveNote(payload);
            }}
            key={`gloss-standalone-note-${key++}`}
          >
            NOTE*
          </button>,
        );
      }
    }

    cursor = marker.lastIndex;
  }

  if (cursor === 0) return <>{raw}</>;
  if (cursor < raw.length) parts.push(raw.slice(cursor));

  return (
    <>
      {parts}
      {activeNote ? <GlossNoteModal note={activeNote} onClose={() => setActiveNote(null)} /> : null}
    </>
  );
}

function statusClass(value: string | null | undefined): string {
  const normalized = normalize(value);
  if (normalized.includes('corretto')) return 'good';
  if (normalized.includes('vagh')) return 'vague';
  if (normalized.includes('no sinon')) return 'negative';
  return '';
}

export default function DictionaryPageBrowser() {
  const [requestedPage, setRequestedPage] = useState(1);
  const [payload, setPayload] = useState<DictionaryPagePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [pageDraft, setPageDraft] = useState('1');
  const [searchIndex, setSearchIndex] = useState<DictionarySearchPayload | null>(searchIndexCache);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchFieldsOpen, setSearchFieldsOpen] = useState(false);
  const [searchFields, setSearchFields] = useState<SearchField[]>(['all']);
  const searchFieldsRef = useRef<HTMLDivElement | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [searchResultsView, setSearchResultsView] = useState(false);
  const [searchResultRows, setSearchResultRows] = useState<SearchResultRow[]>([]);
  const [searchResultsLoading, setSearchResultsLoading] = useState(false);
  const [searchResultsError, setSearchResultsError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [historicalStrokesFilter, setHistoricalStrokesFilter] = useState('');
  const [modernStrokesFilter, setModernStrokesFilter] = useState('');
  const [typologyFilter, setTypologyFilter] = useState('');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [activeLine, setActiveLine] = useState<string>('');
  const [locationReady, setLocationReady] = useState(false);
  const deferredQuery = useDeferredValue(query.trim());

  useEffect(() => {
    if (!searchFieldsOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && searchFieldsRef.current?.contains(target)) return;
      setSearchFieldsOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [searchFieldsOpen]);

  useEffect(() => {
    const initial = pageFromLocation();
    setRequestedPage(initial);
    setPageDraft(String(initial));
    setLocationReady(true);

    const onPopState = () => {
      const next = pageFromLocation();
      setRequestedPage(next);
      setPageDraft(String(next));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (!locationReady) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchPage(requestedPage, controller.signal)
      .then(next => {
        setPayload(next);
        setLoading(false);
        setHistoricalStrokesFilter('');
        setModernStrokesFilter('');
        setTypologyFilter('');

        const groups = groupOccurrences(next.data);
        const compositeMode = next.data.some(isCompositeOccurrence);
        const navigableGroups = compositeMode ? groups.filter(group => text(group.line) !== '1') : groups;
        const firstContent = navigableGroups.find(group => !group.special) ?? navigableGroups[0];
        const requestedLine = new URLSearchParams(window.location.search).get('line');
        const syntheticFirstRequested = compositeMode && requestedLine === '1';
        const requestedGroup = requestedLine == null || syntheticFirstRequested
          ? undefined
          : navigableGroups.find(group => text(group.line) === requestedLine || group.key === requestedLine);
        const activeGroup = requestedGroup ?? firstContent;
        setActiveLine(syntheticFirstRequested ? 'compound-first' : (activeGroup?.key ?? ''));
        if (syntheticFirstRequested || requestedGroup) {
          window.setTimeout(() => {
            const targetId = syntheticFirstRequested
              ? 'dsl-line-compound-first'
              : `dsl-line-${encodeURIComponent(requestedGroup!.key)}`;
            document.getElementById(targetId)
              ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 0);
        }

        const firstSynonymGroup = activeGroup
          ? groupSynonymsByPosition(activeGroup)[0]
          : groups.flatMap(group => groupSynonymsByPosition(group))[0];
        if (firstSynonymGroup) {
          setSelection({ kind: 'synonym', group: firstSynonymGroup });
        } else {
          const firstGraphic = groups
            .flatMap(group => dedupeGraphicVariants(group))
            .find(Boolean);
          setSelection(firstGraphic
            ? { kind: 'graphic', item: firstGraphic.item, occurrence: firstGraphic.occurrence }
            : null);
        }
      })
      .catch(err => {
        if (err?.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });

    return () => controller.abort();
  }, [requestedPage, locationReady]);

  useEffect(() => {
    setPageDraft(String(requestedPage));
  }, [requestedPage]);

  useEffect(() => {
    setExportError(null);
    setExportMenuOpen(false);
  }, [deferredQuery, historicalStrokesFilter, modernStrokesFilter, typologyFilter]);

  useEffect(() => {
    if (!deferredQuery || searchIndex) return;
    let active = true;
    setSearchLoading(true);
    setSearchError(null);
    fetchSearchIndex()
      .then(next => {
        if (!active) return;
        setSearchIndex(next);
        setSearchLoading(false);
      })
      .catch(err => {
        if (!active) return;
        setSearchError(err instanceof Error ? err.message : String(err));
        setSearchLoading(false);
      });
    return () => { active = false; };
  }, [deferredQuery, searchIndex]);

  const groups = useMemo(() => groupOccurrences(payload?.data ?? []), [payload]);
  const isAntinomyPage = useMemo(() => (payload?.data ?? []).some(isAntinomyOccurrence), [payload]);
  const isCompositePage = useMemo(() => (payload?.data ?? []).some(isCompositeOccurrence), [payload]);
  const isParticulaePage = useMemo(() => (payload?.data ?? []).some(isParticulaeNumeralesOccurrence), [payload]);
  const firstCompositeSyllable = useMemo(() => compositeFirstSyllable(payload?.data ?? []), [payload]);
  const filterOptions = useMemo(() => {
    const data = payload?.data ?? [];
    return {
      historicalStrokes: uniqueValues(data.map(row => text(row.historicalStrokes) || null)).sort(naturalCompare),
      modernStrokes: uniqueValues(data.map(row => text(row.modernStrokes) || null)).sort(naturalCompare),
      typologies: uniqueValues(data.map(row => row.typology)).sort(naturalCompare),
    };
  }, [payload]);

  const visibleGroups = useMemo(() => {
    return groups.filter(group => {
      if (isCompositePage && text(group.line) === '1') return false;
      if (historicalStrokesFilter && !group.occurrences.some(row => text(row.historicalStrokes) === historicalStrokesFilter)) return false;
      if (modernStrokesFilter && !group.occurrences.some(row => text(row.modernStrokes) === modernStrokesFilter)) return false;
      if (typologyFilter && !group.occurrences.some(row => text(row.typology) === typologyFilter)) return false;
      return true;
    });
  }, [groups, historicalStrokesFilter, modernStrokesFilter, typologyFilter, isCompositePage]);

  const allSearchMatches = useMemo(() => {
    if (!deferredQuery || !searchIndex) return [] as DictionarySearchEntry[];
    return matchingSearchEntries(searchIndex.entries, deferredQuery, searchFields);
  }, [deferredQuery, searchIndex, searchFields]);

  const searchMatches = useMemo(() => ({
    total: allSearchMatches.length,
    entries: allSearchMatches.slice(0, 30),
  }), [allSearchMatches]);

  const hasLocalFilters = Boolean(historicalStrokesFilter || modernStrokesFilter || typologyFilter);
  const hasScopedSearchFields = !searchFields.includes('all');
  const hasExportableFilter = Boolean(deferredQuery || hasLocalFilters);
  const searchFieldButtonLabel = searchFields.includes('all')
    ? 'ALL FIELDS'
    : searchFields.length === 1
      ? (SEARCH_FIELD_OPTIONS.find(option => option.value === searchFields[0])?.label.toUpperCase() || '1 FIELD')
      : `${searchFields.length} FIELDS`;
  const searchPlaceholder = searchFields.includes('all')
    ? 'Search all dictionary fields…'
    : searchFields.length === 1
      ? `Search ${SEARCH_FIELD_OPTIONS.find(option => option.value === searchFields[0])?.label.toLocaleLowerCase() || 'field'}…`
      : 'Search selected fields…';

  const pageMeta = useMemo(() => {
    const source = payload?.data ?? [];
    return {
      radicals: uniqueValues(source.map(row => row.historicalRadical?.value)),
      strokes: uniqueValues(source.map(row => text(row.historicalStrokes) || null)),
      branches: uniqueValues(source.map(row => row.earthlyBranch?.value)),
      strokeBoundary: source.some(row => row.strokeBoundary),
    };
  }, [payload]);

  function navigate(page: number) {
    const max = payload?.maxPage ?? Number.POSITIVE_INFINITY;
    const next = Math.max(1, Math.min(page, max));
    if (next === requestedPage) return;
    const url = new URL(window.location.href);
    if (next === 1) url.searchParams.delete('page');
    else url.searchParams.set('page', String(next));
    url.searchParams.delete('line');
    window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
    setRequestedPage(next);
  }

  function navigateToLocus(page: number, line: string | number | null) {
    const max = payload?.maxPage ?? Number.POSITIVE_INFINITY;
    const next = Math.max(1, Math.min(page, max));
    const lineValue = line == null ? '' : String(line);
    const url = new URL(window.location.href);
    if (next === 1) url.searchParams.delete('page');
    else url.searchParams.set('page', String(next));
    if (lineValue) url.searchParams.set('line', lineValue);
    else url.searchParams.delete('line');
    window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
    setQuery('');
    setSearchOpen(false);
    setSearchFieldsOpen(false);
    setSearchResultsView(false);
    setSearchResultRows([]);
    setSearchResultsError(null);

    if (next !== requestedPage) {
      setRequestedPage(next);
      return;
    }

    if (lineValue) {
      const syntheticFirst = isCompositePage && lineValue === '1';
      setActiveLine(syntheticFirst ? 'compound-first' : lineValue);
      window.setTimeout(() => {
        const targetId = syntheticFirst ? 'dsl-line-compound-first' : `dsl-line-${encodeURIComponent(lineValue)}`;
        document.getElementById(targetId)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 0);
    }
  }

  async function openSearchResultsView() {
    if (!deferredQuery || searchResultsLoading) return;
    setSearchOpen(false);
    setSearchResultsView(true);
    setSearchResultsLoading(true);
    setSearchResultsError(null);

    try {
      const index = searchIndex ?? await fetchSearchIndex();
      if (!searchIndex) setSearchIndex(index);
      const matches = matchingSearchEntries(index.entries, deferredQuery, searchFields);
      const exportPayload = await fetchExportIndex();
      const recordById = new Map(exportPayload.records.map(record => [String(record.occurrenceId), record] as const));
      const recordsByLocus = new Map<string, DictionaryExportRecord[]>();
      for (const record of exportPayload.records) {
        const page = Number(record.page);
        if (!Number.isFinite(page) || page < 1) continue;
        const key = resultLocusKey(Math.trunc(page), record.line);
        const list = recordsByLocus.get(key) ?? [];
        list.push(record);
        recordsByLocus.set(key, list);
      }

      const grouped = new Map<string, SearchResultRow>();
      for (const entry of matches) {
        const key = resultLocusKey(entry.page, entry.line);
        const current = grouped.get(key) ?? {
          page: entry.page,
          line: entry.line,
          entries: [],
          records: [...(recordsByLocus.get(key) ?? [])],
        };
        current.entries.push(entry);
        if (entry.occurrenceId != null) {
          const matchedRecord = recordById.get(String(entry.occurrenceId));
          if (matchedRecord && !current.records.some(record => String(record.occurrenceId) === String(matchedRecord.occurrenceId))) {
            current.records.push(matchedRecord);
          }
        }
        grouped.set(key, current);
      }

      setSearchResultRows(Array.from(grouped.values()).sort((a, b) => a.page - b.page
        || naturalCompare(a.line, b.line)));
    } catch (err) {
      setSearchResultRows([]);
      setSearchResultsError(err instanceof Error ? err.message : String(err));
    } finally {
      setSearchResultsLoading(false);
    }
  }

  function toggleSearchField(field: SearchField) {
    setSearchFields(current => {
      if (field === 'all') return ['all'];
      const scoped = current.filter(item => item !== 'all');
      const next = scoped.includes(field)
        ? scoped.filter(item => item !== field)
        : [...scoped, field];
      return next.length ? next : ['all'];
    });
    setSearchResultsView(false);
    setSearchResultRows([]);
    setSearchResultsError(null);
  }

  function resetDictionaryView() {
    setQuery('');
    setSearchOpen(false);
    setSearchFieldsOpen(false);
    setSearchFields(['all']);
    setSearchResultsView(false);
    setSearchResultRows([]);
    setSearchResultsError(null);
    setHistoricalStrokesFilter('');
    setModernStrokesFilter('');
    setTypologyFilter('');
    setFiltersOpen(false);
    setExportMenuOpen(false);
    setExportError(null);
  }

  async function exportFilteredResults(format: ExportFormat) {
    if (!hasExportableFilter || exportLoading) return;
    setExportMenuOpen(false);
    setExportLoading(true);
    setExportError(null);

    try {
      const exportPayload = await fetchExportIndex();
      let selectedIds = new Set<string>();
      let label = `page_${requestedPage}_filters`;

      if (deferredQuery) {
        const index = searchIndex ?? await fetchSearchIndex();
        selectedIds = new Set(
          matchingSearchEntries(index.entries, deferredQuery, searchFields)
            .map(entry => entry.occurrenceId == null ? '' : String(entry.occurrenceId))
            .filter(Boolean),
        );
        label = `search_${deferredQuery}`;
      } else {
        selectedIds = new Set(
          visibleGroups.flatMap(group => group.occurrences.map(row => String(row.id))),
        );
      }

      const records = exportPayload.records.filter(record => selectedIds.has(String(record.occurrenceId)));
      if (!records.length) throw new Error('The active filter does not contain exportable dictionary rows.');

      downloadDictionaryExport(records, format, window.location.href, label);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setExportLoading(false);
    }
  }

  function submitPageJump(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(pageDraft);
    if (!Number.isInteger(value) || value < 1) {
      setPageDraft(String(requestedPage));
      return;
    }
    navigate(value);
  }

  function focusLine(lineKey: string) {
    setActiveLine(lineKey);
    const node = document.getElementById(`dsl-line-${encodeURIComponent(lineKey)}`);
    node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  const maxPage = payload?.maxPage ?? null;

  return (
    <div className={`dsl-app ${isAntinomyPage ? 'dsl-mode-antinomy' : ''} ${isCompositePage ? 'dsl-mode-compounds' : ''} ${isParticulaePage ? 'dsl-mode-numerales' : ''} ${searchResultsView ? 'dsl-results-mode' : ''}`}>
      <div className="dsl-page-toolbar" aria-label="Dictionary page controls">
        <div className="dsl-page-tools">
          <form className="dsl-page-label dsl-page-jump" onSubmit={submitPageJump} title="Type a page number and press Enter">
            <span>Page</span>
            <input
              type="number"
              min={1}
              max={maxPage ?? undefined}
              inputMode="numeric"
              value={pageDraft}
              onChange={event => setPageDraft(event.target.value)}
              onFocus={event => event.currentTarget.select()}
              onBlur={() => { if (!pageDraft) setPageDraft(String(requestedPage)); }}
              aria-label="Go directly to dictionary page"
            />
          </form>
          <button
            type="button"
            className="dsl-icon-button"
            onClick={() => navigate(requestedPage - 1)}
            disabled={requestedPage <= 1 || loading}
            aria-label="Previous dictionary page"
          >‹</button>
          <button
            type="button"
            className="dsl-icon-button"
            onClick={() => navigate(requestedPage + 1)}
            disabled={Boolean(maxPage && requestedPage >= maxPage) || loading}
            aria-label="Next dictionary page"
          >›</button>
          <div className="dsl-search-cluster">
            <div
              ref={searchFieldsRef}
              className="dsl-search-field-select"
            >
              <button
                type="button"
                className={`dsl-search-field-button ${searchFieldsOpen ? 'open' : ''}`}
                onClick={() => {
                  setSearchOpen(false);
                  setSearchFieldsOpen(value => !value);
                }}
                aria-haspopup="true"
                aria-expanded={searchFieldsOpen}
                title="Choose which dictionary fields to search"
              >
                <span>{searchFieldButtonLabel}</span>
                <span className="dsl-search-field-caret" aria-hidden="true">⌄</span>
              </button>
              {searchFieldsOpen ? (
                <div className="dsl-search-field-menu" role="group" aria-label="Search fields">
                  {SEARCH_FIELD_OPTIONS.map(option => {
                    const checked = option.value === 'all'
                      ? searchFields.includes('all')
                      : searchFields.includes(option.value);
                    return (
                      <label className={`dsl-search-field-option ${checked ? 'checked' : ''}`} key={option.value}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSearchField(option.value)}
                        />
                        <span className="dsl-search-field-check" aria-hidden="true">{checked ? '✓' : ''}</span>
                        <span>{option.label}</span>
                      </label>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <div className="dsl-search-wrap">
              <label className="dsl-search">
              <span aria-hidden="true">⌕</span>
              <input
                value={query}
                onChange={event => {
                  setQuery(event.target.value);
                  setSearchOpen(true);
                  setSearchResultsView(false);
                  setSearchResultRows([]);
                  setSearchResultsError(null);
                }}
                onFocus={() => {
                  setSearchFieldsOpen(false);
                  if (query.trim()) setSearchOpen(true);
                }}
                onBlur={() => window.setTimeout(() => setSearchOpen(false), 140)}
                placeholder={searchPlaceholder}
                aria-label="Search the selected dictionary fields across the whole dictionary"
                aria-expanded={Boolean(searchOpen && deferredQuery)}
                aria-controls="dsl-global-search-results"
                autoComplete="off"
              />
            </label>
            {searchOpen && deferredQuery ? (
              <div className="dsl-search-results" id="dsl-global-search-results" role="listbox">
                <div className="dsl-search-results-head">
                  <span>ALL PAGES</span>
                  {!searchLoading && !searchError && searchIndex ? (
                    <div className="dsl-search-results-head-actions">
                      <small>{searchMatches.total} matches</small>
                      {searchMatches.total > 0 ? (
                        <button
                          type="button"
                          className="dsl-search-view-all"
                          onMouseDown={event => event.preventDefault()}
                          onClick={() => void openSearchResultsView()}
                        >
                          VIEW ROWS
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                {searchLoading ? <div className="dsl-search-state">Loading dictionary index…</div> : null}
                {searchError ? <div className="dsl-search-state error">{searchError}</div> : null}
                {!searchLoading && !searchError && searchIndex && searchMatches.entries.length === 0 ? (
                  <div className="dsl-search-state">No matches in the selected search fields.</div>
                ) : null}
                {!searchLoading && !searchError ? searchMatches.entries.map((entry, index) => (
                  <button
                    type="button"
                    className="dsl-search-result"
                    key={`${entry.page}-${entry.line ?? ''}-${entry.wordId ?? index}`}
                    role="option"
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => navigateToLocus(entry.page, entry.line)}
                  >
                    <strong>{searchGlyph(entry)}</strong>
                    <span className="dsl-search-result-reading">{entry.romanization || entry.modernRomanization || entry.simpleRomanization || entry.typology || '—'}</span>
                    <span className="dsl-search-result-definition">{searchDefinitionSnippet(entry)}</span>
                    <span className="dsl-search-result-locus">p. {entry.page}{entry.line != null && text(entry.line) ? ` · l. ${entry.line}` : ''}</span>
                  </button>
                )) : null}
                {!searchLoading && !searchError && searchMatches.total > searchMatches.entries.length ? (
                  <div className="dsl-search-more">Showing first {searchMatches.entries.length} of {searchMatches.total} matches.</div>
                ) : null}
              </div>
            ) : null}
            </div>
          </div>
          {hasExportableFilter ? (
            <div className="dsl-export-wrap">
              <button
                type="button"
                className={`dsl-export-button ${exportMenuOpen ? 'open' : ''}`}
                onClick={() => setExportMenuOpen(value => !value)}
                disabled={exportLoading}
                title="Download the active filtered result"
                aria-haspopup="menu"
                aria-expanded={exportMenuOpen}
              >
                <span aria-hidden="true">⇩</span>{exportLoading ? 'PREPARING…' : 'DOWNLOAD'}
              </button>
              {exportMenuOpen ? (
                <div className="dsl-export-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => void exportFilteredResults('json')}>JSON <small>structured</small></button>
                  <button type="button" role="menuitem" onClick={() => void exportFilteredResults('csv')}>CSV <small>UTF-8</small></button>
                  <button type="button" role="menuitem" onClick={() => void exportFilteredResults('xlsx')}>XLSX <small>Excel</small></button>
                </div>
              ) : null}
              {exportError ? <div className="dsl-export-error" role="alert">{exportError}</div> : null}
            </div>
          ) : null}
          {hasExportableFilter || searchResultsView || hasScopedSearchFields ? (
            <button
              type="button"
              className="dsl-reset-button"
              onClick={resetDictionaryView}
              title="Clear search and filters and return to the normal page view"
            >
              <span aria-hidden="true">↺</span>RESET
            </button>
          ) : null}
        </div>
      </div>

      <div className="dsl-layout">
        <aside className="dsl-left">
          <section className="dsl-page-box">
            <small>PAGE</small>
            <strong>{requestedPage}</strong>
            <div className="dsl-page-nav">
              <button type="button" onClick={() => navigate(requestedPage - 1)} disabled={requestedPage <= 1 || loading}>‹</button>
              <span>│</span>
              <button type="button" onClick={() => navigate(requestedPage + 1)} disabled={Boolean(maxPage && requestedPage >= maxPage) || loading}>›</button>
            </div>
          </section>

          <div className="dsl-locus-list">
            {isCompositePage ? (
              <button
                type="button"
                className={`dsl-locus-link dsl-comp-first-locus ${activeLine === 'compound-first' ? 'active' : ''}`}
                onClick={() => {
                  setActiveLine('compound-first');
                  document.getElementById('dsl-line-compound-first')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
              >
                <span>
                  <span className="dsl-locus-line">Line 1</span>
                  <span className="dsl-locus-word dsl-comp-first-locus-word">
                    <span className="dsl-locus-glyph">{glyphDisplay(firstCompositeSyllable.character, firstCompositeSyllable.simplified, firstCompositeSyllable.glyphLink)}</span>
                    <em>{compositeReading(firstCompositeSyllable)}</em>
                  </span>
                </span>
                <span className="dsl-count">1</span>
              </button>
            ) : null}
            {groups.filter(group => !(isCompositePage && text(group.line) === '1')).map(group => {
              const primary = primaryOccurrence(group);
              const firstAntinomy = antinomiesForGroup(group)[0];
              return (
                <button
                  type="button"
                  className={`dsl-locus-link ${activeLine === group.key ? 'active' : ''} ${group.special ? 'special' : ''}`}
                  onClick={() => focusLine(group.key)}
                  key={group.key}
                >
                  <span>
                    <span className="dsl-locus-line">Line {text(group.line) || '—'}</span>
                    {isAntinomyPage ? (
                      firstAntinomy ? (
                        <span className="dsl-locus-word dsl-ant-locus-pair">
                          <span className="dsl-locus-glyph">{glyphDisplay(firstAntinomy.item.left.character, firstAntinomy.item.left.simplified, firstAntinomy.item.left.glyphLink)}</span>
                          <span className="dsl-ant-locus-arrow">↔</span>
                          <span className="dsl-locus-glyph">{glyphDisplay(firstAntinomy.item.right.character, firstAntinomy.item.right.simplified, firstAntinomy.item.right.glyphLink)}</span>
                        </span>
                      ) : <span className="dsl-locus-word dsl-empty-word">—</span>
                    ) : isCompositePage ? (() => {
                      const slots = compositeSlots(group);
                      const left = slots[0]?.item?.second;
                      const right = slots[1]?.item?.second;
                      const hasState = slots.some(slot => !slot.blank);
                      if (!hasState) return <span className="dsl-locus-word dsl-empty-word">—</span>;
                      return (
                        <span className="dsl-locus-word dsl-comp-locus-pair">
                          <span className={`dsl-locus-glyph ${slots[0]?.unresolved ? 'dsl-locus-revision' : ''}`}>{slots[0]?.unresolved ? 'REV.' : left ? glyphDisplay(left.character, left.simplified, left.glyphLink) : '—'}</span>
                          <span className="dsl-comp-locus-divider">│</span>
                          <span className={`dsl-locus-glyph ${slots[1]?.unresolved ? 'dsl-locus-revision' : ''}`}>{slots[1]?.unresolved ? 'REV.' : right ? glyphDisplay(right.character, right.simplified, right.glyphLink) : '—'}</span>
                        </span>
                      );
                    })() : isParticulaePage ? (() => {
                      const slots = particulaeSlots(group);
                      const terms = slots.map(slot => slot.occurrence && !slot.blank && !slot.unresolved ? occurrenceAsAppendixTerm(slot.occurrence) : null);
                      if (!slots.some(slot => !slot.blank)) return <span className="dsl-locus-word dsl-empty-word">—</span>;
                      return (
                        <span className="dsl-locus-word dsl-comp-locus-pair">
                          <span className={`dsl-locus-glyph ${slots[0]?.unresolved ? 'dsl-locus-revision' : ''}`}>{slots[0]?.unresolved ? 'REV.' : terms[0] ? glyphDisplay(terms[0].character, terms[0].simplified, terms[0].glyphLink) : '—'}</span>
                          <span className="dsl-comp-locus-divider">│</span>
                          <span className={`dsl-locus-glyph ${slots[1]?.unresolved ? 'dsl-locus-revision' : ''}`}>{slots[1]?.unresolved ? 'REV.' : terms[1] ? glyphDisplay(terms[1].character, terms[1].simplified, terms[1].glyphLink) : '—'}</span>
                        </span>
                      );
                    })() : !group.special && primary ? (
                      <span className="dsl-locus-word">
                        <span className="dsl-locus-glyph">{glyphDisplay(primary.character, primary.simplified, primary.glyphLink)}</span>
                        <em>{primary.romanization || ''}</em>
                      </span>
                    ) : <span className="dsl-locus-word dsl-empty-word">—</span>}
                  </span>
                  <span className="dsl-count">{group.occurrences.length}</span>
                </button>
              );
            })}
            {!loading && groups.length === 0 && <p className="dsl-empty-sidebar">No encoded lines on this page.</p>}
          </div>

          {isAntinomyPage ? (
            <section className="dsl-ant-appendix-meta">
              <span className="dsl-ant-kicker">APPENDIX MODE</span>
              <h3>ANTINOMY</h3>
              <p>Paired lexical oppositions encoded through occurrence-backed character–reading relations.</p>
            </section>
          ) : isCompositePage ? (
            <section className="dsl-ant-appendix-meta dsl-comp-appendix-meta">
              <span className="dsl-ant-kicker">APPENDIX MODE</span>
              <h3>COMPOUNDS</h3>
              <p>Disyllabic constructions reconstructed from occurrence-backed composite-word relations.</p>
            </section>
          ) : isParticulaePage ? (
            <section className="dsl-ant-appendix-meta dsl-num-appendix-meta">
              <span className="dsl-ant-kicker">APPENDIX MODE</span>
              <h3>PARTICULAE NUMERALES</h3>
              <p>Numeral particles arranged as paired character–definition entries in manuscript order.</p>
            </section>
          ) : null}

          <section className="dsl-index-meta">
            <h3>HISTORICAL INDEX</h3>
            <dl>
              <div><dt>Radical</dt><dd>{pageMeta.radicals.join(', ') || '—'}</dd></div>
              <div><dt>Strokes</dt><dd>{pageMeta.strokes.join(', ') || '—'}</dd></div>
              <div><dt>Branch</dt><dd>{pageMeta.branches.join(', ') || '—'}</dd></div>
              <div><dt>Boundary</dt><dd>{pageMeta.strokeBoundary ? 'yes' : '—'}</dd></div>
            </dl>
            <p className="dsl-index-note">Historical indexing metadata remain distinct from the modern radical and stroke count.</p>
          </section>

          {filtersOpen ? (
            <section className="dsl-filter-panel">
              <label>Historical strokes
                <select value={historicalStrokesFilter} onChange={event => setHistoricalStrokesFilter(event.target.value)}>
                  <option value="">All</option>
                  {filterOptions.historicalStrokes.map(value => <option value={value} key={value}>{value}</option>)}
                </select>
              </label>
              <label>Modern strokes
                <select value={modernStrokesFilter} onChange={event => setModernStrokesFilter(event.target.value)}>
                  <option value="">All</option>
                  {filterOptions.modernStrokes.map(value => <option value={value} key={value}>{value}</option>)}
                </select>
              </label>
              <label>Occurrence role
                <select value={typologyFilter} onChange={event => setTypologyFilter(event.target.value)}>
                  <option value="">All</option>
                  {filterOptions.typologies.map(value => <option value={value} key={value}>{value}</option>)}
                </select>
              </label>
              <button type="button" className="dsl-filter-reset" onClick={() => {
                setHistoricalStrokesFilter('');
                setModernStrokesFilter('');
                setTypologyFilter('');
              }}>Clear filters</button>
            </section>
          ) : null}

          <div className="dsl-filter-toggle-wrap">
            <button type="button" className={`dsl-filter-toggle ${filtersOpen ? 'open' : ''}`} onClick={() => setFiltersOpen(value => !value)}>
              <span aria-hidden="true">☷</span> FILTERS
            </button>
          </div>
        </aside>

        <main className="dsl-folio" aria-busy={loading}>
          <div className={`dsl-folio-head ${searchResultsView ? 'dsl-search-results-head-row' : ''} ${isAntinomyPage ? 'dsl-ant-head' : ''} ${isCompositePage ? 'dsl-comp-head' : ''} ${isParticulaePage ? 'dsl-num-head' : ''}`}>
            {searchResultsView ? (
              <>
                <div>PAGE / LINE</div>
                <div>RADICAL</div>
                <div>CHARACTER</div>
                <div>DEFINITION(S)</div>
                <div>GLOSSES</div>
                <div>GRAPHIC<br />VARIANTS</div>
                <div>SYNONYMS</div>
              </>
            ) : isAntinomyPage ? (
              <>
                <div>CHARACTER</div>
                <div>CHARACTER</div>
                <div>DEFINITION(S)</div>
                <div aria-label="Reserved empty appendix column" />
              </>
            ) : isCompositePage || isParticulaePage ? (
              <>
                <div>CHARACTER</div>
                <div>DEFINITION(S)</div>
                <div>CHARACTER</div>
                <div>DEFINITION(S)</div>
              </>
            ) : (
              <>
                <div aria-label="Stroke section" />
                <div>CHARACTER</div>
                <div>DEFINITION(S)</div>
                <div>GLOSSES</div>
                <div>GRAPHIC<br />VARIANTS</div>
                <div>SYNONYMS</div>
              </>
            )}
          </div>

          <div className="dsl-folio-body">
            {searchResultsView ? (
              <>
                {searchResultsLoading ? <div className="dsl-loading"><span /> Loading all matching rows…</div> : null}
                {searchResultsError ? <div className="dsl-message dsl-error">{searchResultsError}</div> : null}
                {!searchResultsLoading && !searchResultsError && searchResultRows.length === 0 ? (
                  <div className="dsl-message">No matching rows for “{deferredQuery}”.</div>
                ) : null}
                {!searchResultsLoading && !searchResultsError ? searchResultRows.map((result, index) => (
                  <SearchResultFolioRow
                    key={`${result.page}-${result.line ?? ''}-${index}`}
                    result={result}
                    onOpen={() => navigateToLocus(result.page, result.line)}
                  />
                )) : null}
              </>
            ) : (
              <>
            {error && <div className="dsl-message dsl-error">{error}</div>}
            {!error && payload?.warnings?.length ? (
              <details className="dsl-warning">
                <summary>Some optional scholarly-apparatus data could not be loaded.</summary>
                <ul>{payload.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
              </details>
            ) : null}

            {!error && isCompositePage ? (
              <article className="dsl-entry dsl-comp-entry dsl-comp-first-row" id="dsl-line-compound-first">
                <div className="dsl-cell dsl-comp-character-cell" aria-hidden="true" />
                <div className="dsl-cell dsl-comp-first-cell"><CompositeTermCard term={firstCompositeSyllable} /></div>
                <div className="dsl-cell dsl-comp-character-cell" aria-hidden="true" />
                <div className="dsl-cell dsl-comp-first-cell"><CompositeTermCard term={firstCompositeSyllable} /></div>
              </article>
            ) : null}

            {!error && visibleGroups.map(group => {
              if (isAntinomyPage) {
                const pairs = antinomiesForGroup(group);
                const definitions = antinomyDefinitions(group);
                const completelyBlank = pairs.length === 0 && definitions.length === 0;
                const unresolved = pairs.length === 0 && !completelyBlank;

                return (
                  <article
                    id={`dsl-line-${encodeURIComponent(group.key)}`}
                    className={`dsl-entry dsl-ant-entry ${completelyBlank ? 'dsl-ant-empty' : ''} ${unresolved ? 'dsl-ant-unresolved' : ''}`}
                    key={group.key}
                    onClick={() => setActiveLine(group.key)}
                  >
                    <div className="dsl-cell dsl-ant-character-cell">
                      {completelyBlank ? null : pairs.length ? (
                        <div className="dsl-ant-term-stack">
                          {pairs.map(({ item }) => <AntinomyTermCard term={item.left} key={`left-${item.relationId}-${item.left.wordId}`} />)}
                        </div>
                      ) : <UnderRevisionCard />}
                    </div>

                    <div className="dsl-cell dsl-ant-character-cell">
                      {completelyBlank ? null : pairs.length ? (
                        <div className="dsl-ant-term-stack">
                          {pairs.map(({ item }) => <AntinomyTermCard term={item.right} key={`right-${item.relationId}-${item.right.wordId}`} />)}
                        </div>
                      ) : <UnderRevisionCard />}
                    </div>

                    <div className="dsl-cell dsl-definition dsl-ant-definition">
                      {completelyBlank ? null : definitions.map((definition, index) => (
                        <div className="dsl-main-definition" key={`${group.key}-ant-def-${index}`}>
                          <DefinitionHtml html={definition} />
                        </div>
                      ))}
                    </div>

                    <div className="dsl-cell dsl-ant-reserved" aria-hidden="true" />
                  </article>
                );
              }

              if (isCompositePage) {
                const slots = compositeSlots(group);
                return (
                  <article
                    id={`dsl-line-${encodeURIComponent(group.key)}`}
                    className="dsl-entry dsl-comp-entry"
                    key={group.key}
                    onClick={() => setActiveLine(group.key)}
                  >
                    {slots.flatMap((slot, index) => {
                      const occurrence = slot.occurrence;
                      const second = slot.item?.second ?? null;
                      const definition = occurrence?.latinDefinition ?? null;
                      const characterCell = (
                        <div className={`dsl-cell dsl-comp-character-cell ${slot.blank ? 'dsl-comp-empty-cell' : ''} ${slot.unresolved ? 'dsl-comp-unresolved-cell' : ''}`} key={`${group.key}-comp-char-${index}`}>
                          {!slot.blank ? (slot.unresolved ? <UnderRevisionCard /> : second ? <CompositeTermCard term={second} /> : null) : null}
                        </div>
                      );
                      const definitionCell = (
                        <div className={`dsl-cell dsl-definition dsl-comp-definition ${slot.blank ? 'dsl-comp-empty-cell' : ''}`} key={`${group.key}-comp-def-${index}`}>
                          {!slot.blank && definition ? <DefinitionHtml html={definition} /> : null}
                        </div>
                      );
                      return [characterCell, definitionCell];
                    })}
                  </article>
                );
              }

              if (isParticulaePage) {
                const slots = particulaeSlots(group);
                return (
                  <article
                    id={`dsl-line-${encodeURIComponent(group.key)}`}
                    className="dsl-entry dsl-comp-entry dsl-num-entry"
                    key={group.key}
                    onClick={() => setActiveLine(group.key)}
                  >
                    {slots.flatMap((slot, index) => {
                      const occurrence = slot.occurrence;
                      const definition = occurrence?.latinDefinition ?? null;
                      const term = occurrence && !slot.blank && !slot.unresolved ? occurrenceAsAppendixTerm(occurrence) : null;
                      const characterCell = (
                        <div className={`dsl-cell dsl-comp-character-cell ${slot.blank ? 'dsl-comp-empty-cell' : ''} ${slot.unresolved ? 'dsl-comp-unresolved-cell' : ''}`} key={`${group.key}-num-char-${index}`}>
                          {!slot.blank ? (slot.unresolved ? <UnderRevisionCard /> : term ? <CompositeTermCard term={term} /> : null) : null}
                        </div>
                      );
                      const definitionCell = (
                        <div className={`dsl-cell dsl-definition dsl-comp-definition ${slot.blank ? 'dsl-comp-empty-cell' : ''}`} key={`${group.key}-num-def-${index}`}>
                          {!slot.blank && definition ? <DefinitionHtml html={definition} /> : null}
                        </div>
                      );
                      return [characterCell, definitionCell];
                    })}
                  </article>
                );
              }

              const primary = primaryOccurrence(group);
              const graphics = dedupeGraphicVariants(group);
              const synonymGroups = groupSynonymsByPosition(group);
              const glosses = uniqueValues(group.occurrences.flatMap(row => row.glosses.map(item => item.value)));
              const secondaryReadings = group.occurrences.filter(row => isMainAlternative(row) && Boolean(row.romanization));
              const variants = group.occurrences.filter(row => isVariantOccurrence(row));
              const hiddenDefinitionIds = new Set(
                group.occurrences
                  .filter(row => isMainAlternative(row) || isVariantAlternative(row))
                  .map(row => String(row.id)),
              );
              const extraDefinitions = group.occurrences.filter(row => {
                if (primary && String(row.id) === String(primary.id)) return false;
                if (hiddenDefinitionIds.has(String(row.id))) return false;
                if (isVariantOccurrence(row)) return false;
                return Boolean(row.latinDefinition);
              });
              const hasVariantDefinition = variants.some(row => Boolean(row.latinDefinition));

              return (
                <article
                  id={`dsl-line-${encodeURIComponent(group.key)}`}
                  className={`dsl-entry ${group.special ? 'dsl-special-entry' : ''}`}
                  key={group.key}
                  onClick={() => setActiveLine(group.key)}
                >
                  <div className="dsl-cell dsl-stroke-cell" title={strokeMarker(group) ? `Stroke-section boundary: ${text(group.occurrences.find(row => row.strokeBoundary)?.historicalStrokes)}` : undefined}>
                    {strokeMarker(group)}
                  </div>

                  {group.special ? (
                    <>
                      <div className="dsl-cell" />
                      <div className="dsl-cell dsl-special-definition">{group.specialReplacement || ''}</div>
                      <div className="dsl-cell" />
                      <div className="dsl-cell" />
                      <div className="dsl-cell" />
                    </>
                  ) : (
                    <>
                      <div className="dsl-cell dsl-lexeme">
                        {primary ? (
                          <>
                            <span className="dsl-main-char">
                              {recordGlyph(primary.characterId, primary.character, primary.simplified, primary.glyphLink)}
                            </span>
                            <div className="dsl-reading-stack">
                              <em className="dsl-main-reading">{primary.romanization || '—'}</em>
                              {secondaryReadings.map(occurrence => (
                                <div className="dsl-secondary-reading" key={String(occurrence.id)}>
                                  <span aria-hidden="true" />
                                  <em>{occurrence.romanization}</em>
                                </div>
                              ))}
                            </div>
                          </>
                        ) : null}
                      </div>

                      <div className="dsl-cell dsl-definition">
                        {primary?.latinDefinition ? (
                          <div className={`dsl-main-definition ${hasVariantDefinition ? 'with-variants' : ''}`}>
                            {hasVariantDefinition ? <span className="dsl-definition-label">Main definition</span> : null}
                            <DefinitionHtml html={primary.latinDefinition} />
                          </div>
                        ) : null}

                        {variants.map(occurrence => occurrence.latinDefinition ? (
                          <div className="dsl-def-block dsl-variant-definition" key={String(occurrence.id)}>
                            <div className="dsl-def-type">
                              <span>(Variant)</span>
                              {occurrence.romanization ? <b>{occurrence.romanization}</b> : null}
                            </div>
                            <div className="dsl-def-copy"><DefinitionHtml html={occurrence.latinDefinition} /></div>
                          </div>
                        ) : null)}

                        {extraDefinitions.map(occurrence => (
                          <div className="dsl-def-block" key={String(occurrence.id)}>
                            <div className="dsl-def-type">
                              <span>({englishTypologyLabel(occurrence.typology)})</span>
                              {occurrence.romanization ? <b>{occurrence.romanization}</b> : null}
                            </div>
                            <div className="dsl-def-copy"><DefinitionHtml html={occurrence.latinDefinition} /></div>
                          </div>
                        ))}
                      </div>

                      <div className="dsl-cell dsl-gloss">
                        {glosses.length ? glosses.map(value => <span key={value}><GlossText value={value} /></span>) : <span className="dsl-muted">—</span>}
                      </div>

                      <div className="dsl-cell dsl-graphic">
                        {graphics.length ? graphics.map(({ item, occurrence }) => (
                          <div className="dsl-graphic-item" key={`${item.relationId}-${item.relatedCharacterId}`}>
                            <button
                              type="button"
                              className={`dsl-glyph-tile ${selection?.kind === 'graphic' && String(selection.item.relationId) === String(item.relationId) ? 'selected' : ''}`}
                              onClick={event => {
                                event.stopPropagation();
                                setSelection({ kind: 'graphic', item, occurrence });
                                setActiveLine(group.key);
                              }}
                              title={item.evidentialStatus || 'Inspect graphic relation'}
                            >
                              {glyphLabel(item.relatedCharacter, item.relatedSimplified)}{isPlaceholder(item.relatedCharacter) ? <sup>*</sup> : null}
                            </button>
                            {item.relatedCharacterId != null ? (
                              <a className="dsl-record-mini-link" href={characterRecordUrl(item.relatedCharacterId) || '#'} onClick={event => event.stopPropagation()} title="Open character record">record ↗</a>
                            ) : null}
                            {isPlaceholder(item.relatedCharacter) && item.relatedGlyphLink ? (
                              <a className="dsl-record-mini-link external" href={item.relatedGlyphLink} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()} title="Open external historical glyph reference">glyph *</a>
                            ) : null}
                          </div>
                        )) : <span className="dsl-muted">—</span>}
                      </div>

                      <div className="dsl-cell dsl-synonyms">
                        {synonymGroups.length ? synonymGroups.map(synonymGroup => {
                          const { representative } = synonymGroup;
                          const selected = selection?.kind === 'synonym' && selection.group.position === synonymGroup.position
                            && String(selection.group.representative.item.relatedCharacterId) === String(representative.item.relatedCharacterId);
                          return (
                            <button
                              type="button"
                              className={`dsl-syn ${positionClass(synonymGroup.position)} ${selected ? 'selected' : ''}`}
                              key={`pos-${synonymGroup.position}`}
                              onClick={event => {
                                event.stopPropagation();
                                setSelection({ kind: 'synonym', group: synonymGroup });
                                setActiveLine(group.key);
                              }}
                              aria-label={`Synonym position ${synonymGroup.position}: ${glyphLabel(representative.item.relatedCharacter, representative.item.relatedSimplified)}`}
                            >
                              <span className="dsl-syn-word">
                                {glyphLabel(representative.item.relatedCharacter, representative.item.relatedSimplified)}
                                {isPlaceholder(representative.item.relatedCharacter) ? <sup>*</sup> : null}
                              </span>
                            </button>
                          );
                        }) : <span className="dsl-muted dsl-no-relations">—</span>}
                      </div>
                    </>
                  )}
                </article>
              );
            })}

            {!loading && !error && visibleGroups.length === 0 && (
              <div className="dsl-message">No lines match the active page filters on page {requestedPage}.</div>
            )}

            {loading && <div className="dsl-loading"><span /> Loading page {requestedPage}…</div>}
              </>
            )}
          </div>

          <footer className="dsl-folio-foot">
            {searchResultsView ? (
              <>
                <span>{searchResultRows.length} matching rows · query “{deferredQuery}”</span>
                <span>cross-page search results · click a row to open its locus</span>
              </>
            ) : (
              <>
                <span>{payload ? `${payload.count} occurrences · ${payload.lineCount} printed lines` : 'Dictionary page'}</span>
                <span>{isAntinomyPage ? 'antinomy appendix reconstruction' : isCompositePage ? 'compound appendix reconstruction' : isParticulaePage ? 'particulae numerales appendix reconstruction' : 'page-by-page Directus reconstruction'}</span>
              </>
            )}
          </footer>
        </main>

        <aside className="dsl-inspector-shell">
          <div className="dsl-inspector-title">SCHOLARLY INSPECTOR</div>
          <div className="dsl-inspector">
            {!selection ? (
              <div className="dsl-inspector-empty">
                <span className="dsl-rosette-large">✺</span>
                <p>Select a graphic variant or synonym to inspect its documentary relation.</p>
              </div>
            ) : selection.kind === 'synonym' ? (
              <SynonymInspector selection={selection} />
            ) : (
              <GraphicInspector selection={selection} />
            )}

            <div className="dsl-inspector-nav">
              <button type="button" onClick={() => navigate(requestedPage - 1)} disabled={requestedPage <= 1 || loading} aria-label="Previous page">‹</button>
              <button type="button" className="active" onClick={() => setSelection(null)} aria-label="Clear relation selection">⌘</button>
              <button type="button" onClick={() => navigate(requestedPage + 1)} disabled={Boolean(maxPage && requestedPage >= maxPage) || loading} aria-label="Next page">›</button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function SynonymInspector({ selection }: { selection: Extract<Selection, { kind: 'synonym' }> }) {
  const { group } = selection;
  const { representative } = group;
  const { item, occurrence } = representative;
  const { picks, alternatives } = synonymCandidateSets(group);
  const relationLabel = `Synonym position ${group.position}`;

  const candidateCard = (candidate: SynonymCandidate, index: number, preferred: boolean) => {
    const candidateItem = candidate.item;
    return (
      <article className={`dsl-syn-candidate ${preferred ? 'preferred' : ''}`} key={`${candidateItem.relatedWordId}-${candidateItem.relationId}-${index}`}>
        <div className="dsl-syn-candidate-head">
          <strong>{candidateItem.relatedRomanization || 'Reading not recorded'}</strong>
          {candidateItem.assessment ? <span className={`dsl-status ${statusClass(candidateItem.assessment)}`}>{englishSynonymAssessment(candidateItem.assessment)}</span> : null}
        </div>
        <p>{candidateItem.relatedEnglishDefinition
          ? <SlashBreakText value={candidateItem.relatedEnglishDefinition} />
          : 'No English definition recorded for this character–reading pair.'}</p>
        {visibleSynonymNote(candidateItem.note) ? <small>{visibleSynonymNote(candidateItem.note)}</small> : null}
      </article>
    );
  };

  return (
    <>
      <span className="dsl-selected-label">SELECTED SYNONYM</span>
      <span className="dsl-selected-source">Line {text(occurrence.line) || '—'} · {relationLabel}</span>
      <div className="dsl-selected-glyph">
        <strong>{recordGlyph(item.relatedCharacterId, item.relatedCharacter, item.relatedSimplified, item.relatedGlyphLink)}</strong>
        <div className="dsl-selected-pair">
          <span>{item.sourceCharacter || '—'} → {item.relatedCharacter || item.relatedSimplified || '—'}</span>
          <a className="dsl-open-record-button" href={characterRecordUrl(item.relatedCharacterId) || '#'}>Open character record ↗</a>
        </div>
      </div>

      <section className="dsl-inspector-section dsl-syn-pick-section">
        <h4>SPECIALIST PICK</h4>
        {picks.map((candidate, index) => candidateCard(candidate, index, true))}
      </section>

      {alternatives.length ? (
        <section className="dsl-inspector-section">
          <h4>OTHER RECORDED READINGS</h4>
          <p className="dsl-sidebar-explainer">Other character–reading combinations encoded for the same manuscript synonym slot.</p>
          {alternatives.map((candidate, index) => candidateCard(candidate, index, false))}
        </section>
      ) : null}

      <dl className="dsl-inspect-list">
        <div><dt>position</dt><dd>{group.position} / 4</dd></div>
        <div><dt>candidates</dt><dd>{group.candidates.length}</dd></div>
      </dl>

      <section className="dsl-inspector-section">
        <h4>DOCUMENTARY CONTEXT</h4>
        <p>Line {text(occurrence.line) || '—'} ({englishTypologyLabel(occurrence.typology)})</p>
        <DefinitionHtml html={occurrence.latinDefinition} />
      </section>
    </>
  );
}

function GraphicInspector({ selection }: { selection: Extract<Selection, { kind: 'graphic' }> }) {
  const { item, occurrence } = selection;

  return (
    <>
      <span className="dsl-selected-label">SELECTED RELATION</span>
      <span className="dsl-selected-source">Line {text(occurrence.line) || '—'} · graphic variant</span>
      <div className="dsl-selected-glyph">
        <strong>{recordGlyph(item.relatedCharacterId, item.relatedCharacter, item.relatedSimplified, item.relatedGlyphLink)}</strong>
        <div className="dsl-selected-pair"><span>{item.sourceCharacter || '—'} → {item.relatedCharacter || item.relatedSimplified || '—'}</span>{item.relatedCharacterId != null ? <a className="dsl-open-record-button" href={characterRecordUrl(item.relatedCharacterId) || '#'}>Open character record ↗</a> : null}</div>
      </div>

      {item.evidentialStatus ? <span className="dsl-status">{item.evidentialStatus}</span> : null}

      <dl className="dsl-inspect-list">
        <div><dt>source</dt><dd>{item.sourceCharacter || occurrence.character || '—'}</dd></div>
        <div><dt>related</dt><dd>{item.relatedCharacter || item.relatedSimplified || '—'}</dd></div>
      </dl>

      <section className="dsl-inspector-section">
        <h4>DOCUMENTARY CONTEXT</h4>
        <p>Line {text(occurrence.line) || '—'} ({englishTypologyLabel(occurrence.typology)})</p>
        <DefinitionHtml html={occurrence.latinDefinition} />
      </section>
    </>
  );
}
