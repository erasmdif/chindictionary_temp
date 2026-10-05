import type { APIRoute } from 'astro';
import { fetchFromDirectus } from '@core/utils/directus';

export const prerender = true;

type AnyRecord = Record<string, any>;

const PAGE_LIMIT = 2500;
const OPTIONAL_COLLECTIONS = [
  'occ_chinese_chinese',
  'chinese_chinese',
  'occ_chinese_rom_chinese_rom',
  'chinese_rom_chinese_rom',
  'composite_words',
] as const;

const HTML_ENTITY_MAP: Record<string, string> = {
  quot: '"', amp: '&', apos: "'", lt: '<', gt: '>', nbsp: ' ', sect: '§', uml: '¨', macr: '¯', acute: '´', cedil: '¸',
  Agrave: 'À', Aacute: 'Á', Acirc: 'Â', Atilde: 'Ã', Auml: 'Ä', Aring: 'Å', AElig: 'Æ', Ccedil: 'Ç',
  Egrave: 'È', Eacute: 'É', Ecirc: 'Ê', Euml: 'Ë', Igrave: 'Ì', Iacute: 'Í', Icirc: 'Î', Iuml: 'Ï',
  Ntilde: 'Ñ', Ograve: 'Ò', Oacute: 'Ó', Ocirc: 'Ô', Otilde: 'Õ', Ouml: 'Ö', Oslash: 'Ø',
  Ugrave: 'Ù', Uacute: 'Ú', Ucirc: 'Û', Uuml: 'Ü', Yacute: 'Ý',
  agrave: 'à', aacute: 'á', acirc: 'â', atilde: 'ã', auml: 'ä', aring: 'å', aelig: 'æ', ccedil: 'ç',
  egrave: 'è', eacute: 'é', ecirc: 'ê', euml: 'ë', igrave: 'ì', iacute: 'í', icirc: 'î', iuml: 'ï',
  ntilde: 'ñ', ograve: 'ò', oacute: 'ó', ocirc: 'ô', otilde: 'õ', ouml: 'ö', oslash: 'ø',
  ugrave: 'ù', uacute: 'ú', ucirc: 'û', uuml: 'ü', yacute: 'ý', yuml: 'ÿ',
  OElig: 'Œ', oelig: 'œ', Scaron: 'Š', scaron: 'š', Yuml: 'Ÿ', circ: 'ˆ', tilde: '˜',
  ensp: ' ', emsp: ' ', thinsp: ' ', zwnj: '', zwj: '', lrm: '', rlm: '', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', sbquo: '‚', ldquo: '“', rdquo: '”', bdquo: '„', hellip: '…', middot: '·',
};

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

function primitiveDisplay(value: any): string {
  if (value == null || value === '') return '';
  if (Array.isArray(value)) return value.map(primitiveDisplay).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    const preferred = value.car ?? value.character ?? value.name ?? value.label ?? value.value ?? value.id;
    return preferred == null ? '' : String(preferred);
  }
  return String(value);
}

