import type { APIRoute, GetStaticPaths } from 'astro';
import { fetchFromDirectus } from '@core/utils/directus';
import type {
  CharacterRecordDetailPayload,
  RecordAttestation,
  RecordCompound,
  RecordGraphicVariant,
  RecordLexicalRelation,
  RecordLocus,
  RecordReading,
  RecordRelationAtLocus,
  RecordRelationEvidence,
  RecordSourceRadical,
} from '../../../components/characters/recordTypes';

export const prerender = true;

type AnyRecord = Record<string, any>;
const PAGE_LIMIT = 2500;

const FIELDS = {
  chinese: ['id', 'car', 'simplified_chinese', 'link', 'link_nuovo', 'note', 'not_standard', 'strokes', 'strokes_not_num', 'semantic_radical', 'phonetic_radical', 'date_created', 'date_updated'],
  chineseRom: ['id', 'chinese_id', 'rom_id', 'english_definition', 'interpreted'],
  rom: ['id', 'rom', 'modern_rom', 'simple_romanization', 'tone', 'notes'],
  occ: ['id', 'dictionary_id', 'page', 'line', 'typology', 'latin_definition_2', 'note', 'stroke', 'n_strokes', 'radical', 'word'],
  lexicalRelations: ['id', 'chinese_rom_id', 'related_chinese_rom_id', 'typology'],
  lexicalEvidence: ['id', 'occ_id', 'chinese_rom_chinese_rom_id', 'position', 'internal', 'note', 'solo_carattere'],
  graphicRelations: ['id', 'chinese_id', 'related_chinese_id', 'typology'],
  graphicEvidence: ['id', 'occ_id', 'chinese_chinese_id'],
  composites: ['id', 'first_syllable', 'second_syllable', 'word'],
  dictionaries: ['id', 'title', 'author', 'year'],
} as const;

function relationId(value: any): string {
  if (value == null || value === '') return '';
  if (typeof value === 'object') return String(value.id ?? '');
  return String(value);
}

function text(value: any): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'object') {
    const candidate = value.car ?? value.title ?? value.name ?? value.label ?? value.value ?? value.id;
    return candidate == null || candidate === '' ? null : String(candidate);
  }
  return String(value);
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

function naturalCompare(a: any, b: any): number {
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' });
}

function idsCsv(ids: Iterable<string>): string {
  return Array.from(new Set(Array.from(ids).filter(Boolean))).join(',');
}

