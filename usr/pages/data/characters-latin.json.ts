import type { APIRoute } from 'astro';
import { fetchFromDirectus } from '@core/utils/directus';
import type { CharactersLatinPayload, LatinDefinitionRecord } from '../../components/characters/types';

export const prerender = true;

type AnyRecord = Record<string, any>;
const PAGE_LIMIT = 2500;
let payloadPromise: Promise<CharactersLatinPayload> | null = null;

function relationId(value: any): string {
  if (value == null || value === '') return '';
  if (typeof value === 'object') return String(value.id ?? '');
  return String(value);
}

function text(value: any): string | null {
  if (value == null || value === '') return null;
  return String(value);
}

function aggregateCount(row: AnyRecord): number {
  const value = row?.countDistinct?.id ?? row?.countDistinct ?? row?.count?.id ?? row?.count ?? row?.__count ?? 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function requestRows(params: URLSearchParams): Promise<AnyRecord[]> {
  const rows = await fetchFromDirectus<AnyRecord[]>({ table: 'occ', queryString: params.toString() });
  if (!Array.isArray(rows)) throw new Error('Directus collection "occ" did not return an array.');
  return rows;
}

async function requestPaged(baseParams: URLSearchParams): Promise<AnyRecord[]> {
  const out: AnyRecord[] = [];
  let offset = 0;
  while (true) {
    const params = new URLSearchParams(baseParams);
    params.set('limit', String(PAGE_LIMIT));
    params.set('offset', String(offset));
    const rows = await requestRows(params);
    if (!rows.length) break;
    out.push(...rows);
    offset += rows.length;
    if (rows.length < PAGE_LIMIT) break;
  }
  return out;
}

async function buildPayload(): Promise<CharactersLatinPayload> {
  const warnings: string[] = [];
  let rows: AnyRecord[] = [];

  // Keep this dataset separate from the initial character index. The browser
  // fetches it only after a character/reading is explicitly selected.
  const aggregate = new URLSearchParams();
  aggregate.append('aggregate[countDistinct]', 'id');
  aggregate.append('groupBy[]', 'word');
  aggregate.append('groupBy[]', 'typology');
  aggregate.append('groupBy[]', 'latin_definition_2');
  aggregate.append('filter[latin_definition_2][_nnull]', 'true');

  try {
    rows = await requestPaged(aggregate);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`Latin-definition aggregate fallback used: ${message}`);
    const flat = new URLSearchParams();
    flat.set('fields', 'id,word,typology,latin_definition_2');
    flat.append('filter[latin_definition_2][_nnull]', 'true');
    flat.set('sort', 'id');
    rows = (await requestPaged(flat)).map(row => ({ ...row, __count: 1 }));
  }

  const dedup = new Map<string, LatinDefinitionRecord>();
  for (const row of rows) {
    const readingId = relationId(row.word);
    const html = text(row.latin_definition_2)?.trim() || '';
    if (!readingId || !html) continue;
    const typology = text(row.typology)?.trim() || null;
    const key = `${readingId}\u0000${typology ?? ''}\u0000${html}`;
    const current = dedup.get(key);
    const count = Math.max(1, aggregateCount(row) || Number(row.__count ?? 1) || 1);
    if (current) current.occurrenceCount += count;
    else dedup.set(key, { readingId, typology, html, occurrenceCount: count });
  }

  const data = Array.from(dedup.values()).sort((a, b) =>
    a.readingId.localeCompare(b.readingId, undefined, { numeric: true })
    || String(a.typology ?? '').localeCompare(String(b.typology ?? ''))
  );

  return { generatedAt: new Date().toISOString(), warnings, data };
}

async function getPayload(): Promise<CharactersLatinPayload> {
  if (!payloadPromise) payloadPromise = buildPayload();
  return payloadPromise;
}

export const GET: APIRoute = async () => {
  try {
    return new Response(JSON.stringify(await getPayload()), {
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
