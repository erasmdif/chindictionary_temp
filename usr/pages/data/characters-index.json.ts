import type { APIRoute } from 'astro';
import { fetchFromDirectus } from '@core/utils/directus';
import type {
  CharacterLocus,
  CharacterReading,
  CharacterRecord,
  CharacterVariant,
  CharactersPayload,
} from '../../components/characters/types';
import { HISTORICAL_RADICAL_FIELD } from '../../components/characters/config';

export const prerender = true;

type AnyRecord = Record<string, any>;
type Id = string | number;

const PAGE_LIMIT = 2500;
const historicalRadicalField = HISTORICAL_RADICAL_FIELD?.trim() || '';
let payloadPromise: Promise<CharactersPayload> | null = null;

function relationId(value: any): Id | null {
  if (value == null || value === '') return null;
  if (typeof value === 'object') return value.id ?? null;
  return value;
}

function key(value: any): string {
  const id = relationId(value);
  return id == null ? '' : String(id);
}

function primitive(value: any): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'object') {
    const preferred = value.car ?? value.value ?? value.name ?? value.label ?? value.id;
    return preferred == null || preferred === '' ? null : String(preferred);
  }
  return String(value);
}

const NON_LEXICAL_CHARACTER_SENTINELS = new Set([
  'null',
  'change_radical',
  'bf_change_radical',
  'before_change_radical',
  // Legacy/alternate sentinel seen in the dataset UI. Keep it excluded too.
  'before_radical',
]);

function isLexicalCharacterRow(row: AnyRecord | undefined | null): boolean {
  if (!row) return false;
  const raw = primitive(row.car)?.trim();
  if (!raw) return false;
  const normalized = raw.toLowerCase().replace(/\s+/g, '_');
  return !NON_LEXICAL_CHARACTER_SENTINELS.has(normalized);
}

function bool(value: any): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') return ['true', '1', 'yes'].includes(value.toLowerCase());
  return false;
}

function pageNumber(value: any): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function requestRows(table: string, params: URLSearchParams): Promise<AnyRecord[]> {
  const rows = await fetchFromDirectus<AnyRecord[]>({ table, queryString: params.toString() });
  if (!Array.isArray(rows)) throw new Error(`Directus collection "${table}" did not return an array.`);
  return rows;
}

async function requestPaged(table: string, baseParams: URLSearchParams): Promise<AnyRecord[]> {
  const all: AnyRecord[] = [];
  let offset = 0;

  while (true) {
    const params = new URLSearchParams(baseParams);
    params.set('limit', String(PAGE_LIMIT));
    params.set('offset', String(offset));
    const rows = await requestRows(table, params);
    if (rows.length === 0) break;
    all.push(...rows);
    offset += rows.length;
  }

  return all;
}

async function readFlatCollection(table: string, fields: string[], warnings: string[]): Promise<AnyRecord[]> {
  const params = new URLSearchParams();
  params.set('sort', 'id');
  params.set('fields', fields.join(','));

  try {
    return await requestPaged(table, params);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`Field-list fallback used for ${table}: ${message}`);
    const fallback = new URLSearchParams();
    fallback.set('sort', 'id');
    return await requestPaged(table, fallback);
  }
}

async function readOptionalFlatCollection(table: string, fields: string[], warnings: string[]): Promise<AnyRecord[]> {
  try {
    return await readFlatCollection(table, fields, warnings);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`Optional collection ${table} unavailable: ${message}`);
    return [];
  }
}

