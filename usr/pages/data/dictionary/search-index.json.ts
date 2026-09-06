import type { APIRoute } from 'astro';
import { fetchFromDirectus } from '@core/utils/directus';

export const prerender = true;

type AnyRecord = Record<string, any>;

const PAGE_LIMIT = 2500;
const EDITORIAL_WORD_IDS = new Set(['249', '9696']);
const NON_LEXICAL_CHARACTER_SENTINELS = new Set([
  'null',
  'change_radical',
  'change radical',
  'bf_change_radical',
  'before_change_radical',
  'before_radical',
  'empty_page',
  'empty page',
]);

function relationId(value: any): string {
  if (value == null || value === '') return '';
  if (typeof value === 'object') return String(value.id ?? '');
  return String(value);
}

function text(value: any): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'object') {
    const candidate = value.car ?? value.rom ?? value.value ?? value.name ?? value.label ?? value.id;
    return candidate == null || candidate === '' ? null : String(candidate);
  }
  return String(value);
}

function normalizedSentinel(value: any): string {
  return String(text(value) ?? '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s-]+/g, '_');
}

function isLexicalCharacter(row: AnyRecord | undefined): boolean {
  if (!row) return false;
  const raw = text(row.car)?.trim();
  if (!raw) return false;
  const normalized = normalizedSentinel(raw);
  return !NON_LEXICAL_CHARACTER_SENTINELS.has(normalized)
    && !NON_LEXICAL_CHARACTER_SENTINELS.has(normalized.replace(/_/g, ' '));
}

async function requestRows(table: string, params: URLSearchParams): Promise<AnyRecord[]> {
  const rows = await fetchFromDirectus<AnyRecord[]>({ table, queryString: params.toString() });
  if (!Array.isArray(rows)) throw new Error(`Directus collection "${table}" did not return an array.`);
  return rows;
}

async function requestPaged(table: string, base: URLSearchParams): Promise<AnyRecord[]> {
  const out: AnyRecord[] = [];
  let offset = 0;
  while (true) {
    const params = new URLSearchParams(base);
    params.set('limit', String(PAGE_LIMIT));
    params.set('offset', String(offset));
    const rows = await requestRows(table, params);
    out.push(...rows);
    if (rows.length < PAGE_LIMIT) break;
    offset += rows.length;
  }
  return out;
}

async function readCollection(table: string, fields: readonly string[]): Promise<AnyRecord[]> {
  const params = new URLSearchParams();
  params.set('fields', fields.join(','));
  params.set('sort', 'id');
  try {
    return await requestPaged(table, params);
  } catch {
    // Some Directus permission profiles reject explicit field lists while still
    // allowing collection reads. Keep the endpoint compatible with that setup.
    const fallback = new URLSearchParams();
    fallback.set('sort', 'id');
    return requestPaged(table, fallback);
  }
}

async function readOptionalCollection(table: string, fields: readonly string[]): Promise<AnyRecord[]> {
  try {
    return await readCollection(table, fields);
  } catch {
    return [];
  }
}

function normalizedTypology(value: any): string {
  return String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase();
}

function blankAppendixDefinition(value: any): boolean {
  const clean = String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase();
  return !clean || clean === 'empty' || clean === 'null' || clean === 'nan';
}

function compositeOccId(row: AnyRecord): string {
  return relationId(row.occ_id || row.occ);
}

function compositeRelationId(row: AnyRecord): string {
  return relationId(row.composite_word_id || row.composite_words_id || row.composite_word || row.composite_words);
}


function naturalCompare(a: any, b: any): number {
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' });
}

async function buildPayload() {
  const [occurrences, words, characters, romanisations, lexicalRelations, lexicalEvidence, composites] = await Promise.all([
    readCollection('occ', ['id', 'page', 'line', 'word', 'typology', 'latin_definition_2']),
    readCollection('chinese_rom', ['id', 'chinese_id', 'rom_id']),
    readCollection('chinese', ['id', 'car', 'simplified_chinese', 'link', 'link_nuovo']),
    readCollection('rom', ['id', 'rom', 'modern_rom', 'simple_romanization']),
    readOptionalCollection('chinese_rom_chinese_rom', ['id', 'chinese_rom_id', 'related_chinese_rom_id', 'typology']),
    readOptionalCollection('occ_chinese_rom_chinese_rom', ['id', 'occ_id', 'chinese_rom_chinese_rom_id']),
    readOptionalCollection('composite_words', ['id', 'first_syllable', 'second_syllable']),
  ]);

  let compositeEvidence: AnyRecord[] = [];
  for (const table of ['occ_composite_word', 'occ_composite_words']) {
    const rows = await readOptionalCollection(table, ['id', 'occ_id', 'occ', 'composite_word_id', 'composite_words_id', 'composite_word', 'composite_words']);
    if (rows.length) {
      compositeEvidence = rows;
      break;
    }
  }

  const wordById = new Map(words.map(row => [relationId(row.id), row] as const));
  const characterById = new Map(characters.map(row => [relationId(row.id), row] as const));
  const romById = new Map(romanisations.map(row => [relationId(row.id), row] as const));
  const lexicalRelationById = new Map(lexicalRelations.map(row => [relationId(row.id), row] as const));
  const compositeById = new Map(composites.map(row => [relationId(row.id), row] as const));
  const lexicalEvidenceByOcc = new Map<string, AnyRecord[]>();
  for (const row of lexicalEvidence) {
    const occId = relationId(row.occ_id);
    if (!occId) continue;
    const list = lexicalEvidenceByOcc.get(occId) ?? [];
    list.push(row);
    lexicalEvidenceByOcc.set(occId, list);
  }

  const compositeEvidenceByOcc = new Map<string, AnyRecord[]>();
  for (const row of compositeEvidence) {
    const occId = compositeOccId(row);
    if (!occId) continue;
    const list = compositeEvidenceByOcc.get(occId) ?? [];
    list.push(row);
    compositeEvidenceByOcc.set(occId, list);
  }

  const seen = new Set<string>();
  const entries: Array<Record<string, string | number | null>> = [];

  const addWordEntry = (
    occ: AnyRecord,
    wordId: string,
    semanticSuffix: string,
  ) => {
    const page = Number(occ.page);
    if (!Number.isFinite(page) || page < 1) return;
    if (!wordId || EDITORIAL_WORD_IDS.has(wordId)) return;

    const word = wordById.get(wordId);
    if (!word) return;
    const characterId = relationId(word.chinese_id);
    const character = characterById.get(characterId);
    if (!characterId || !isLexicalCharacter(character)) return;

    const romId = relationId(word.rom_id);
    const rom = romById.get(romId);
    const characterRaw = text(character?.car);
    const simplified = text(character?.simplified_chinese);
    const romanization = text(rom?.rom);
    const modernRomanization = text(rom?.modern_rom);
    const simpleRomanization = text(rom?.simple_romanization);
    if (!characterRaw && !simplified && !romanization && !modernRomanization && !simpleRomanization) return;

    const line = occ.line == null || occ.line === '' ? null : String(occ.line);
    const semanticKey = [page, line ?? '', wordId, semanticSuffix].join('|');
    if (seen.has(semanticKey)) return;
    seen.add(semanticKey);

    entries.push({
      occurrenceId: relationId(occ.id) || null,
      page: Math.trunc(page),
      line,
      wordId,
      characterId,
      character: characterRaw,
      simplified,
      glyphLink: text(character?.link_nuovo) || text(character?.link),
      romanization,
      modernRomanization,
      simpleRomanization,
    });
  };

  const compoundFirstPages = new Set<number>();

  for (const occ of occurrences) {
    const typology = normalizedTypology(occ.typology);
    const wordId = relationId(occ.word);
    const blankParticulaeRow = typology === 'particulae numerales' && blankAppendixDefinition(occ.latin_definition_2);
    if (wordId && !blankParticulaeRow) addWordEntry(occ, wordId, 'occ-word');

    const occId = relationId(occ.id);

    // Antinomy appendix occurrences deliberately have no occ.word. Their two
    // searchable lexical terms are obtained from the occurrence-backed
    // chinese_rom_chinese_rom relation instead.
    if (typology === 'antinomy') {
      for (const junction of lexicalEvidenceByOcc.get(occId) ?? []) {
        const relation = lexicalRelationById.get(relationId(junction.chinese_rom_chinese_rom_id));
        if (!relation) continue;
        const leftId = relationId(relation.chinese_rom_id);
        const rightId = relationId(relation.related_chinese_rom_id);
        if (leftId) addWordEntry(occ, leftId, `antinomy:${relationId(relation.id)}:left`);
        if (rightId) addWordEntry(occ, rightId, `antinomy:${relationId(relation.id)}:right`);
      }
    }

    // Compound appendix rows are searchable through the composite relation.
    // Empty/null/nan rows remain intentionally absent from the search index,
    // matching their blank visual representation.
    if (typology === 'composti' && !blankAppendixDefinition(occ.latin_definition_2)) {
      for (const junction of compositeEvidenceByOcc.get(occId) ?? []) {
        const composite = compositeById.get(compositeRelationId(junction));
        if (!composite) continue;
        const secondId = relationId(composite.second_syllable);
        if (secondId) addWordEntry(occ, secondId, `compound:${relationId(composite.id)}:second`);

        const page = Number(occ.page);
        const firstId = relationId(composite.first_syllable);
        if (firstId && Number.isFinite(page) && !compoundFirstPages.has(Math.trunc(page))) {
          compoundFirstPages.add(Math.trunc(page));
          addWordEntry({ ...occ, line: 1 }, firstId, `compound:${Math.trunc(page)}:first`);
        }
      }
    }
  }

  entries.sort((a, b) => {
    const pageDiff = Number(a.page) - Number(b.page);
    if (pageDiff) return pageDiff;
    const lineDiff = naturalCompare(a.line, b.line);
    if (lineDiff) return lineDiff;
    return naturalCompare(a.wordId, b.wordId);
  });

  return {
    generatedAt: new Date().toISOString(),
    count: entries.length,
    entries,
  };
}

let payloadPromise: Promise<Awaited<ReturnType<typeof buildPayload>>> | null = null;

export const GET: APIRoute = async () => {
  payloadPromise ??= buildPayload();
  const payload = await payloadPromise;
  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