function displayGlyph(row: AnyRecord | undefined | null): { raw: string | null; simplified: string | null; display: string; formalism: boolean; link: string | null } {
  const raw = text(row?.car)?.trim() || null;
  const simplified = text(row?.simplified_chinese)?.trim() || null;
  const formalism = Boolean(raw && raw.includes('['));
  const display = formalism ? (simplified ? `${simplified}*` : '*') : (raw || simplified || '—');
  return {
    raw,
    simplified,
    display,
    formalism,
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
  extras: URLSearchParams | null,
  warnings: string[],
  optional = false,
): Promise<AnyRecord[]> {
  const params = extras ? new URLSearchParams(extras) : new URLSearchParams();
  params.set('fields', fields.join(','));
  try {
    return await requestPaged(table, params);
  } catch (error) {
    const first = error instanceof Error ? error.message : String(error);
    try {
      const fallback = extras ? new URLSearchParams(extras) : new URLSearchParams();
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


async function readLimitedCollection(
  table: string,
  fields: readonly string[],
  extras: URLSearchParams,
  warnings: string[],
  optional = false,
): Promise<AnyRecord[]> {
  const params = new URLSearchParams(extras);
  params.set('fields', fields.join(','));
  try {
    return await requestRows(table, params);
  } catch (error) {
    const first = error instanceof Error ? error.message : String(error);
    try {
      const fallback = new URLSearchParams(extras);
      const rows = await requestRows(table, fallback);
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

function eq(field: string, value: string): URLSearchParams {
  const p = new URLSearchParams();
  p.set(`filter[${field}][_eq]`, value);
  return p;
}

function inFilter(field: string, values: Iterable<string>): URLSearchParams {
  const p = new URLSearchParams();
  const csv = idsCsv(values);
  if (csv) p.set(`filter[${field}][_in]`, csv);
  return p;
}

function orIn(leftField: string, rightField: string, values: Iterable<string>): URLSearchParams {
  const p = new URLSearchParams();
  const csv = idsCsv(values);
  if (csv) {
    p.set(`filter[_or][0][${leftField}][_in]`, csv);
    p.set(`filter[_or][1][${rightField}][_in]`, csv);
  }
  return p;
}

interface RawData {
  character: AnyRecord;
  allCharactersForNeighbors: AnyRecord[];
  readings: AnyRecord[];
  romanizations: AnyRecord[];
  occurrences: AnyRecord[];
  evidenceOccurrences: AnyRecord[];
  lexicalRelations: AnyRecord[];
  lexicalEvidence: AnyRecord[];
  graphicRelations: AnyRecord[];
  graphicEvidence: AnyRecord[];
  composites: AnyRecord[];
  targetReadings: AnyRecord[];
  targetRomanizations: AnyRecord[];
  targetCharacters: AnyRecord[];
  dictionaries: AnyRecord[];
  warnings: string[];
}

interface BuildCache {
  chinese: AnyRecord[];
  chineseRom: AnyRecord[];
  rom: AnyRecord[];
  occ: AnyRecord[];
  lexicalRelations: AnyRecord[];
  lexicalEvidence: AnyRecord[];
  graphicRelations: AnyRecord[];
  graphicEvidence: AnyRecord[];
  composites: AnyRecord[];
  dictionaries: AnyRecord[];
  warnings: string[];
}

let buildCachePromise: Promise<BuildCache> | null = null;

async function loadBuildCache(): Promise<BuildCache> {
  if (buildCachePromise) return buildCachePromise;
  buildCachePromise = (async () => {
    const warnings: string[] = [];
    const [chinese, chineseRom, rom, occ, lexicalRelations, lexicalEvidence, graphicRelations, graphicEvidence, composites, dictionaries] = await Promise.all([
      readCollection('chinese', FIELDS.chinese, null, warnings),
      readCollection('chinese_rom', FIELDS.chineseRom, null, warnings),
      readCollection('rom', FIELDS.rom, null, warnings),
      readCollection('occ', FIELDS.occ, null, warnings),
      readCollection('chinese_rom_chinese_rom', FIELDS.lexicalRelations, null, warnings, true),
      readCollection('occ_chinese_rom_chinese_rom', FIELDS.lexicalEvidence, null, warnings, true),
      readCollection('chinese_chinese', FIELDS.graphicRelations, null, warnings, true),
      readCollection('occ_chinese_chinese', FIELDS.graphicEvidence, null, warnings, true),
      readCollection('composite_words', FIELDS.composites, null, warnings, true),
      readCollection('dictionaries', FIELDS.dictionaries, null, warnings, true),
    ]);
    return { chinese, chineseRom, rom, occ, lexicalRelations, lexicalEvidence, graphicRelations, graphicEvidence, composites, dictionaries, warnings };
  })();
  return buildCachePromise;
}

async function loadTargeted(id: string): Promise<RawData> {
  const warnings: string[] = [];
  const characterRows = await readCollection('chinese', FIELDS.chinese, eq('id', id), warnings);
  const character = characterRows[0];
  if (!character) throw new Error(`Character ${id} not found.`);

  const readings = await readCollection('chinese_rom', FIELDS.chineseRom, eq('chinese_id', id), warnings);
  const readingIds = readings.map(row => relationId(row.id)).filter(Boolean);
  const readingIdCsv = idsCsv(readingIds);

  const romIds = readings.map(row => relationId(row.rom_id)).filter(Boolean);
  const romParams = inFilter('id', romIds);
  const occParams = inFilter('word', readingIds);
  const lexicalParams = orIn('chinese_rom_id', 'related_chinese_rom_id', readingIds);
  const graphicParams = new URLSearchParams();
  graphicParams.set('filter[_or][0][chinese_id][_eq]', id);
  graphicParams.set('filter[_or][1][related_chinese_id][_eq]', id);
  const compositeParams = orIn('first_syllable', 'second_syllable', readingIds);

  const [romanizations, occurrences, lexicalRelations, graphicRelations, composites] = await Promise.all([
    readingIdCsv ? readCollection('rom', FIELDS.rom, romParams, warnings) : Promise.resolve([]),
    readingIdCsv ? readCollection('occ', FIELDS.occ, occParams, warnings) : Promise.resolve([]),
    readingIdCsv ? readCollection('chinese_rom_chinese_rom', FIELDS.lexicalRelations, lexicalParams, warnings, true) : Promise.resolve([]),
    readCollection('chinese_chinese', FIELDS.graphicRelations, graphicParams, warnings, true),
    readingIdCsv ? readCollection('composite_words', FIELDS.composites, compositeParams, warnings, true) : Promise.resolve([]),
  ]);

  const lexicalRelationIds = lexicalRelations.map(row => relationId(row.id)).filter(Boolean);
  const graphicRelationIds = graphicRelations.map(row => relationId(row.id)).filter(Boolean);
  const counterpartReadingIds = new Set<string>();
  for (const row of lexicalRelations) {
    const a = relationId(row.chinese_rom_id);
    const b = relationId(row.related_chinese_rom_id);
    if (a && !readingIds.includes(a)) counterpartReadingIds.add(a);
    if (b && !readingIds.includes(b)) counterpartReadingIds.add(b);
  }
  for (const row of composites) {
    const a = relationId(row.first_syllable);
    const b = relationId(row.second_syllable);
    if (a && !readingIds.includes(a)) counterpartReadingIds.add(a);
    if (b && !readingIds.includes(b)) counterpartReadingIds.add(b);
  }

  const [lexicalEvidence, graphicEvidence, targetReadings] = await Promise.all([
    lexicalRelationIds.length ? readCollection('occ_chinese_rom_chinese_rom', FIELDS.lexicalEvidence, inFilter('chinese_rom_chinese_rom_id', lexicalRelationIds), warnings, true) : Promise.resolve([]),
    graphicRelationIds.length ? readCollection('occ_chinese_chinese', FIELDS.graphicEvidence, inFilter('chinese_chinese_id', graphicRelationIds), warnings, true) : Promise.resolve([]),
    counterpartReadingIds.size ? readCollection('chinese_rom', FIELDS.chineseRom, inFilter('id', counterpartReadingIds), warnings) : Promise.resolve([]),
  ]);

  const targetCharacterIds = new Set<string>();
  const targetRomIds = new Set<string>();
  for (const row of targetReadings) {
    const cid = relationId(row.chinese_id);
    const rid = relationId(row.rom_id);
    if (cid) targetCharacterIds.add(cid);
    if (rid) targetRomIds.add(rid);
  }
  for (const row of graphicRelations) {
    const a = relationId(row.chinese_id);
    const b = relationId(row.related_chinese_id);
    if (a && a !== id) targetCharacterIds.add(a);
    if (b && b !== id) targetCharacterIds.add(b);
  }

  const evidenceOccIds = new Set([...lexicalEvidence, ...graphicEvidence].map(row => relationId(row.occ_id)).filter(Boolean));
  const [evidenceOccurrences, targetCharacters, targetRomanizations, prevRows, nextRows] = await Promise.all([
    evidenceOccIds.size ? readCollection('occ', FIELDS.occ, inFilter('id', evidenceOccIds), warnings) : Promise.resolve([]),
    targetCharacterIds.size ? readCollection('chinese', FIELDS.chinese, inFilter('id', targetCharacterIds), warnings) : Promise.resolve([]),
    targetRomIds.size ? readCollection('rom', FIELDS.rom, inFilter('id', targetRomIds), warnings) : Promise.resolve([]),
    readLimitedCollection('chinese', ['id', 'car', 'simplified_chinese', 'link', 'link_nuovo'], (() => { const p = new URLSearchParams(); p.set('filter[id][_lt]', id); p.set('sort', '-id'); p.set('limit', '1'); return p; })(), warnings, true),
    readLimitedCollection('chinese', ['id', 'car', 'simplified_chinese', 'link', 'link_nuovo'], (() => { const p = new URLSearchParams(); p.set('filter[id][_gt]', id); p.set('sort', 'id'); p.set('limit', '1'); return p; })(), warnings, true),
  ]);
  const dictionaryIds = new Set([...occurrences, ...evidenceOccurrences].map(row => relationId(row.dictionary_id)).filter(Boolean));
  const dictionaries = dictionaryIds.size
    ? await readCollection('dictionaries', FIELDS.dictionaries, inFilter('id', dictionaryIds), warnings, true)
    : [];

  return {
    character,
    allCharactersForNeighbors: [...prevRows, character, ...nextRows],
    readings,
    romanizations,
    occurrences,
    evidenceOccurrences,
    lexicalRelations,
    lexicalEvidence,
    graphicRelations,
    graphicEvidence,
    composites,
    targetReadings,
    targetRomanizations,
    targetCharacters,
    dictionaries,
    warnings,
  };
}

async function loadFromCache(id: string): Promise<RawData> {
  const cache = await loadBuildCache();
  const character = cache.chinese.find(row => relationId(row.id) === id);
  if (!character) throw new Error(`Character ${id} not found.`);
  const readings = cache.chineseRom.filter(row => relationId(row.chinese_id) === id);
  const readingIds = new Set(readings.map(row => relationId(row.id)).filter(Boolean));
  const romanizations = cache.rom.filter(row => new Set(readings.map(r => relationId(r.rom_id))).has(relationId(row.id)));
  const occurrences = cache.occ.filter(row => readingIds.has(relationId(row.word)));
  const lexicalRelations = cache.lexicalRelations.filter(row => readingIds.has(relationId(row.chinese_rom_id)) || readingIds.has(relationId(row.related_chinese_rom_id)));
  const lexicalRelationIds = new Set(lexicalRelations.map(row => relationId(row.id)).filter(Boolean));
  const lexicalEvidence = cache.lexicalEvidence.filter(row => lexicalRelationIds.has(relationId(row.chinese_rom_chinese_rom_id)));
  const graphicRelations = cache.graphicRelations.filter(row => relationId(row.chinese_id) === id || relationId(row.related_chinese_id) === id);
  const graphicRelationIds = new Set(graphicRelations.map(row => relationId(row.id)).filter(Boolean));
  const graphicEvidence = cache.graphicEvidence.filter(row => graphicRelationIds.has(relationId(row.chinese_chinese_id)));
  const evidenceOccIds = new Set([...lexicalEvidence, ...graphicEvidence].map(row => relationId(row.occ_id)).filter(Boolean));
  const evidenceOccurrences = cache.occ.filter(row => evidenceOccIds.has(relationId(row.id)));
  const composites = cache.composites.filter(row => readingIds.has(relationId(row.first_syllable)) || readingIds.has(relationId(row.second_syllable)));

  const counterpartReadingIds = new Set<string>();
  for (const row of lexicalRelations) {
    const a = relationId(row.chinese_rom_id); const b = relationId(row.related_chinese_rom_id);
    if (a && !readingIds.has(a)) counterpartReadingIds.add(a);
    if (b && !readingIds.has(b)) counterpartReadingIds.add(b);
  }
  for (const row of composites) {
    const a = relationId(row.first_syllable); const b = relationId(row.second_syllable);
    if (a && !readingIds.has(a)) counterpartReadingIds.add(a);
    if (b && !readingIds.has(b)) counterpartReadingIds.add(b);
  }
  const targetReadings = cache.chineseRom.filter(row => counterpartReadingIds.has(relationId(row.id)));
  const targetCharacterIds = new Set(targetReadings.map(row => relationId(row.chinese_id)).filter(Boolean));
  for (const row of graphicRelations) {
    const a = relationId(row.chinese_id); const b = relationId(row.related_chinese_id);
    if (a && a !== id) targetCharacterIds.add(a);
    if (b && b !== id) targetCharacterIds.add(b);
  }
  const targetRomIds = new Set(targetReadings.map(row => relationId(row.rom_id)).filter(Boolean));
  const targetCharacters = cache.chinese.filter(row => targetCharacterIds.has(relationId(row.id)));
  const targetRomanizations = cache.rom.filter(row => targetRomIds.has(relationId(row.id)));
  const dictionaryIds = new Set([...occurrences, ...evidenceOccurrences].map(row => relationId(row.dictionary_id)).filter(Boolean));
  const dictionaries = cache.dictionaries.filter(row => dictionaryIds.has(relationId(row.id)));

  return {
    character,
    allCharactersForNeighbors: cache.chinese,
    readings,
    romanizations,
    occurrences,
    evidenceOccurrences,
    lexicalRelations,
    lexicalEvidence,
    graphicRelations,
    graphicEvidence,
    composites,
    targetReadings,
    targetRomanizations,
    targetCharacters,
    dictionaries,
    warnings: [...cache.warnings],
  };
}

function dictionaryLabel(row: AnyRecord | undefined, id: string | null): string {
  if (!row) return id ? `Dictionary ${id}` : 'Dictionary';
  const title = text(row.title);
  const author = text(row.author);
  const year = text(row.year);
  const main = title || author || (id ? `Dictionary ${id}` : 'Dictionary');
  return year ? `${main} (${year})` : main;
}

function relationCategory(value: string | null): RecordLexicalRelation['category'] {
  const normalized = (value || '').toLocaleLowerCase();
  if (normalized.includes('no sinon')) return 'rejected';
  if (normalized.includes('anton')) return 'antonym';
  if (normalized.includes('sinon')) return 'synonym';
  // The current relation table is populated primarily from synonym slots. An
  // empty scholarly typology therefore remains a source synonym association,
  // while the label itself stays explicit about the absence of an assessment.
  return 'synonym';
}

function uniqueLoci(rows: RecordLocus[]): RecordLocus[] {
  const map = new Map<string, RecordLocus>();
  for (const row of rows) {
    const k = `${row.dictionaryId ?? ''}|${row.page ?? ''}|${row.line ?? ''}`;
    if (!map.has(k)) map.set(k, row);
  }
  return Array.from(map.values()).sort((a, b) => naturalCompare(a.dictionaryLabel, b.dictionaryLabel) || naturalCompare(a.page, b.page) || naturalCompare(a.line, b.line));
}

async function buildPayload(id: string): Promise<CharacterRecordDetailPayload> {
  const raw = import.meta.env.DEV ? await loadTargeted(id) : await loadFromCache(id);
  const warnings = [...raw.warnings];

  const allChinese = new Map<string, AnyRecord>();
  allChinese.set(id, raw.character);
  for (const row of raw.targetCharacters) allChinese.set(relationId(row.id), row);
  const allReadings = new Map<string, AnyRecord>();
  for (const row of [...raw.readings, ...raw.targetReadings]) allReadings.set(relationId(row.id), row);
  const allRom = new Map<string, AnyRecord>();
  for (const row of [...raw.romanizations, ...raw.targetRomanizations]) allRom.set(relationId(row.id), row);
  const dictionaryById = new Map(raw.dictionaries.map(row => [relationId(row.id), row]));
  const readingIds = new Set(raw.readings.map(row => relationId(row.id)).filter(Boolean));
  const occById = new Map([...raw.occurrences, ...raw.evidenceOccurrences].map(row => [relationId(row.id), row]));

  const characterGlyph = displayGlyph(raw.character);

  const locusOfOcc = (occ: AnyRecord): RecordLocus => {
    const dictionaryId = relationId(occ.dictionary_id) || null;
    return {
      dictionaryId,
      dictionaryLabel: dictionaryLabel(dictionaryById.get(dictionaryId || ''), dictionaryId),
      page: pageNumber(occ.page),
      line: occ.line == null || occ.line === '' ? null : occ.line,
    };
  };

  const definitionGroups = new Map<string, Map<string, { typology: string | null; html: string; count: number; loci: RecordLocus[] }>>();
  for (const occ of raw.occurrences) {
    const readingId = relationId(occ.word);
    const html = text(occ.latin_definition_2)?.trim() || '';
    if (!readingId || !html) continue;
    const typology = text(occ.typology)?.trim() || null;
    const key = `${typology ?? ''}\u0000${html}`;
    const byReading = definitionGroups.get(readingId) ?? new Map();
    const group = byReading.get(key) ?? { typology, html, count: 0, loci: [] };
    group.count += 1;
    group.loci.push(locusOfOcc(occ));
    byReading.set(key, group);
    definitionGroups.set(readingId, byReading);
  }

  const readings: RecordReading[] = raw.readings.map(row => {
    const readingId = relationId(row.id);
    const rom = allRom.get(relationId(row.rom_id));
    const readingOcc = raw.occurrences.filter(occ => relationId(occ.word) === readingId);
    const definitions = Array.from(definitionGroups.get(readingId)?.values() ?? []).map(group => ({ ...group, loci: uniqueLoci(group.loci) }));
    return {
      id: readingId,
      historical: text(rom?.rom),
      simpleHistorical: text(rom?.simple_romanization),
      modern: text(rom?.modern_rom),
      tone: rom?.tone == null || rom?.tone === '' ? null : rom.tone,
      english: text(row.english_definition),
      interpreted: bool(row.interpreted),
      occurrenceCount: readingOcc.length,
      locusCount: uniqueLoci(readingOcc.map(locusOfOcc)).length,
      definitions,
    };
  }).sort((a, b) => (b.occurrenceCount - a.occurrenceCount) || naturalCompare(a.historical, b.historical));

  const lexicalEvidenceByRelation = new Map<string, AnyRecord[]>();
  for (const evidence of raw.lexicalEvidence) {
    const relationIdValue = relationId(evidence.chinese_rom_chinese_rom_id);
    const list = lexicalEvidenceByRelation.get(relationIdValue) ?? [];
    list.push(evidence);
    lexicalEvidenceByRelation.set(relationIdValue, list);
  }

  const lexicalRelationRows: RecordLexicalRelation[] = raw.lexicalRelations.map(row => {
    const relationIdValue = relationId(row.id);
    const left = relationId(row.chinese_rom_id);
    const right = relationId(row.related_chinese_rom_id);
    const leftLocal = readingIds.has(left);
    const localReadingId = leftLocal ? left : right;
    const targetReadingId = leftLocal ? right : left;
    const targetReading = allReadings.get(targetReadingId);
    const targetCharacterId = relationId(targetReading?.chinese_id);
    const targetCharacter = allChinese.get(targetCharacterId);
    const targetRom = allRom.get(relationId(targetReading?.rom_id));
    const glyph = displayGlyph(targetCharacter);
    const evidence: RecordRelationEvidence[] = (lexicalEvidenceByRelation.get(relationIdValue) ?? []).map(item => {
      const occId = relationId(item.occ_id);
      const occ = occById.get(occId);
      const locus = occ ? locusOfOcc(occ) : { dictionaryId: null, dictionaryLabel: 'Dictionary', page: null, line: null };
      return {
        id: relationId(item.id),
        occId,
        ...locus,
        position: item.position == null || item.position === '' ? null : item.position,
        internal: item.internal == null || item.internal === '' ? null : bool(item.internal),
        note: text(item.note),
      };
    });
    const distinctEvidenceOccs = new Set(evidence.map(item => item.occId).filter(Boolean));
    return {
      id: relationIdValue,
      localReadingId,
      targetReadingId,
      targetCharacterId,
      targetGlyph: glyph.display,
      targetFormalism: glyph.formalism,
      targetGlyphLink: glyph.link,
      targetHistorical: text(targetRom?.rom),
      targetModern: text(targetRom?.modern_rom),
      targetEnglish: text(targetReading?.english_definition),
      typology: text(row.typology),
      category: relationCategory(text(row.typology)),
      evidenceCount: distinctEvidenceOccs.size,
      evidence,
    };
  }).filter(row => row.targetCharacterId && row.targetReadingId);

  const lexicalDedup = new Map<string, RecordLexicalRelation>();
  for (const relation of lexicalRelationRows) {
    const dedupKey = `${relation.localReadingId}\u0000${relation.targetReadingId}\u0000${relation.typology ?? ''}`;
    const existing = lexicalDedup.get(dedupKey);
    if (!existing) {
      lexicalDedup.set(dedupKey, relation);
      continue;
    }
    const evidenceMap = new Map(existing.evidence.map(item => [item.id || `${item.occId}:${item.position ?? ''}:${item.internal ?? ''}`, item]));
    for (const item of relation.evidence) evidenceMap.set(item.id || `${item.occId}:${item.position ?? ''}:${item.internal ?? ''}`, item);
    existing.evidence = Array.from(evidenceMap.values());
    existing.evidenceCount = new Set(existing.evidence.map(item => item.occId).filter(Boolean)).size;
  }
  const lexicalRelations = Array.from(lexicalDedup.values()).sort((a, b) => naturalCompare(a.targetGlyph, b.targetGlyph) || naturalCompare(a.targetHistorical, b.targetHistorical));

  const graphicEvidenceByRelation = new Map<string, AnyRecord[]>();
  for (const evidence of raw.graphicEvidence) {
    const relationIdValue = relationId(evidence.chinese_chinese_id);
    const list = graphicEvidenceByRelation.get(relationIdValue) ?? [];
    list.push(evidence);
    graphicEvidenceByRelation.set(relationIdValue, list);
  }

  const variantDedup = new Map<string, RecordGraphicVariant>();
  for (const row of raw.graphicRelations) {
    const relationIdValue = relationId(row.id);
    const left = relationId(row.chinese_id);
    const right = relationId(row.related_chinese_id);
    const targetCharacterId = left === id ? right : left;
    if (!targetCharacterId || targetCharacterId === id) continue;
    const target = allChinese.get(targetCharacterId);
    if (!target) continue;
    const glyph = displayGlyph(target);
    const typology = text(row.typology);
    const dedupKey = `${targetCharacterId}\u0000${typology ?? ''}`;
    const evidence = (graphicEvidenceByRelation.get(relationIdValue) ?? []).map(item => {
      const occ = occById.get(relationId(item.occ_id));
      return occ ? locusOfOcc(occ) : null;
    }).filter((item): item is RecordLocus => Boolean(item));
    const existing = variantDedup.get(dedupKey);
    if (existing) {
      existing.relationIds.push(relationIdValue);
      existing.evidence = uniqueLoci([...existing.evidence, ...evidence]);
      existing.evidenceCount = existing.evidence.length;
    } else {
      variantDedup.set(dedupKey, {
        key: dedupKey,
        relationIds: [relationIdValue],
        targetCharacterId,
        targetGlyph: glyph.display,
        targetFormalism: glyph.formalism,
        targetGlyphLink: glyph.link,
        typology,
        evidenceCount: uniqueLoci(evidence).length,
        evidence: uniqueLoci(evidence),
      });
    }
  }
  const graphicVariants = Array.from(variantDedup.values()).sort((a, b) => naturalCompare(a.targetGlyph, b.targetGlyph));

  const resolveComponent = (readingId: string) => {
    const reading = allReadings.get(readingId);
    const characterId = relationId(reading?.chinese_id);
    const character = allChinese.get(characterId);
    const rom = allRom.get(relationId(reading?.rom_id));
    return {
      id: readingId,
      characterId,
      glyph: displayGlyph(character).display,
      historical: text(rom?.rom),
      modern: text(rom?.modern_rom),
    };
  };

  const compounds: RecordCompound[] = raw.composites.map(row => {
    const firstId = relationId(row.first_syllable);
    const secondId = relationId(row.second_syllable);
    const selectedRoles: Array<'first' | 'second'> = [];
    if (readingIds.has(firstId)) selectedRoles.push('first');
    if (readingIds.has(secondId)) selectedRoles.push('second');
    const first = resolveComponent(firstId);
    const second = resolveComponent(secondId);
    const other = selectedRoles.length === 1 ? (selectedRoles[0] === 'first' ? second : first) : null;
    return { id: relationId(row.id), word: text(row.word), first, second, selectedRoles, other, experimental: true as const };
  }).sort((a, b) => naturalCompare(a.word, b.word));

  const lexicalAtOcc = new Map<string, RecordRelationAtLocus[]>();
  const relationById = new Map(lexicalRelations.map(row => [row.id, row]));
  for (const item of raw.lexicalEvidence) {
    const occId = relationId(item.occ_id);
    if (!occId || !occById.has(occId)) continue;
    const relation = relationById.get(relationId(item.chinese_rom_chinese_rom_id));
    const list = lexicalAtOcc.get(occId) ?? [];
    list.push({
      kind: 'lexical',
      label: relation?.typology || 'source synonym association',
      position: item.position == null || item.position === '' ? null : item.position,
      internal: item.internal == null || item.internal === '' ? null : bool(item.internal),
    });
    lexicalAtOcc.set(occId, list);
  }

  const graphicAtOcc = new Map<string, RecordRelationAtLocus[]>();
  const graphicRelationById = new Map<string, RecordGraphicVariant>();
  for (const variant of graphicVariants) for (const rid of variant.relationIds) graphicRelationById.set(rid, variant);
  for (const item of raw.graphicEvidence) {
    const occId = relationId(item.occ_id);
    if (!occId || !occById.has(occId)) continue;
    const variant = graphicRelationById.get(relationId(item.chinese_chinese_id));
    const list = graphicAtOcc.get(occId) ?? [];
    list.push({ kind: 'graphic', label: variant?.typology || 'graphic variant' });
    graphicAtOcc.set(occId, list);
  }

  const readingById = new Map(readings.map(row => [row.id, row]));
  const attestations: RecordAttestation[] = raw.occurrences.map(occ => {
    const readingId = relationId(occ.word);
    const reading = readingById.get(readingId);
    return {
      id: relationId(occ.id),
      readingId,
      historicalReading: reading?.historical || null,
      modernReading: reading?.modern || null,
      ...locusOfOcc(occ),
      typology: text(occ.typology),
      latinDefinitionHtml: text(occ.latin_definition_2),
      sourceRadical: text(occ.radical),
      historicalStrokes: occ.n_strokes == null || occ.n_strokes === '' ? null : occ.n_strokes,
      strokeBoundary: bool(occ.stroke),
      note: text(occ.note),
      relations: [...(lexicalAtOcc.get(relationId(occ.id)) ?? []), ...(graphicAtOcc.get(relationId(occ.id)) ?? [])],
    };
  }).sort((a, b) => naturalCompare(a.dictionaryLabel, b.dictionaryLabel) || naturalCompare(a.page, b.page) || naturalCompare(a.line, b.line) || naturalCompare(a.id, b.id));

  const sourceRadicalMap = new Map<string, RecordSourceRadical>();
  for (const att of attestations) {
    if (!att.sourceRadical) continue;
    const k = `${att.dictionaryId ?? ''}\u0000${att.sourceRadical}`;
    const current = sourceRadicalMap.get(k) ?? {
      dictionaryId: att.dictionaryId,
      dictionaryLabel: att.dictionaryLabel,
      radical: att.sourceRadical,
      occurrenceCount: 0,
    };
    current.occurrenceCount += 1;
    sourceRadicalMap.set(k, current);
  }
  const sourceRadicals = Array.from(sourceRadicalMap.values()).sort((a, b) => naturalCompare(a.dictionaryLabel, b.dictionaryLabel) || naturalCompare(a.radical, b.radical));
  const sourceStrokeValues = Array.from(new Set(attestations.map(row => row.historicalStrokes).filter((v): v is string | number => v != null && v !== ''))).sort(naturalCompare);

  const physicalLoci = uniqueLoci(attestations);
  const interpretedReadings = readings.filter(row => row.interpreted).length;

  const orderedNeighbors = [...raw.allCharactersForNeighbors].sort((a, b) => naturalCompare(a.id, b.id));
  const currentIndex = orderedNeighbors.findIndex(row => relationId(row.id) === id);
  const previousRow = currentIndex > 0 ? orderedNeighbors[currentIndex - 1] : null;
  const nextRow = currentIndex >= 0 && currentIndex < orderedNeighbors.length - 1 ? orderedNeighbors[currentIndex + 1] : null;
  const neighbor = (row: AnyRecord | null) => row ? ({ id: relationId(row.id), glyph: displayGlyph(row).display }) : null;

  return {
    generatedAt: new Date().toISOString(),
    warnings,
    character: {
      id,
      rawCharacter: characterGlyph.raw,
      displayCharacter: characterGlyph.display,
      simplified: characterGlyph.simplified,
      glyphLink: characterGlyph.link,
      formalism: characterGlyph.formalism,
      note: text(raw.character.note),
      notStandard: bool(raw.character.not_standard),
      modernStrokes: raw.character.strokes == null || raw.character.strokes === '' ? null : raw.character.strokes,
      strokesNotNumeric: text(raw.character.strokes_not_num),
      modernRadical: text(raw.character.semantic_radical),
      phoneticRadical: text(raw.character.phonetic_radical),
      dateUpdated: text(raw.character.date_updated) || text(raw.character.date_created),
    },
    sourceRadicals,
    sourceStrokeValues,
    readings,
    attestations,
    lexicalRelations,
    graphicVariants,
    compounds,
    neighbors: { previous: neighbor(previousRow), next: neighbor(nextRow) },
    stats: {
      readings: readings.length,
      attestations: attestations.length,
      loci: physicalLoci.length,
      lexicalRelations: lexicalRelations.length,
      graphicRelations: graphicVariants.length,
      compounds: compounds.length,
      interpretedReadings,
    },
  };
}

export const getStaticPaths: GetStaticPaths = async () => {
  const warnings: string[] = [];
  const rows = import.meta.env.DEV
    ? await readCollection('chinese', ['id'], null, warnings)
    : (await loadBuildCache()).chinese;
  return rows.map(row => ({ params: { id: relationId(row.id) } })).filter(item => item.params.id);
};

export const GET: APIRoute = async ({ params }) => {
  const id = String(params.id ?? '').trim();
  if (!id) return new Response(JSON.stringify({ error: 'Missing character id.' }), { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  try {
    const payload = await buildPayload(id);
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': import.meta.env.DEV ? 'no-store' : 'public, max-age=86400, immutable',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  }
};
