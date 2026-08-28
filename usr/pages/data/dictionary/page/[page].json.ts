import type { APIRoute, GetStaticPaths } from 'astro';
import { fetchFromDirectus } from '@core/utils/directus';

export const prerender = true;

type AnyRecord = Record<string, any>;
type Id = string | number;

type OptionalRows = {
  rows: AnyRecord[];
  warning?: string;
};

const PAGE_LIMIT = 500;
const ID_BATCH_SIZE = 80;
const STATIC_BUILD_MODE = !import.meta.env.DEV;
const fullCollectionPromises = new Map<string, Promise<AnyRecord[]>>();

function relationId(value: any): Id | null {
  if (value == null || value === '') return null;
  if (typeof value === 'object') return value.id ?? null;
  return value;
}

function key(value: any): string {
  const id = relationId(value);
  return id == null ? '' : String(id);
}

function uniqueIds(values: any[]): Id[] {
  const seen = new Set<string>();
  const out: Id[] = [];

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

async function requestRows(table: string, params: URLSearchParams): Promise<AnyRecord[]> {
  const rows = await fetchFromDirectus<AnyRecord[]>({
    table,
    queryString: params.toString(),
  });

  if (!Array.isArray(rows)) {
    throw new Error(`Directus collection "${table}" did not return an array.`);
  }

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
    all.push(...rows);

    if (rows.length < PAGE_LIMIT) break;
    offset += rows.length;
  }

  return all;
}

async function fullCollection(table: string): Promise<AnyRecord[]> {
  let promise = fullCollectionPromises.get(table);
  if (!promise) {
    const params = new URLSearchParams();
    params.set('sort', 'id');
    promise = requestPaged(table, params);
    fullCollectionPromises.set(table, promise);
  }
  return promise;
}

async function fetchByIds(table: string, ids: Id[]): Promise<AnyRecord[]> {
  if (ids.length === 0) return [];

  // During static production builds every page JSON is prerendered. Loading each
  // collection once and filtering it in memory avoids thousands of repeated API
  // calls. In dev mode we keep true page-by-page Directus requests.
  if (STATIC_BUILD_MODE) {
    const wanted = new Set(ids.map(String));
    const rows = await fullCollection(table);
    return rows.filter(row => wanted.has(key(row.id)));
  }

  const out: AnyRecord[] = [];
  for (const batch of chunks(ids, ID_BATCH_SIZE)) {
    const params = new URLSearchParams();
    params.set('filter[id][_in]', batch.map(String).join(','));
    params.set('limit', String(batch.length));
    const rows = await requestRows(table, params);
    out.push(...rows);
  }
  return out;
}

async function fetchWhereIn(table: string, field: string, ids: Id[]): Promise<AnyRecord[]> {
  if (ids.length === 0) return [];

  if (STATIC_BUILD_MODE) {
    const wanted = new Set(ids.map(String));
    const rows = await fullCollection(table);
    return rows.filter(row => {
      const value = relationId(row[field]);
      return value != null && wanted.has(String(value));
    });
  }

  const out: AnyRecord[] = [];
  for (const batch of chunks(ids, ID_BATCH_SIZE)) {
    const params = new URLSearchParams();
    params.set(`filter[${field}][_in]`, batch.map(String).join(','));
    const rows = await requestPaged(table, params);
    out.push(...rows);
  }
  return out;
}

async function optionalWhereIn(table: string, field: string, ids: Id[]): Promise<OptionalRows> {
  try {
    return { rows: await fetchWhereIn(table, field, ids) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      rows: [],
      warning: `Optional relation collection "${table}" could not be read: ${message}`,
    };
  }
}

async function optionalByIds(table: string, ids: Id[]): Promise<OptionalRows> {
  try {
    return { rows: await fetchByIds(table, ids) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      rows: [],
      warning: `Optional relation collection "${table}" could not be read: ${message}`,
    };
  }
}