function decodeHtmlEntities(input: string): string {
  const decodeOnce = (value: string) => value.replace(
    /&(#(?:x[0-9a-f]+|\d+)|[a-z][a-z0-9]+);/gi,
    (full, entity: string) => {
      if (entity[0] === '#') {
        const hex = entity[1]?.toLowerCase() === 'x';
        const rawNumber = entity.slice(hex ? 2 : 1);
        const codePoint = Number.parseInt(rawNumber, hex ? 16 : 10);
        if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return ' ';
        try { return String.fromCodePoint(codePoint); } catch { return ' '; }
      }
      return HTML_ENTITY_MAP[entity] ?? HTML_ENTITY_MAP[entity.toLowerCase()] ?? ' ';
    },
  );
  return decodeOnce(decodeOnce(input));
}

function htmlToPlainText(value: any): string | null {
  if (value == null || value === '') return null;
  const withoutTags = String(value)
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(?:p|div|li|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ');
  const clean = decodeHtmlEntities(withoutTags)
    .replace(/[\t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/ {2,}/g, ' ')
    .trim();
  return clean || null;
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

async function readCollection(table: string): Promise<AnyRecord[]> {
  const params = new URLSearchParams();
  params.set('sort', 'id');
  return requestPaged(table, params);
}

async function readOptionalCollection(table: string): Promise<AnyRecord[]> {
  try { return await readCollection(table); } catch { return []; }
}

function indexBy(rows: AnyRecord[], field: string): Map<string, AnyRecord[]> {
  const map = new Map<string, AnyRecord[]>();
  for (const row of rows) {
    const id = relationId(row[field]);
    if (!id) continue;
    const list = map.get(id) ?? [];
    list.push(row);
    map.set(id, list);
  }
  return map;
}

function currentAndOtherId(currentId: string, left: any, right: any): { sourceId: string; relatedId: string } {
  const leftId = relationId(left);
  const rightId = relationId(right);
  if (currentId && leftId === currentId) return { sourceId: leftId, relatedId: rightId };
  if (currentId && rightId === currentId) return { sourceId: rightId, relatedId: leftId };
  return { sourceId: leftId, relatedId: rightId };
}

function normalizedTypology(value: any): string {
  return String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase();
}

function firstMatchingValue(row: AnyRecord, matcher: RegExp): string | null {
  for (const [field, value] of Object.entries(row)) {
    if (!matcher.test(field) || value == null || value === '') continue;
    const display = primitiveDisplay(value);
    if (display) return display;
  }
  return null;
}

function allMatchingValues(row: AnyRecord, matcher: RegExp): Array<{ field: string; value: string }> {
  return Object.entries(row)
    .filter(([field, value]) => matcher.test(field) && value != null && value !== '')
    .map(([field, value]) => ({ field, value: primitiveDisplay(value) }))
    .filter(item => item.value !== '');
}

function wordTerm(
  wordIdValue: any,
  words: Map<string, AnyRecord>,
  characters: Map<string, AnyRecord>,
  romanisations: Map<string, AnyRecord>,
) {
  const wordId = relationId(wordIdValue);
  const word = words.get(wordId);
  const characterId = relationId(word?.chinese_id);
  const character = characters.get(characterId);
  const romId = relationId(word?.rom_id);
  const rom = romanisations.get(romId);
  return {
    wordId,
    characterId,
    character: text(character?.car),
    simplified: text(character?.simplified_chinese),
    glyphLink: text(character?.link_nuovo) || text(character?.link),
    romanisation: text(rom?.rom),
    modernRomanisation: text(rom?.modern_rom),
    simpleRomanisation: text(rom?.simple_romanization),
    englishDefinition: text(word?.english_definition),
    modernStrokes: character?.strokes ?? null,
    semanticRadical: text(character?.semantic_radical),
    phoneticRadical: text(character?.phonetic_radical),
  };
}

function compositeOccurrenceId(row: AnyRecord): string {
  return relationId(row.occ_id || row.occ);
}

function compositeRelationId(row: AnyRecord): string {
  return relationId(row.composite_word_id || row.composite_words_id || row.composite_word || row.composite_words);
}

async function buildPayload() {
  const [occurrences, wordsRows, charactersRows, romanisationRows, ...optional] = await Promise.all([
    readCollection('occ'),
    readCollection('chinese_rom'),
    readCollection('chinese'),
    readCollection('rom'),
    ...OPTIONAL_COLLECTIONS.map(collection => readOptionalCollection(collection)),
  ]);

  const [graphicEvidence, graphicRelations, lexicalEvidence, lexicalRelations, compositeRows] = optional;

  let compositeEvidence: AnyRecord[] = [];
  for (const table of ['occ_composite_word', 'occ_composite_words']) {
    const rows = await readOptionalCollection(table);
    if (rows.length) { compositeEvidence = rows; break; }
  }

  const words = new Map(wordsRows.map(row => [relationId(row.id), row] as const));
  const characters = new Map(charactersRows.map(row => [relationId(row.id), row] as const));
  const romanisations = new Map(romanisationRows.map(row => [relationId(row.id), row] as const));
  const graphicRelationById = new Map(graphicRelations.map(row => [relationId(row.id), row] as const));
  const lexicalRelationById = new Map(lexicalRelations.map(row => [relationId(row.id), row] as const));
  const compositeById = new Map(compositeRows.map(row => [relationId(row.id), row] as const));

  const graphicByOcc = indexBy(graphicEvidence, 'occ_id');
  const lexicalByOcc = indexBy(lexicalEvidence, 'occ_id');
  const compositeByOcc = new Map<string, AnyRecord[]>();
  for (const row of compositeEvidence) {
    const occId = compositeOccurrenceId(row);
    if (!occId) continue;
    const list = compositeByOcc.get(occId) ?? [];
    list.push(row);
    compositeByOcc.set(occId, list);
  }

  const records = occurrences.map(occ => {
    const occurrenceId = relationId(occ.id);
    const typology = normalizedTypology(occ.typology);
    const base = wordTerm(occ.word, words, characters, romanisations);

    const graphicVariants = (graphicByOcc.get(occurrenceId) ?? []).flatMap(junction => {
      const relation = graphicRelationById.get(relationId(junction.chinese_chinese_id));
      if (!relation) return [];
      const pair = currentAndOtherId(base.characterId, relation.chinese_id, relation.related_chinese_id);
      const related = characters.get(pair.relatedId);
      return [{
        character: text(related?.car),
        simplified: text(related?.simplified_chinese),
        status: text(relation.typology),
        glyphLink: text(related?.link_nuovo) || text(related?.link),
      }];
    });

    const lexicalJunctions = lexicalByOcc.get(occurrenceId) ?? [];
    const synonyms = typology === 'antinomy' ? [] : lexicalJunctions.flatMap(junction => {
      const relation = lexicalRelationById.get(relationId(junction.chinese_rom_chinese_rom_id));
      if (!relation) return [];
      const pair = currentAndOtherId(base.wordId, relation.chinese_rom_id, relation.related_chinese_rom_id);
      const term = wordTerm(pair.relatedId, words, characters, romanisations);
      return [{
        character: term.character,
        simplified: term.simplified,
        glyphLink: term.glyphLink,
        romanisation: term.romanisation,
        assessment: text(relation.typology),
        note: text(junction.note),
        position: junction.position ?? null,
        internal: junction.internal == null ? null : Boolean(junction.internal),
      }];
    });

    const antonyms = typology !== 'antinomy' ? [] : lexicalJunctions.flatMap(junction => {
      const relation = lexicalRelationById.get(relationId(junction.chinese_rom_chinese_rom_id));
      if (!relation) return [];
      const left = wordTerm(relation.chinese_rom_id, words, characters, romanisations);
      const right = wordTerm(relation.related_chinese_rom_id, words, characters, romanisations);
      return [{
        leftCharacter: left.character || left.simplified,
        leftRomanisation: left.romanisation,
        rightCharacter: right.character || right.simplified,
        rightRomanisation: right.romanisation,
      }];
    });

    const compounds = (compositeByOcc.get(occurrenceId) ?? []).flatMap(junction => {
      const relation = compositeById.get(compositeRelationId(junction));
      if (!relation) return [];
      const first = wordTerm(relation.first_syllable, words, characters, romanisations);
      const second = wordTerm(relation.second_syllable, words, characters, romanisations);
      return [{
        firstCharacter: first.character || first.simplified,
        firstRomanisation: first.romanisation,
        secondCharacter: second.character || second.simplified,
        secondRomanisation: second.romanisation,
      }];
    });

    return {
      occurrenceId: occ.id,
      page: occ.page ?? null,
      line: occ.line ?? null,
      typology: text(occ.typology),
      character: base.character,
      simplified: base.simplified,
      glyphLink: base.glyphLink,
      romanisation: base.romanisation,
      modernRomanisation: base.modernRomanisation,
      simpleRomanisation: base.simpleRomanisation,
      englishDefinition: base.englishDefinition,
      latinDefinition: htmlToPlainText(occ.latin_definition_2),
      note: htmlToPlainText(occ.note) || text(occ.note),
      historicalRadical: firstMatchingValue(occ, /radical/i),
      historicalStrokes: occ.n_strokes ?? null,
      modernStrokes: base.modernStrokes,
      semanticRadical: base.semanticRadical,
      phoneticRadical: base.phoneticRadical,
      glosses: allMatchingValues(occ, /gloss/i).map(item => ({ field: item.field, value: htmlToPlainText(item.value) || item.value })),
      graphicVariants,
      synonyms,
      antonyms,
      compounds,
    };
  }).sort((a, b) => {
    const page = Number(a.page ?? 0) - Number(b.page ?? 0);
    if (page) return page;
    const line = String(a.line ?? '').localeCompare(String(b.line ?? ''), undefined, { numeric: true, sensitivity: 'base' });
    if (line) return line;
    return String(a.occurrenceId).localeCompare(String(b.occurrenceId), undefined, { numeric: true, sensitivity: 'base' });
  });

  return { generatedAt: new Date().toISOString(), count: records.length, records };
}

let payloadPromise: Promise<Awaited<ReturnType<typeof buildPayload>>> | null = null;

export const GET: APIRoute = async () => {
  payloadPromise ??= buildPayload();
  return new Response(JSON.stringify(await payloadPromise), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
};
