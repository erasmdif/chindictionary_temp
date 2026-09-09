import type { APIRoute } from 'astro';
import { fetchFromDirectus } from '@core/utils/directus';

export const prerender = true;

type AnyRecord = Record<string, any>;

type Token = {
  id: number;
  form: string;
  raw: string;
  start: number;
  end: number;
  segment: number;
};

const PAGE_LIMIT = 2500;
const CLEANING_PREVIEW_LIMIT = 180;
const ROMANIZATION_MARK_RE = /[/\\^ˆ＾˘¨¯ˉ˙ˊˋˇ´`\-]/u;
const ANALYTIC_BOUNDARY_RE = /[§\n\r:;.!?]/u;
const TOKEN_CANDIDATE_RE = /[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*(?:[/\\^ˆ＾˘¨¯ˉ˙ˊˋˇ´`\-]+)?/gu;
const ISOLATED_MARK_RE = /[/\\^ˆ＾˘¨¯ˉ˙ˊˋˇ´`\-]/gu;

const HTML_ENTITY_MAP: Record<string, string> = {
  quot: '"', amp: '&', apos: "'", lt: '<', gt: '>', nbsp: ' ',
  iexcl: '¡', cent: '¢', pound: '£', curren: '¤', yen: '¥', brvbar: '¦', sect: '§',
  uml: '¨', copy: '©', ordf: 'ª', laquo: '«', not: '¬', shy: '\u00ad', reg: '®', macr: '¯',
  deg: '°', plusmn: '±', sup2: '²', sup3: '³', acute: '´', micro: 'µ', para: '¶', middot: '·',
  cedil: '¸', sup1: '¹', ordm: 'º', raquo: '»', frac14: '¼', frac12: '½', frac34: '¾', iquest: '¿',
  Agrave: 'À', Aacute: 'Á', Acirc: 'Â', Atilde: 'Ã', Auml: 'Ä', Aring: 'Å', AElig: 'Æ', Ccedil: 'Ç',
  Egrave: 'È', Eacute: 'É', Ecirc: 'Ê', Euml: 'Ë', Igrave: 'Ì', Iacute: 'Í', Icirc: 'Î', Iuml: 'Ï',
  ETH: 'Ð', Ntilde: 'Ñ', Ograve: 'Ò', Oacute: 'Ó', Ocirc: 'Ô', Otilde: 'Õ', Ouml: 'Ö', times: '×',
  Oslash: 'Ø', Ugrave: 'Ù', Uacute: 'Ú', Ucirc: 'Û', Uuml: 'Ü', Yacute: 'Ý', THORN: 'Þ', szlig: 'ß',
  agrave: 'à', aacute: 'á', acirc: 'â', atilde: 'ã', auml: 'ä', aring: 'å', aelig: 'æ', ccedil: 'ç',
  egrave: 'è', eacute: 'é', ecirc: 'ê', euml: 'ë', igrave: 'ì', iacute: 'í', icirc: 'î', iuml: 'ï',
  eth: 'ð', ntilde: 'ñ', ograve: 'ò', oacute: 'ó', ocirc: 'ô', otilde: 'õ', ouml: 'ö', divide: '÷',
  oslash: 'ø', ugrave: 'ù', uacute: 'ú', ucirc: 'û', uuml: 'ü', yacute: 'ý', thorn: 'þ', yuml: 'ÿ',
  OElig: 'Œ', oelig: 'œ', Scaron: 'Š', scaron: 'š', Yuml: 'Ÿ', fnof: 'ƒ', circ: 'ˆ', tilde: '˜',
  ensp: ' ', emsp: ' ', thinsp: ' ', zwnj: '', zwj: '', lrm: '', rlm: '', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', sbquo: '‚', ldquo: '“', rdquo: '”', bdquo: '„', dagger: '†', Dagger: '‡',
  bull: '•', hellip: '…', permil: '‰', prime: '′', Prime: '″', lsaquo: '‹', rsaquo: '›', euro: '€', trade: '™',
};

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

  // Two passes also handle harmless double encoding such as &amp;sect;.
  return decodeOnce(decodeOnce(input));
}

function htmlToText(value: unknown): string {
  if (value == null) return '';
  const withoutTags = String(value)
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(?:p|div|li|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ');

  return decodeHtmlEntities(withoutTags)
    .replace(/[\t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/ {2,}/g, ' ')
    .trim();
}

function normalizedTypology(value: unknown): string {
  return String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase();
}

function isBlankDefinition(value: unknown): boolean {
  const clean = htmlToText(value).normalize('NFKC').trim().toLocaleLowerCase();
  return !clean || clean === 'empty' || clean === 'null' || clean === 'nan';
}

function hasRomanizationMark(raw: string): boolean {
  return ROMANIZATION_MARK_RE.test(raw)
    || /\p{M}/u.test(raw.normalize('NFD'));
}

function makeContext(text: string, start: number, end: number): string {
  const left = Math.max(0, start - 34);
  const right = Math.min(text.length, end + 34);
  const prefix = left > 0 ? '…' : '';
  const suffix = right < text.length ? '…' : '';
  return `${prefix}${text.slice(left, right).replace(/\s+/g, ' ')}${suffix}`;
}

function tokenizeEntry(text: string, entryMeta: { id: string; page: number | null; line: string | null }, tokenStartId: number) {
  const tokens: Token[] = [];
  const exclusions: Array<{ entryId: string; page: number | null; line: string | null; raw: string; reason: string; context: string }> = [];
  let previousEnd = 0;
  let segment = 0;
  let segmentHasTokens = false;
  let tokenId = tokenStartId;
  const candidateSpans: Array<[number, number]> = [];

  TOKEN_CANDIDATE_RE.lastIndex = 0;
  for (const match of text.matchAll(TOKEN_CANDIDATE_RE)) {
    const raw = match[0];
    const start = match.index ?? 0;
    const end = start + raw.length;
    candidateSpans.push([start, end]);
    const gap = text.slice(previousEnd, start);

    if (ANALYTIC_BOUNDARY_RE.test(gap) && segmentHasTokens) {
      segment += 1;
      segmentHasTokens = false;
    }

    if (hasRomanizationMark(raw)) {
      exclusions.push({
        entryId: entryMeta.id,
        page: entryMeta.page,
        line: entryMeta.line,
        raw,
        reason: 'romanisation marker',
        context: makeContext(text, start, end),
      });
      if (segmentHasTokens) {
        segment += 1;
        segmentHasTokens = false;
      }
      previousEnd = end;
      continue;
    }

    const form = raw
      .normalize('NFC')
      .toLocaleLowerCase()
      .replace(/^['’]+|['’]+$/g, '');

    if (!form) {
      previousEnd = end;
      continue;
    }

    tokens.push({ id: tokenId++, form, raw, start, end, segment });
    segmentHasTokens = true;
    previousEnd = end;
  }

  ISOLATED_MARK_RE.lastIndex = 0;
  for (const marker of text.matchAll(ISOLATED_MARK_RE)) {
    const start = marker.index ?? 0;
    if (candidateSpans.some(([lo, hi]) => start >= lo && start < hi)) continue;
    exclusions.push({
      entryId: entryMeta.id,
      page: entryMeta.page,
      line: entryMeta.line,
      raw: marker[0],
      reason: 'isolated romanisation marker',
      context: makeContext(text, start, start + marker[0].length),
    });
  }

  const segmentCount = new Set(tokens.map(token => token.segment)).size;
  return { tokens, exclusions, nextTokenId: tokenId, segmentCount };
}

async function requestRows(params: URLSearchParams): Promise<AnyRecord[]> {
  const rows = await fetchFromDirectus<AnyRecord[]>({ table: 'occ', queryString: params.toString() });
  if (!Array.isArray(rows)) throw new Error('Directus collection "occ" did not return an array.');
  return rows;
}

async function readOccurrences(): Promise<AnyRecord[]> {
  const out: AnyRecord[] = [];
  let offset = 0;

  while (true) {
    const params = new URLSearchParams();
    params.set('fields', 'id,page,line,typology,latin_definition_2');
    params.set('sort', 'page,line,id');
    params.set('limit', String(PAGE_LIMIT));
    params.set('offset', String(offset));

    let rows: AnyRecord[];
    try {
      rows = await requestRows(params);
    } catch {
      const fallback = new URLSearchParams();
      fallback.set('sort', 'page,line,id');
      fallback.set('limit', String(PAGE_LIMIT));
      fallback.set('offset', String(offset));
      rows = await requestRows(fallback);
    }

    out.push(...rows);
    if (rows.length < PAGE_LIMIT) break;
    offset += rows.length;
  }

  return out;
}

async function buildPayload() {
  const occurrences = await readOccurrences();
  const entries: any[] = [];
  const cleaningPreview: any[] = [];
  const typologies = new Set<string>();
  const globalForms = new Set<string>();
  let acceptedTokens = 0;
  let segments = 0;
  let emptyEntries = 0;
  let excludedCandidates = 0;
  let nextTokenId = 1;
  let pageMin: number | null = null;
  let pageMax: number | null = null;

  for (const occ of occurrences) {
    const id = String(occ.id ?? '');
    if (!id) continue;
    const pageValue = Number(occ.page);
    const page = Number.isFinite(pageValue) ? Math.trunc(pageValue) : null;
    const line = occ.line == null || occ.line === '' ? null : String(occ.line);
    const typology = normalizedTypology(occ.typology) || 'unspecified';
    typologies.add(typology);

    if (page != null) {
      pageMin = pageMin == null ? page : Math.min(pageMin, page);
      pageMax = pageMax == null ? page : Math.max(pageMax, page);
    }

    if (isBlankDefinition(occ.latin_definition_2)) {
      emptyEntries += 1;
      entries.push({
        id,
        page,
        line,
        typology,
        text: '',
        tokens: [],
        segmentCount: 0,
        distinctForms: 0,
        repetition: null,
      });
      continue;
    }

    const text = htmlToText(occ.latin_definition_2);
    const parsed = tokenizeEntry(text, { id, page, line }, nextTokenId);
    nextTokenId = parsed.nextTokenId;
    excludedCandidates += parsed.exclusions.length;
    if (cleaningPreview.length < CLEANING_PREVIEW_LIMIT) {
      cleaningPreview.push(...parsed.exclusions.slice(0, CLEANING_PREVIEW_LIMIT - cleaningPreview.length));
    }

    const distinctForms = new Set(parsed.tokens.map(token => token.form));
    for (const form of distinctForms) globalForms.add(form);

    acceptedTokens += parsed.tokens.length;
    segments += parsed.segmentCount;
    const repetition = parsed.tokens.length > 0
      ? 1 - distinctForms.size / parsed.tokens.length
      : null;

    entries.push({
      id,
      page,
      line,
      typology,
      text,
      tokens: parsed.tokens,
      segmentCount: parsed.segmentCount,
      distinctForms: distinctForms.size,
      repetition,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    entries,
    typologies: [...typologies].sort((a, b) => a.localeCompare(b)),
    pageMin,
    pageMax,
    stats: {
      sourceEntries: occurrences.length,
      analysableEntries: entries.filter(entry => entry.tokens.length > 0).length,
      emptyEntries,
      acceptedTokens,
      distinctForms: globalForms.size,
      segments,
      excludedCandidates,
    },
    cleaningPreview: cleaningPreview.slice(0, CLEANING_PREVIEW_LIMIT),
  };
}

let payloadPromise: Promise<Awaited<ReturnType<typeof buildPayload>>> | null = null;

export const GET: APIRoute = async () => {
  payloadPromise ??= buildPayload();
  const payload = await payloadPromise;
  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
};