function primitiveDisplay(value: any): string {
  if (value == null || value === '') return '';
  if (Array.isArray(value)) {
    return value.map(primitiveDisplay).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') {
    const preferred = value.car ?? value.character ?? value.name ?? value.label ?? value.value ?? value.id;
    return preferred == null ? '' : String(preferred);
  }
  return String(value);
}

function matchingFields(row: AnyRecord, matcher: RegExp): Array<{ field: string; value: string }> {
  return Object.entries(row)
    .filter(([field, value]) => matcher.test(field) && value != null && value !== '')
    .map(([field, value]) => ({ field, value: primitiveDisplay(value) }))
    .filter(item => item.value !== '');
}

function firstMatchingField(row: AnyRecord, matcher: RegExp): { field: string; value: string } | null {
  return matchingFields(row, matcher)[0] ?? null;
}

function currentAndOtherId(
  currentId: Id | null,
  left: any,
  right: any,
): { sourceId: Id | null; relatedId: Id | null } {
  const leftId = relationId(left);
  const rightId = relationId(right);

  if (currentId != null && leftId != null && String(leftId) === String(currentId)) {
    return { sourceId: leftId, relatedId: rightId };
  }
  if (currentId != null && rightId != null && String(rightId) === String(currentId)) {
    return { sourceId: rightId, relatedId: leftId };
  }
  return { sourceId: leftId, relatedId: rightId };
}

function flattenOccurrence(
  occ: AnyRecord,
  words: Map<string, AnyRecord>,
  characters: Map<string, AnyRecord>,
  romanizations: Map<string, AnyRecord>,
  graphicJunctionsByOcc: Map<string, AnyRecord[]>,
  graphicRelations: Map<string, AnyRecord>,
  synonymJunctionsByOcc: Map<string, AnyRecord[]>,
  synonymRelations: Map<string, AnyRecord>,
) {
  const wordId = relationId(occ.word);
  const word = wordId == null ? undefined : words.get(String(wordId));

  const characterId = relationId(word?.chinese_id);
  const character = characterId == null ? undefined : characters.get(String(characterId));

  const romanizationId = relationId(word?.rom_id);
  const romanization = romanizationId == null ? undefined : romanizations.get(String(romanizationId));

  const graphicVariants = (graphicJunctionsByOcc.get(key(occ.id)) ?? [])
    .map(junction => {
      const relationIdValue = relationId(junction.chinese_chinese_id);
      const relation = relationIdValue == null ? undefined : graphicRelations.get(String(relationIdValue));
      if (!relation) return null;

      const ids = currentAndOtherId(characterId, relation.chinese_id, relation.related_chinese_id);
      const related = ids.relatedId == null ? undefined : characters.get(String(ids.relatedId));
      const source = ids.sourceId == null ? undefined : characters.get(String(ids.sourceId));

      return {
        junctionId: relationId(junction.id),
        relationId: relationIdValue,
        sourceOccurrenceId: occ.id,
        sourceCharacterId: ids.sourceId,
        sourceCharacter: source?.car ?? character?.car ?? null,
        relatedCharacterId: ids.relatedId,
        relatedCharacter: related?.car ?? null,
        relatedSimplified: related?.simplified_chinese ?? null,
        relatedGlyphLink: related?.link_nuovo || related?.link || null,
        evidentialStatus: relation.typology ?? null,
      };
    })
    .filter(Boolean);

  const synonyms = (synonymJunctionsByOcc.get(key(occ.id)) ?? [])
    .map(junction => {
      const relationIdValue = relationId(junction.chinese_rom_chinese_rom_id);
      const relation = relationIdValue == null ? undefined : synonymRelations.get(String(relationIdValue));
      if (!relation) return null;

      const ids = currentAndOtherId(wordId, relation.chinese_rom_id, relation.related_chinese_rom_id);
      const sourceWord = ids.sourceId == null ? undefined : words.get(String(ids.sourceId));
      const relatedWord = ids.relatedId == null ? undefined : words.get(String(ids.relatedId));

      const sourceCharacterId = relationId(sourceWord?.chinese_id);
      const relatedCharacterId = relationId(relatedWord?.chinese_id);
      const sourceRomanizationId = relationId(sourceWord?.rom_id);
      const relatedRomanizationId = relationId(relatedWord?.rom_id);

      const sourceCharacter = sourceCharacterId == null ? undefined : characters.get(String(sourceCharacterId));
      const relatedCharacter = relatedCharacterId == null ? undefined : characters.get(String(relatedCharacterId));
      const sourceRom = sourceRomanizationId == null ? undefined : romanizations.get(String(sourceRomanizationId));
      const relatedRom = relatedRomanizationId == null ? undefined : romanizations.get(String(relatedRomanizationId));

      return {
        junctionId: relationId(junction.id),
        relationId: relationIdValue,
        sourceOccurrenceId: occ.id,
        sourceWordId: ids.sourceId,
        relatedWordId: ids.relatedId,
        sourceCharacter: sourceCharacter?.car ?? character?.car ?? null,
        sourceRomanization: sourceRom?.rom ?? romanization?.rom ?? null,
        relatedCharacterId,
        relatedCharacter: relatedCharacter?.car ?? null,
        relatedSimplified: relatedCharacter?.simplified_chinese ?? null,
        relatedGlyphLink: relatedCharacter?.link_nuovo || relatedCharacter?.link || null,
        relatedRomanization: relatedRom?.rom ?? null,
        relatedEnglishDefinition: relatedWord?.english_definition ?? null,
        position: junction.position ?? null,
        internal: junction.internal == null ? null : Boolean(junction.internal),
        note: junction.note ?? null,
        assessment: relation.typology ?? null,
      };
    })
    .filter(Boolean);

  return {
    id: occ.id,
    dictionaryId: relationId(occ.dictionary_id),
    page: occ.page ?? null,
    line: occ.line ?? null,
    typology: occ.typology ?? null,
    latinDefinition: occ.latin_definition_2 ?? null,
    note: occ.note ?? null,
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

    // The documentation intentionally leaves these physical field names open.
    // We discover them only from readable top-level occ fields instead of hard-coding a guess.
    glosses: matchingFields(occ, /gloss/i),
    historicalRadical: firstMatchingField(occ, /radical/i),
    earthlyBranch: firstMatchingField(occ, /(earth.*branch|branch.*earth|earthly|terrestrial|ramo)/i),

    graphicVariants,
    synonyms,
  };
}

