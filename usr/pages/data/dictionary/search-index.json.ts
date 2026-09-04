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

function naturalCompare(a: any, b: any): number {
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' });
}

async function buildPayload() {
  const [occurrences, words, characters, romanisations] = await Promise.all([
    readCollection('occ', ['id', 'page', 'line', 'word']),
    readCollection('chinese_rom', ['id', 'chinese_id', 'rom_id']),
    readCollection('chinese', ['id', 'car', 'simplified_chinese', 'link', 'link_nuovo']),
    readCollection('rom', ['id', 'rom', 'modern_rom', 'simple_romanization']),
  ]);

  const wordById = new Map(words.map(row => [relationId(row.id), row] as const));
  const characterById = new Map(characters.map(row => [relationId(row.id), row] as const));
  const romById = new Map(romanisations.map(row => [relationId(row.id), row] as const));

  const seen = new Set<string>();
  const entries: Array<Record<string, string | number | null>> = [];

  for (const occ of occurrences) {
    const page = Number(occ.page);
    if (!Number.isFinite(page) || page < 1) continue;

    const wordId = relationId(occ.word);
    if (!wordId || EDITORIAL_WORD_IDS.has(wordId)) continue;
    const word = wordById.get(wordId);
    if (!word) continue;

    const characterId = relationId(word.chinese_id);
    const character = characterById.get(characterId);
    if (!characterId || !isLexicalCharacter(character)) continue;

    const romId = relationId(word.rom_id);
    const rom = romById.get(romId);
    const characterRaw = text(character?.car);
    const simplified = text(character?.simplified_chinese);
    const romanization = text(rom?.rom);
    const modernRomanization = text(rom?.modern_rom);
    const simpleRomanization = text(rom?.simple_romanization);

    if (!characterRaw && !simplified && !romanization && !modernRomanization && !simpleRomanization) continue;

    const line = occ.line == null || occ.line === '' ? null : String(occ.line);
    const semanticKey = [page, line ?? '', wordId].join('|');
    if (seen.has(semanticKey)) continue;
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
