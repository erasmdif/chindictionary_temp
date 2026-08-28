import type { APIRoute } from 'astro';
import { fetchFromDirectus } from '@core/utils/directus';
import type {
  ComparisonCharacter,
  ComparisonCompound,
  ComparisonCompoundComponent,
  ComparisonVariant,
  TextComparisonIndexPayload,
} from '../../components/text-comparison/types';

export const prerender = true;

type AnyRecord = Record<string, any>;
const PAGE_LIMIT = 2500;
let payloadPromise: Promise<TextComparisonIndexPayload> | null = null;

const NON_LEXICAL_CHARACTER_SENTINELS = new Set([
  'null',
  'change_radical',
  'bf_change_radical',
  'before_change_radical',
  'before_radical',
]);

function relationId(value: any): string {
  if (value == null || value === '') return '';
  if (typeof value === 'object') return String(value.id ?? '');
  return String(value);
}

function text(value: any): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'object') {
    const candidate = value.car ?? value.value ?? value.name ?? value.label ?? value.title ?? value.id;
    return candidate == null || candidate === '' ? null : String(candidate);
  }
  return String(value);
}

function isLexicalCharacter(row: AnyRecord | undefined | null): boolean {
  const raw = text(row?.car)?.trim();
  if (!raw) return false;
  const normalized = raw.toLowerCase().replace(/\s+/g, '_');
  return !NON_LEXICAL_CHARACTER_SENTINELS.has(normalized);
}

function naturalCompare(a: any, b: any): number {
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' });
}

function glyphInfo(row: AnyRecord | undefined | null) {
  const raw = text(row?.car)?.trim() || null;
  const simplified = text(row?.simplified_chinese)?.trim() || null;
  const formalism = Boolean(raw && raw.includes('['));
  const display = formalism ? (simplified ? `${simplified}*` : '*') : (raw || simplified || '—');
  const match = formalism ? simplified : (raw || simplified);
  return {
    raw,
    simplified,
    formalism,
    display,
    match,
    link: text(row?.link_nuovo) || text(row?.link),
  };
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
    if (!rows.length) break;
    out.push(...rows);
    offset += rows.length;
    if (rows.length < PAGE_LIMIT) break;
  }
  return out;
}

async function readCollection(
  table: string,
  fields: readonly string[],
  warnings: string[],
  optional = false,
): Promise<AnyRecord[]> {
  const params = new URLSearchParams();
  params.set('fields', fields.join(','));
  params.set('sort', 'id');
  try {
    return await requestPaged(table, params);
  } catch (error) {
    const first = error instanceof Error ? error.message : String(error);
    try {
      const fallback = new URLSearchParams();
      fallback.set('sort', 'id');
      const rows = await requestPaged(table, fallback);
      warnings.push(`Field-list fallback used for ${table}: ${first}`);
      return rows;
    } catch (secondError) {
      if (optional) {
        warnings.push(`Optional collection ${table} unavailable: ${secondError instanceof Error ? secondError.message : String(secondError)}`);
        return [];
      }
      throw secondError;
    }
  }
}

