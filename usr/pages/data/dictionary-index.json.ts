import type { APIRoute } from 'astro';
import { fetchFromDirectus } from '@core/utils/directus';

export const prerender = true;

type AnyRecord = Record<string, any>;

type CollectionResult = {
  rows: AnyRecord[];
  fallback: boolean;
};

const DICTIONARY_FIRST_PAGE = 1;
const DICTIONARY_LAST_PAGE = 5;
const PAGE_SIZE = 250;
const ID_BATCH_SIZE = 100;

/**
 * Preview index only.
 *
 * The browser should not download the complete dictionary just to render the
 * initial browse pages. We therefore publish occurrences from printed pages
 * 1–5 only, then fetch just the related word/character/romanization rows.
 *
 * Directus credentials remain server/build-side and the existing sCMS
 * fetchFromDirectus() helper is reused unchanged.
 */
const REQUESTED_FIELDS: Record<string, string[]> = {
  occ: [
    'id',
    'dictionary_id',
    'page',
    'line',
    'typology',
    'latin_definition_2',
    'n_strokes',
    'stroke',
    'word',
  ],
  chinese_rom: [
    'id',
    'chinese_id',
    'rom_id',
    'english_definition',
    'interpreted',
  ],
  chinese: [
    'id',
    'car',
    'simplified_chinese',
    'strokes',
    'semantic_radical',
    'phonetic_radical',
    'link_nuovo',
    'link',
  ],
  rom: [
    'id',
    'rom',
    'modern_rom',
    'simple_romanization',
    'tone',
  ],
};

function relationId(value: any): string | number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'object') return value.id ?? null;
  return value;
}

function key(value: any): string {
  const id = relationId(value);
  return id == null ? '' : String(id);
}

function uniqueIds(values: any[]): Array<string | number> {
  const seen = new Set<string>();
  const out: Array<string | number> = [];

  for (const value of values) {
    const id = relationId(value);
    if (id == null) continue;
    const k = String(id);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(id);
  }

  return out;
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function requestRows(
  table: string,
  params: URLSearchParams,
  fields?: string[],
): Promise<AnyRecord[]> {
  const query = new URLSearchParams(params);
  if (fields?.length) query.set('fields', fields.join(','));

  const rows = await fetchFromDirectus<AnyRecord[]>({
    table,
    queryString: query.toString(),
  });

  if (!Array.isArray(rows)) {
    throw new Error(`Directus collection "${table}" did not return an array.`);
  }

  return rows;
}

async function requestWithFieldFallback(
  table: string,
  params: URLSearchParams,
): Promise<CollectionResult> {
  const fields = REQUESTED_FIELDS[table];

  try {
    return {
      rows: await requestRows(table, params, fields),
      fallback: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/Forbidden/i.test(message)) {
      throw new Error(`Directus read failed for "${table}": ${message}`);
    }

    try {
      return {
        rows: await requestRows(table, params),
        fallback: true,
      };
    } catch (fallbackError) {
      const fallbackMessage = fallbackError instanceof Error
        ? fallbackError.message
        : String(fallbackError);
      throw new Error(
        `Directus read failed for collection "${table}" even without an explicit field list: ${fallbackMessage}`,
      );
    }
  }
}

async function fetchOccurrencePreview(): Promise<CollectionResult> {
  const all: AnyRecord[] = [];
  let offset = 0;
  let fallback = false;

  while (true) {
    const params = new URLSearchParams();
    params.set('filter[page][_gte]', String(DICTIONARY_FIRST_PAGE));
    params.set('filter[page][_lte]', String(DICTIONARY_LAST_PAGE));
    params.set('sort', 'page,line,id');
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(offset));

    const result = await requestWithFieldFallback('occ', params);
    fallback ||= result.fallback;
    all.push(...result.rows);

    if (result.rows.length < PAGE_SIZE) break;
    offset += result.rows.length;
  }

  return { rows: all, fallback };
}

async function fetchByIds(table: string, ids: Array<string | number>): Promise<CollectionResult> {
  if (ids.length === 0) return { rows: [], fallback: false };

  const all: AnyRecord[] = [];
  let fallback = false;

  for (const batch of chunks(ids, ID_BATCH_SIZE)) {
    const params = new URLSearchParams();
    params.set('filter[id][_in]', batch.map(String).join(','));
    params.set('sort', 'id');
    params.set('limit', String(batch.length));

    const result = await requestWithFieldFallback(table, params);
    fallback ||= result.fallback;
    all.push(...result.rows);
  }

  return { rows: all, fallback };
}