function aggregateCount(row: AnyRecord): number {
  const value = row?.countDistinct?.id ?? row?.countDistinct ?? row?.count?.id ?? row?.count ?? row?.__count ?? 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function readOccurrenceAggregates(fields: string[], warnings: string[]): Promise<AnyRecord[]> {
  // Let Directus collapse individual occurrences before sending them to Astro.
  // Grouping by locus + reading + source-stroke preserves every distinction used
  // by the UI while avoiding the much larger raw occ transfer.
  const groupBy = ['word', 'dictionary_id', 'page', 'line', 'typology', 'n_strokes'];
  if (historicalRadicalField) groupBy.push(historicalRadicalField);

  const params = new URLSearchParams();
  params.append('aggregate[countDistinct]', 'id');
  for (const field of groupBy) params.append('groupBy[]', field);

  try {
    const rows = await requestPaged('occ', params);
    return rows.map(row => ({ ...row, __count: aggregateCount(row) }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`Directus aggregation fallback used for occ: ${message}`);
    const raw = await readFlatCollection('occ', fields, warnings);
    return raw.map(row => ({ ...row, __count: 1 }));
  }
}

function naturalCompare(a: any, b: any): number {
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' });
}

async function buildPayload(): Promise<CharactersPayload> {
  const warnings: string[] = [];

  const occFields = ['id', 'dictionary_id', 'page', 'line', 'typology', 'n_strokes', 'word'];
  if (historicalRadicalField) occFields.push(historicalRadicalField);

  const [characters, words, romanizations, occurrences, graphicRelations] = await Promise.all([
    readFlatCollection('chinese', [
      'id', 'car', 'simplified_chinese', 'link', 'link_nuovo', 'note', 'not_standard',
      'strokes', 'strokes_not_num', 'semantic_radical', 'phonetic_radical',
    ], warnings),
    readFlatCollection('chinese_rom', [
      'id', 'chinese_id', 'rom_id', 'english_definition', 'interpreted',
    ], warnings),
    readFlatCollection('rom', [
      'id', 'rom', 'modern_rom', 'simple_romanization', 'tone',
    ], warnings),
    readOccurrenceAggregates(occFields, warnings),
    readOptionalFlatCollection('chinese_chinese', [
      'id', 'chinese_id', 'related_chinese_id', 'typology',
    ], warnings),
  ]);

  // `chinese` also contains non-lexical sentinel rows used only to model
  // dictionary headings/boundaries (e.g. change_radical). They may have real
  // `occ.radical` values, but must never enter the character index, counts,
  // matrices, charts, or source/modern-radical comparisons.
  // Formalized glyph records such as `[.]_2_3` remain valid here and are
  // rendered later through simplified_chinese* + link_nuovo/link.
  const characterById = new Map(
    characters
      .filter(isLexicalCharacterRow)
      .map(row => [key(row.id), row]),
  );
  const wordById = new Map(words.map(row => [key(row.id), row]));
  const romById = new Map(romanizations.map(row => [key(row.id), row]));

  const occurrenceCountByWord = new Map<string, number>();
  const characterOccurrenceCounts = new Map<string, number>();
  const characterPhysicalLoci = new Map<string, Set<string>>();
  const locusAggregates = new Map<string, Map<string, CharacterLocus & { typologySet: Set<string> }>>();

  for (const occ of occurrences) {
    const wordId = key(occ.word);
    const occCount = Math.max(0, Number(occ.__count ?? 1) || 0);
    if (!wordId || !occCount) continue;

    const word = wordById.get(wordId);
    const characterId = key(word?.chinese_id);
    if (!characterId || !characterById.has(characterId)) continue;

    occurrenceCountByWord.set(wordId, (occurrenceCountByWord.get(wordId) ?? 0) + occCount);
    characterOccurrenceCounts.set(characterId, (characterOccurrenceCounts.get(characterId) ?? 0) + occCount);

    const dictionaryId = primitive(occ.dictionary_id);
    const page = pageNumber(occ.page);
    const line = occ.line == null || occ.line === '' ? null : occ.line;
    const physicalKey = [dictionaryId ?? '', page ?? '', line ?? ''].join('|');
    const physical = characterPhysicalLoci.get(characterId) ?? new Set<string>();
    physical.add(physicalKey);
    characterPhysicalLoci.set(characterId, physical);

    const sourceRadical = historicalRadicalField ? primitive(occ[historicalRadicalField]) : null;
    const historicalStrokes = occ.n_strokes == null || occ.n_strokes === '' ? null : occ.n_strokes;
    const aggregateKey = [wordId, dictionaryId ?? '', page ?? '', line ?? '', sourceRadical ?? '', historicalStrokes ?? ''].join('|');
    const byLocus = locusAggregates.get(characterId) ?? new Map();
    const existing = byLocus.get(aggregateKey) ?? {
      readingId: wordId,
      dictionaryId,
      page,
      line,
      count: 0,
      typologies: [],
      historicalStrokes,
      sourceRadical,
      typologySet: new Set<string>(),
    };
    existing.count += occCount;
    if (occ.typology != null && occ.typology !== '') existing.typologySet.add(String(occ.typology));
    byLocus.set(aggregateKey, existing);
    locusAggregates.set(characterId, byLocus);
  }

  const readingsByCharacter = new Map<string, CharacterReading[]>();
  for (const word of words) {
    const characterId = key(word.chinese_id);
    const wordId = key(word.id);
    if (!characterId || !wordId || !characterById.has(characterId)) continue;
    const rom = romById.get(key(word.rom_id));
    const reading: CharacterReading = {
      id: wordId,
      historical: primitive(rom?.rom),
      simpleHistorical: primitive(rom?.simple_romanization),
      modern: primitive(rom?.modern_rom),
      english: primitive(word.english_definition),
      interpreted: bool(word.interpreted),
      occurrenceCount: occurrenceCountByWord.get(wordId) ?? 0,
    };
    const list = readingsByCharacter.get(characterId) ?? [];
    list.push(reading);
    readingsByCharacter.set(characterId, list);
  }

  const variantMap = new Map<string, Map<string, CharacterVariant>>();
  const addVariant = (sourceId: string, relatedId: string, relation: AnyRecord) => {
    const related = characterById.get(relatedId);
    if (!related) return;
    const rawCharacter = primitive(related.car);
    const simplified = primitive(related.simplified_chinese);
    const formalism = Boolean(rawCharacter && rawCharacter.includes('['));
    const displayCharacter = formalism
      ? (simplified ? `${simplified}*` : '*')
      : (rawCharacter || simplified);
    const variants = variantMap.get(sourceId) ?? new Map<string, CharacterVariant>();
    if (!variants.has(relatedId)) {
      variants.set(relatedId, {
        id: relatedId,
        rawCharacter,
        displayCharacter,
        simplified,
        glyphLink: primitive(related.link_nuovo) || primitive(related.link),
        formalism,
        typology: primitive(relation.typology),
      });
    }
    variantMap.set(sourceId, variants);
  };

  for (const relation of graphicRelations) {
    const leftId = key(relation.chinese_id);
    const rightId = key(relation.related_chinese_id);
    if (!leftId || !rightId || leftId === rightId) continue;
    addVariant(leftId, rightId, relation);
    addVariant(rightId, leftId, relation);
  }

  const data: CharacterRecord[] = [];
  for (const [characterId, characterOccurrenceCount] of characterOccurrenceCounts.entries()) {
    const row = characterById.get(characterId);
    if (!row) continue;

    const semanticRadical = primitive(row.semantic_radical)?.trim() || null;
    // Keep characters even when the modern semantic radical is missing.
    // Source-radical indexing is occurrence-based (occ.radical) and must not lose them.

    const rawCharacter = primitive(row.car);
    const simplified = primitive(row.simplified_chinese);
    const formalism = Boolean(rawCharacter && rawCharacter.includes('['));
    const displayCharacter = formalism
      ? (simplified ? `${simplified}*` : '*')
      : (rawCharacter || simplified);

    const loci = Array.from(locusAggregates.get(characterId)?.values() ?? [])
      .map(item => ({
        readingId: item.readingId,
        dictionaryId: item.dictionaryId,
        page: item.page,
        line: item.line,
        count: item.count,
        typologies: Array.from(item.typologySet).sort(naturalCompare),
        historicalStrokes: item.historicalStrokes,
        sourceRadical: item.sourceRadical,
      }))
      .sort((a, b) => naturalCompare(a.dictionaryId, b.dictionaryId) || naturalCompare(a.page, b.page) || naturalCompare(a.line, b.line));

    const readings = [...(readingsByCharacter.get(characterId) ?? [])]
      .sort((a, b) => (b.occurrenceCount - a.occurrenceCount) || naturalCompare(a.historical, b.historical));

    data.push({
      id: characterId,
      rawCharacter,
      displayCharacter,
      simplified,
      glyphLink: primitive(row.link_nuovo) || primitive(row.link),
      formalism,
      note: primitive(row.note),
      notStandard: bool(row.not_standard),
      modernStrokes: row.strokes == null || row.strokes === '' ? null : row.strokes,
      strokesNotNumeric: primitive(row.strokes_not_num),
      semanticRadical,
      phoneticRadical: primitive(row.phonetic_radical),
      occurrenceCount: characterOccurrenceCount,
      locusCount: characterPhysicalLoci.get(characterId)?.size ?? 0,
      readings,
      loci,
      variants: Array.from(variantMap.get(characterId)?.values() ?? []).sort((a, b) => naturalCompare(a.displayCharacter, b.displayCharacter)),
    });
  }

  data.sort((a, b) => naturalCompare(a.semanticRadical, b.semanticRadical)
    || naturalCompare(a.modernStrokes, b.modernStrokes)
    || naturalCompare(a.displayCharacter, b.displayCharacter));

  const includedReadingIds = new Set<string>();
  const includedLoci = new Set<string>();
  const includedPages = new Set<number>();
  let includedOccurrences = 0;
  for (const character of data) {
    includedOccurrences += character.occurrenceCount;
    for (const reading of character.readings) {
      if (reading.occurrenceCount > 0) includedReadingIds.add(reading.id);
    }
    for (const locus of character.loci) {
      includedLoci.add([locus.dictionaryId ?? '', locus.page ?? '', locus.line ?? ''].join('|'));
      if (locus.page != null) includedPages.add(locus.page);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    historicalRadicalField: historicalRadicalField || null,
    sourceModeAvailable: Boolean(historicalRadicalField),
    warnings,
    totals: {
      characters: data.length,
      readings: includedReadingIds.size,
      occurrences: includedOccurrences,
      loci: includedLoci.size,
      minPage: includedPages.size ? Math.min(...includedPages) : null,
      maxPage: includedPages.size ? Math.max(...includedPages) : null,
    },
    data,
  };
}

async function getPayload(): Promise<CharactersPayload> {
  if (!payloadPromise) payloadPromise = buildPayload();
  return payloadPromise;
}

export const GET: APIRoute = async () => {
  try {
    const payload = await getPayload();
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': import.meta.env.DEV ? 'no-store' : 'public, max-age=86400, immutable',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
};