function aggregateCount(row: AnyRecord): number {
  const raw = row?.countDistinct?.id ?? row?.countDistinct ?? row?.count?.id ?? row?.count ?? row?.__count ?? 0;
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

async function readWordCounts(warnings: string[]): Promise<Map<string, number>> {
  const params = new URLSearchParams();
  params.append('aggregate[countDistinct]', 'id');
  params.append('groupBy[]', 'word');
  const counts = new Map<string, number>();

  try {
    const rows = await requestPaged('occ', params);
    for (const row of rows) {
      const wordId = relationId(row.word);
      const count = aggregateCount(row);
      if (wordId && count) counts.set(wordId, (counts.get(wordId) ?? 0) + count);
    }
    return counts;
  } catch (error) {
    warnings.push(`Directus aggregation fallback used for occ: ${error instanceof Error ? error.message : String(error)}`);
    const rows = await readCollection('occ', ['id', 'word'], warnings);
    for (const row of rows) {
      const wordId = relationId(row.word);
      if (wordId) counts.set(wordId, (counts.get(wordId) ?? 0) + 1);
    }
    return counts;
  }
}

async function readGraphicEvidenceCounts(warnings: string[]): Promise<Map<string, number>> {
  const params = new URLSearchParams();
  params.append('aggregate[countDistinct]', 'id');
  params.append('groupBy[]', 'chinese_chinese_id');
  const counts = new Map<string, number>();

  try {
    const rows = await requestPaged('occ_chinese_chinese', params);
    for (const row of rows) {
      const relation = relationId(row.chinese_chinese_id);
      const count = aggregateCount(row);
      if (relation && count) counts.set(relation, (counts.get(relation) ?? 0) + count);
    }
    return counts;
  } catch (error) {
    warnings.push(`Directus aggregation fallback used for occ_chinese_chinese: ${error instanceof Error ? error.message : String(error)}`);
    try {
      const rows = await readCollection('occ_chinese_chinese', ['id', 'chinese_chinese_id'], warnings, true);
      for (const row of rows) {
        const relation = relationId(row.chinese_chinese_id);
        if (relation) counts.set(relation, (counts.get(relation) ?? 0) + 1);
      }
    } catch {
      // Optional relation: leave the map empty.
    }
    return counts;
  }
}

function isTwoGlyphString(value: string | null): boolean {
  if (!value) return false;
  return Array.from(value.trim()).length === 2;
}

async function buildPayload(): Promise<TextComparisonIndexPayload> {
  const warnings: string[] = [];

  const [characters, words, romanisations, wordCounts, graphicRelations, graphicEvidenceCounts, composites] = await Promise.all([
    readCollection('chinese', ['id', 'car', 'simplified_chinese', 'link', 'link_nuovo'], warnings),
    readCollection('chinese_rom', ['id', 'chinese_id', 'rom_id', 'english_definition'], warnings),
    readCollection('rom', ['id', 'rom', 'modern_rom'], warnings),
    readWordCounts(warnings),
    readCollection('chinese_chinese', ['id', 'chinese_id', 'related_chinese_id', 'typology'], warnings, true),
    readGraphicEvidenceCounts(warnings),
    readCollection('composite_words', ['id', 'first_syllable', 'second_syllable', 'word'], warnings, true),
  ]);

  const characterById = new Map(
    characters
      .filter(isLexicalCharacter)
      .map(row => [relationId(row.id), row] as const),
  );
  const wordById = new Map(words.map(row => [relationId(row.id), row] as const));
  const romById = new Map(romanisations.map(row => [relationId(row.id), row] as const));

  const readingsByCharacter = new Map<string, ComparisonCharacter['readings']>();
  const occurrenceCountByCharacter = new Map<string, number>();

  for (const word of words) {
    const wordId = relationId(word.id);
    const characterId = relationId(word.chinese_id);
    if (!wordId || !characterId || !characterById.has(characterId)) continue;
    const count = wordCounts.get(wordId) ?? 0;
    const rom = romById.get(relationId(word.rom_id));
    const list = readingsByCharacter.get(characterId) ?? [];
    list.push({
      id: wordId,
      historical: text(rom?.rom),
      modern: text(rom?.modern_rom),
      english: text(word.english_definition),
      occurrenceCount: count,
    });
    readingsByCharacter.set(characterId, list);
    if (count) occurrenceCountByCharacter.set(characterId, (occurrenceCountByCharacter.get(characterId) ?? 0) + count);
  }

  const occurrenceBackedVariantIds = new Set<string>();
  for (const [relationIdValue, count] of graphicEvidenceCounts.entries()) {
    if (count > 0) occurrenceBackedVariantIds.add(relationIdValue);
  }

  const relevantCharacterIds = new Set<string>(occurrenceCountByCharacter.keys());
  const variants: ComparisonVariant[] = [];
  const seenVariantKeys = new Set<string>();

  for (const relation of graphicRelations) {
    const relationIdValue = relationId(relation.id);
    if (!relationIdValue || !occurrenceBackedVariantIds.has(relationIdValue)) continue;
    const sourceId = relationId(relation.chinese_id);
    const targetId = relationId(relation.related_chinese_id);
    const source = characterById.get(sourceId);
    const target = characterById.get(targetId);
    if (!source || !target || !sourceId || !targetId || sourceId === targetId) continue;

    relevantCharacterIds.add(sourceId);
    relevantCharacterIds.add(targetId);
    const sourceGlyph = glyphInfo(source);
    const targetGlyph = glyphInfo(target);
    const semanticKey = [sourceId, targetId, text(relation.typology) ?? ''].join('|');
    if (seenVariantKeys.has(semanticKey)) continue;
    seenVariantKeys.add(semanticKey);

    variants.push({
      relationId: relationIdValue,
      sourceCharacterId: sourceId,
      sourceGlyph: sourceGlyph.display,
      sourceMatchGlyph: sourceGlyph.match,
      variantCharacterId: targetId,
      variantGlyph: targetGlyph.display,
      variantMatchGlyph: targetGlyph.match,
      variantFormalism: targetGlyph.formalism,
      variantGlyphLink: targetGlyph.link,
      typology: text(relation.typology),
      evidenceCount: graphicEvidenceCounts.get(relationIdValue) ?? 0,
    });
  }

  const resolveComponent = (readingId: string): ComparisonCompoundComponent | null => {
    const word = wordById.get(readingId);
    if (!word) return null;
    const characterId = relationId(word.chinese_id);
    const character = characterById.get(characterId);
    if (!character) return null;
    relevantCharacterIds.add(characterId);
    const glyph = glyphInfo(character);
    const rom = romById.get(relationId(word.rom_id));
    return {
      readingId,
      characterId,
      glyph: glyph.display,
      matchGlyph: glyph.match,
      historical: text(rom?.rom),
      modern: text(rom?.modern_rom),
    };
  };

  const compoundRows: ComparisonCompound[] = [];
  for (const row of composites) {
    const first = resolveComponent(relationId(row.first_syllable));
    const second = resolveComponent(relationId(row.second_syllable));
    if (!first || !second || !first.matchGlyph || !second.matchGlyph) continue;

    const structuralForm = `${first.matchGlyph}${second.matchGlyph}`;
    const manualWord = text(row.word)?.trim() || null;
    const matchForms = Array.from(new Set([
      structuralForm,
      ...(isTwoGlyphString(manualWord) ? [manualWord as string] : []),
    ].filter(Boolean)));
    const displayWord = `${first.glyph}${second.glyph}`;
    compoundRows.push({
      id: relationId(row.id),
      word: manualWord,
      matchForms,
      displayWord,
      historicalRomanisation: [first.historical, second.historical].filter(Boolean).join(' '),
      first,
      second,
    });
  }

  const characterData: ComparisonCharacter[] = [];
  for (const characterId of relevantCharacterIds) {
    const row = characterById.get(characterId);
    if (!row) continue;
    const glyph = glyphInfo(row);
    const readings = [...(readingsByCharacter.get(characterId) ?? [])]
      .sort((a, b) => (b.occurrenceCount - a.occurrenceCount) || naturalCompare(a.historical, b.historical));
    const attestationCount = occurrenceCountByCharacter.get(characterId) ?? 0;
    characterData.push({
      id: characterId,
      rawCharacter: glyph.raw,
      displayCharacter: glyph.display,
      simplified: glyph.simplified,
      glyphLink: glyph.link,
      formalism: glyph.formalism,
      attested: attestationCount > 0,
      attestationCount,
      readings,
    });
  }

  characterData.sort((a, b) => naturalCompare(a.rawCharacter ?? a.simplified, b.rawCharacter ?? b.simplified));
  variants.sort((a, b) => naturalCompare(a.variantMatchGlyph, b.variantMatchGlyph) || naturalCompare(a.sourceGlyph, b.sourceGlyph));
  compoundRows.sort((a, b) => naturalCompare(a.displayWord, b.displayWord) || naturalCompare(a.id, b.id));

  return {
    generatedAt: new Date().toISOString(),
    warnings,
    characters: characterData,
    variants,
    compounds: compoundRows,
    stats: {
      attestedCharacters: characterData.filter(row => row.attested).length,
      historicalForms: characterData.filter(row => row.attested && row.formalism).length,
      occurrenceBackedVariants: variants.length,
      compounds: compoundRows.length,
    },
  };
}

export const GET: APIRoute = async () => {
  try {
    payloadPromise ??= buildPayload();
    const payload = await payloadPromise;
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': import.meta.env.DEV ? 'no-store' : 'public, max-age=86400, immutable',
      },
    });
  } catch (error) {
    payloadPromise = null;
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
};