function indexBy<T extends AnyRecord>(rows: T[], field: string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row[field]);
    if (!k) continue;
    const list = map.get(k) ?? [];
    list.push(row);
    map.set(k, list);
  }
  return map;
}

async function discoverMaxPage(): Promise<number> {
  if (STATIC_BUILD_MODE) {
    const rows = await fullCollection('occ');
    const max = rows.reduce((value, row) => {
      const page = Number(row.page);
      return Number.isFinite(page) ? Math.max(value, page) : value;
    }, 1);
    return Math.max(1, Math.trunc(max));
  }

  const params = new URLSearchParams();
  params.set('filter[page][_nnull]', 'true');
  params.set('sort', '-page');
  params.set('limit', '1');

  const rows = await requestRows('occ', params);
  const value = Number(rows[0]?.page);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 1;
}

export const getStaticPaths: GetStaticPaths = async () => {
  const maxPage = await discoverMaxPage();
  return Array.from({ length: maxPage }, (_, index) => ({
    params: { page: String(index + 1) },
    props: { maxPage },
  }));
};

export const GET: APIRoute = async ({ params, props }) => {
  const requestedPage = Number(params.page);
  const maxPage = Number((props as { maxPage?: number })?.maxPage ?? requestedPage);

  if (!Number.isInteger(requestedPage) || requestedPage < 1) {
    return new Response(JSON.stringify({ error: 'Invalid dictionary page.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  const warnings: string[] = [];

  let occRows: AnyRecord[];
  if (STATIC_BUILD_MODE) {
    const allOccurrences = await fullCollection('occ');
    occRows = allOccurrences
      .filter(row => Number(row.page) === requestedPage)
      .sort((a, b) => {
        const lineDiff = Number(a.line ?? 0) - Number(b.line ?? 0);
        return lineDiff || String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
      });
  } else {
    const occParams = new URLSearchParams();
    occParams.set('filter[page][_eq]', String(requestedPage));
    occParams.set('sort', 'line,id');
    occRows = await requestPaged('occ', occParams);
  }
  const occIds = uniqueIds(occRows.map(row => row.id));

  // Optional documentary relations are isolated: a permission problem in one
  // apparatus table must not make the lexical page itself unavailable.
  const [graphicJunctionResult, synonymJunctionResult] = await Promise.all([
    optionalWhereIn('occ_chinese_chinese', 'occ_id', occIds),
    optionalWhereIn('occ_chinese_rom_chinese_rom', 'occ_id', occIds),
  ]);
  if (graphicJunctionResult.warning) warnings.push(graphicJunctionResult.warning);
  if (synonymJunctionResult.warning) warnings.push(synonymJunctionResult.warning);

  const graphicRelationIds = uniqueIds(graphicJunctionResult.rows.map(row => row.chinese_chinese_id));
  const synonymRelationIds = uniqueIds(synonymJunctionResult.rows.map(row => row.chinese_rom_chinese_rom_id));

  const [graphicRelationResult, synonymRelationResult] = await Promise.all([
    optionalByIds('chinese_chinese', graphicRelationIds),
    optionalByIds('chinese_rom_chinese_rom', synonymRelationIds),
  ]);
  if (graphicRelationResult.warning) warnings.push(graphicRelationResult.warning);
  if (synonymRelationResult.warning) warnings.push(synonymRelationResult.warning);

  // Resolve only the word/readings needed by this printed page and its visible apparatus.
  const wordIds = uniqueIds([
    ...occRows.map(row => row.word),
    ...synonymRelationResult.rows.flatMap(row => [row.chinese_rom_id, row.related_chinese_rom_id]),
  ]);
  const wordRows = await fetchByIds('chinese_rom', wordIds);

  const characterIds = uniqueIds([
    ...wordRows.map(row => row.chinese_id),
    ...graphicRelationResult.rows.flatMap(row => [row.chinese_id, row.related_chinese_id]),
  ]);
  const romanizationIds = uniqueIds(wordRows.map(row => row.rom_id));

  const [characterRows, romanizationRows] = await Promise.all([
    fetchByIds('chinese', characterIds),
    fetchByIds('rom', romanizationIds),
  ]);

  const words = new Map(wordRows.map(row => [key(row.id), row]));
  const characters = new Map(characterRows.map(row => [key(row.id), row]));
  const romanizations = new Map(romanizationRows.map(row => [key(row.id), row]));
  const graphicRelations = new Map(graphicRelationResult.rows.map(row => [key(row.id), row]));
  const synonymRelations = new Map(synonymRelationResult.rows.map(row => [key(row.id), row]));
  const graphicJunctionsByOcc = indexBy(graphicJunctionResult.rows, 'occ_id');
  const synonymJunctionsByOcc = indexBy(synonymJunctionResult.rows, 'occ_id');

  const data = occRows.map(occ => flattenOccurrence(
    occ,
    words,
    characters,
    romanizations,
    graphicJunctionsByOcc,
    graphicRelations,
    synonymJunctionsByOcc,
    synonymRelations,
  ));

  const lineCount = new Set(data.map(row => String(row.line ?? ''))).size;

  return new Response(JSON.stringify({
    generatedAt: new Date().toISOString(),
    page: requestedPage,
    maxPage,
    count: data.length,
    lineCount,
    warnings: warnings.length ? warnings : undefined,
    data,
  }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Browser-side code keeps only three recent pages in memory.
      'Cache-Control': 'no-store',
    },
  });
};