function flattenOccurrence(
  occ: AnyRecord,
  words: Map<string, AnyRecord>,
  characters: Map<string, AnyRecord>,
  romanizations: Map<string, AnyRecord>,
) {
  const wordId = relationId(occ.word);
  const word = wordId == null ? undefined : words.get(String(wordId));

  const characterId = relationId(word?.chinese_id);
  const character = characterId == null ? undefined : characters.get(String(characterId));

  const romanizationId = relationId(word?.rom_id);
  const romanization = romanizationId == null
    ? undefined
    : romanizations.get(String(romanizationId));

  return {
    id: occ.id,
    dictionaryId: relationId(occ.dictionary_id),
    page: occ.page ?? null,
    line: occ.line ?? null,
    typology: occ.typology ?? null,
    latinDefinition: occ.latin_definition_2 ?? null,
    historicalStrokes: occ.n_strokes ?? null,
    strokeBoundary: Boolean(occ.stroke),

    wordId,
    englishDefinition: word?.english_definition ?? null,
    interpreted: Boolean(word?.interpreted),

    characterId,
    character: character?.car ?? null,
    simplified: character?.simplified_chinese ?? null,
    modernStrokes: character?.strokes ?? null,
    semanticRadical: character?.semantic_radical ?? null,
    phoneticRadical: character?.phonetic_radical ?? null,
    glyphLink: character?.link_nuovo || character?.link || null,

    romanizationId,
    romanization: romanization?.rom ?? null,
    modernRomanization: romanization?.modern_rom ?? null,
    simpleRomanization: romanization?.simple_romanization ?? null,
    tone: romanization?.tone ?? null,
  };
}

export const GET: APIRoute = async () => {
  const endpoint = import.meta.env.DIRECTUS_URL || process.env.DIRECTUS_URL;

  if (!endpoint) {
    return new Response(JSON.stringify({
      generatedAt: new Date().toISOString(),
      data: [],
      warning: 'DIRECTUS_URL is not configured.',
    }), {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  // 1. Only printed dictionary pages 1–5.
  const occResult = await fetchOccurrencePreview();

  // 2. Only word rows actually referenced by those occurrences.
  const wordIds = uniqueIds(occResult.rows.map(row => row.word));
  const wordResult = await fetchByIds('chinese_rom', wordIds);

  // 3. Only character and romanization rows referenced by those words.
  const characterIds = uniqueIds(wordResult.rows.map(row => row.chinese_id));
  const romanizationIds = uniqueIds(wordResult.rows.map(row => row.rom_id));

  const [chineseResult, romResult] = await Promise.all([
    fetchByIds('chinese', characterIds),
    fetchByIds('rom', romanizationIds),
  ]);

  const words = new Map(wordResult.rows.map(row => [key(row.id), row]));
  const characters = new Map(chineseResult.rows.map(row => [key(row.id), row]));
  const romanizations = new Map(romResult.rows.map(row => [key(row.id), row]));

  // occResult is already sorted by printed dictionary order.
  const data = occResult.rows.map(occ =>
    flattenOccurrence(occ, words, characters, romanizations),
  );

  const unresolvedWords = data.filter(row => row.wordId != null && !words.has(String(row.wordId))).length;
  const unresolvedCharacters = data.filter(row => row.characterId != null && !characters.has(String(row.characterId))).length;
  const unresolvedRomanizations = data.filter(row => row.romanizationId != null && !romanizations.has(String(row.romanizationId))).length;

  const fallbackTables = [
    occResult.fallback ? 'occ' : null,
    wordResult.fallback ? 'chinese_rom' : null,
    chineseResult.fallback ? 'chinese' : null,
    romResult.fallback ? 'rom' : null,
  ].filter((table): table is string => Boolean(table));

  const warnings: string[] = [];
  if (fallbackTables.length) {
    warnings.push(
      `Directus field-permission fallback used for: ${fallbackTables.join(', ')}. ` +
      'The preview was generated from the top-level fields visible to the read-only token.',
    );
  }
  if (unresolvedWords) warnings.push(`${unresolvedWords} preview occurrences reference a word that could not be resolved.`);
  if (unresolvedCharacters) warnings.push(`${unresolvedCharacters} preview occurrences reference a character that could not be resolved.`);
  if (unresolvedRomanizations) warnings.push(`${unresolvedRomanizations} preview occurrences reference a romanization that could not be resolved.`);

  return new Response(JSON.stringify({
    generatedAt: new Date().toISOString(),
    count: data.length,
    preview: {
      dictionaryFirstPage: DICTIONARY_FIRST_PAGE,
      dictionaryLastPage: DICTIONARY_LAST_PAGE,
      characterLimit: 100,
    },
    warning: warnings.length ? warnings.join(' ') : undefined,
    data,
  }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
