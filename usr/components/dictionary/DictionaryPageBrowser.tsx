import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  DictionaryPageOccurrence,
  DictionaryPagePayload,
  GraphicVariant,
  SynonymRelation,
} from './pageTypes';
import './dictionary-page.css';

const PAGE_CACHE_LIMIT = 3;
const pageCache = new Map<number, DictionaryPagePayload>();

type LineGroup = {
  key: string;
  line: string | number | null;
  occurrences: DictionaryPageOccurrence[];
  special: boolean;
  specialReplacement: string | null;
};

type SynonymCandidate = { item: SynonymRelation; occurrence: DictionaryPageOccurrence };

type SynonymGroup = {
  position: string;
  candidates: SynonymCandidate[];
  representative: SynonymCandidate;
};

type Selection =
  | { kind: 'synonym'; group: SynonymGroup }
  | { kind: 'graphic'; item: GraphicVariant; occurrence: DictionaryPageOccurrence };

function text(value: unknown): string {
  return value == null ? '' : String(value);
}

function normalize(value: unknown): string {
  return text(value).normalize('NFKC').toLocaleLowerCase();
}

function stripHtml(value: string | null | undefined): string {
  return text(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function naturalCompare(a: unknown, b: unknown): number {
  return text(a).localeCompare(text(b), undefined, { numeric: true, sensitivity: 'base' });
}

function typologyRank(value: string | null): number {
  const v = normalize(value);
  if (v === 'principale') return 0;
  if (v === 'alternativa alla principale') return 1;
  if (v === 'variante') return 2;
  if (v === 'alternativa alla variante') return 3;
  return 9;
}

function specialDefinition(value: string | null): boolean {
  const clean = normalize(stripHtml(value)).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return clean === 'change radical' || clean === 'empty page';
}

function isPlaceholder(character: string | null): boolean {
  return Boolean(character?.includes('['));
}

function glyphLabel(character: string | null, simplified: string | null): string {
  return isPlaceholder(character) ? (simplified || character || '—') : (character || simplified || '—');
}

function glyphDisplay(
  character: string | null,
  simplified: string | null,
  glyphLink: string | null,
) {
  const placeholder = isPlaceholder(character);
  const label = glyphLabel(character, simplified);

  if (placeholder && glyphLink) {
    return (
      <a
        className="dsl-glyph-link"
        href={glyphLink}
        target="_blank"
        rel="noreferrer"
        title="Historical non-Unicode form: open external glyph reference"
        onClick={event => event.stopPropagation()}
      >
        {label}<sup>*</sup>
      </a>
    );
  }

  return <>{label}{placeholder ? <sup>*</sup> : null}</>;
}

function characterRecordUrl(characterId: string | number | null): string | null {
  if (characterId == null) return null;
  const base = import.meta.env.BASE_URL || '/';
  return `${base.replace(/\/?$/, '/')}characters/view?id=${encodeURIComponent(String(characterId))}`;
}

function recordGlyph(
  characterId: string | number | null,
  character: string | null,
  simplified: string | null,
  glyphLink: string | null,
) {
  const label = glyphLabel(character, simplified);
  const placeholder = isPlaceholder(character);
  const recordUrl = characterRecordUrl(characterId);

  return (
    <span className="dsl-record-glyph">
      {recordUrl ? (
        <a className="dsl-character-record-link" href={recordUrl} onClick={event => event.stopPropagation()} title="Open character record">
          {label}
        </a>
      ) : <span>{label}</span>}
      {placeholder ? (glyphLink ? (
        <a
          className="dsl-external-glyph-star"
          href={glyphLink}
          target="_blank"
          rel="noreferrer"
          onClick={event => event.stopPropagation()}
          title="Open external historical glyph reference"
        >*</a>
      ) : <sup>*</sup>) : null}
    </span>
  );
}

const CJK_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

function chineseStrokeNumber(value: string | number | null): string {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return text(value);
  if (n < 10) return CJK_DIGITS[n];
  if (n < 20) return `十${n % 10 ? CJK_DIGITS[n % 10] : ''}`;
  if (n < 100) return `${CJK_DIGITS[Math.floor(n / 10)]}十${n % 10 ? CJK_DIGITS[n % 10] : ''}`;
  return String(n);
}

function rememberPage(page: number, payload: DictionaryPagePayload) {
  if (pageCache.has(page)) pageCache.delete(page);
  pageCache.set(page, payload);
  while (pageCache.size > PAGE_CACHE_LIMIT) {
    const oldest = pageCache.keys().next().value as number | undefined;
    if (oldest == null) break;
    pageCache.delete(oldest);
  }
}

function dataUrl(page: number): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.replace(/\/?$/, '/')}data/dictionary/page/${page}.json`;
}

async function fetchPage(page: number, signal?: AbortSignal): Promise<DictionaryPagePayload> {
  const cached = pageCache.get(page);
  if (cached) {
    rememberPage(page, cached);
    return cached;
  }

  const response = await fetch(dataUrl(page), { signal, cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Dictionary page ${page} could not be loaded (HTTP ${response.status}).`);
  }
  const payload = await response.json() as DictionaryPagePayload;
  rememberPage(page, payload);
  return payload;
}

function pageFromLocation(): number {
  if (typeof window === 'undefined') return 1;
  const value = Number(new URLSearchParams(window.location.search).get('page') || '1');
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function groupOccurrences(rows: DictionaryPageOccurrence[]): LineGroup[] {
  const byLine = new Map<string, DictionaryPageOccurrence[]>();

  for (const row of rows) {
    const k = text(row.line);
    const group = byLine.get(k) ?? [];
    group.push(row);
    byLine.set(k, group);
  }

  const raw = Array.from(byLine.entries())
    .map(([key, occurrences]) => ({
      key,
      line: occurrences[0]?.line ?? null,
      occurrences: [...occurrences].sort((a, b) => {
        const role = typologyRank(a.typology) - typologyRank(b.typology);
        return role || naturalCompare(a.id, b.id);
      }),
      special: occurrences.length > 0 && occurrences.every(row => specialDefinition(row.latinDefinition)),
      specialReplacement: null as string | null,
    }))
    .sort((a, b) => naturalCompare(a.line, b.line));

  // Reconstruction rule supplied for editorial rows:
  // special lines remain empty, except when a later normal line exists on the
  // same page; then their Latin-definition cell displays the next entry's
  // historical radical value, when that field is actually available.
  for (let i = 0; i < raw.length; i += 1) {
    if (!raw[i].special) continue;
    const nextContent = raw.slice(i + 1).find(group => !group.special);
    if (!nextContent) continue;
    raw[i].specialReplacement = nextContent.occurrences
      .map(row => row.historicalRadical?.value || '')
      .find(Boolean) || null;
  }

  return raw;
}

function dedupeGraphicVariants(group: LineGroup): Array<{ item: GraphicVariant; occurrence: DictionaryPageOccurrence }> {
  const seen = new Set<string>();
  const out: Array<{ item: GraphicVariant; occurrence: DictionaryPageOccurrence }> = [];

  for (const occurrence of group.occurrences) {
    for (const item of occurrence.graphicVariants) {
      const k = [item.sourceCharacterId, item.relatedCharacterId, normalize(item.evidentialStatus)].join('|');
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ item, occurrence });
    }
  }
  return out;
}

function explicitSynonyms(group: LineGroup): SynonymCandidate[] {
  const out: SynonymCandidate[] = [];
  for (const occurrence of group.occurrences) {
    for (const item of occurrence.synonyms) {
      if (item.internal === false) continue;
      out.push({ item, occurrence });
    }
  }
  return out.sort((a, b) => {
    const pos = naturalCompare(a.item.position, b.item.position);
    if (pos) return pos;
    return naturalCompare(a.item.relationId, b.item.relationId);
  });
}

function synonymAssessmentRank(value: string | null): number {
  const v = normalize(value);
  if (v.includes('sinonimo corretto')) return 0;
  if (v.includes('sinonimi vaghi')) return 1;
  if (v.includes('no sinonimia')) return 3;
  return 2;
}

function groupSynonymsByPosition(group: LineGroup): SynonymGroup[] {
  const byPosition = new Map<string, SynonymCandidate[]>();
  for (const candidate of explicitSynonyms(group)) {
    const position = text(candidate.item.position);
    if (!['1', '2', '3', '4'].includes(position)) continue;
    const list = byPosition.get(position) ?? [];
    list.push(candidate);
    byPosition.set(position, list);
  }

  return Array.from(byPosition.entries()).map(([position, candidates]) => {
    const sorted = [...candidates].sort((a, b) => {
      const assessment = synonymAssessmentRank(a.item.assessment) - synonymAssessmentRank(b.item.assessment);
      if (assessment) return assessment;
      const reading = naturalCompare(a.item.relatedRomanization, b.item.relatedRomanization);
      if (reading) return reading;
      return naturalCompare(a.item.relationId, b.item.relationId);
    });
    return { position, candidates: sorted, representative: sorted[0] };
  }).sort((a, b) => naturalCompare(a.position, b.position));
}

function synonymCandidateSets(group: SynonymGroup) {
  const seen = new Set<string>();
  const candidates = group.candidates.filter(candidate => {
    const k = [candidate.item.relatedWordId, candidate.item.relatedRomanization, candidate.item.relatedEnglishDefinition].map(text).join('|');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const correct = candidates.filter(candidate => normalize(candidate.item.assessment).includes('sinonimo corretto'));
  const vague = candidates.filter(candidate => normalize(candidate.item.assessment).includes('sinonimi vaghi'));
  const allNegative = candidates.length > 0 && candidates.every(candidate => normalize(candidate.item.assessment).includes('no sinonimia'));

  if (correct.length) return { picks: correct, alternatives: candidates.filter(candidate => !correct.includes(candidate)) };
  if (vague.length) return { picks: vague, alternatives: candidates.filter(candidate => !vague.includes(candidate)) };
  if (allNegative) return { picks: candidates.slice(0, 1), alternatives: [] };
  return { picks: candidates.slice(0, 1), alternatives: candidates.slice(1) };
}

function positionClass(position: string): string {
  return `pos-${position}`;
}

function strokeMarker(group: LineGroup): string {
  const boundary = group.occurrences.find(row => row.strokeBoundary);
  return boundary ? chineseStrokeNumber(boundary.historicalStrokes) : '';
}

function isMainAlternative(row: DictionaryPageOccurrence): boolean {
  return normalize(row.typology) === 'alternativa alla principale';
}

function isVariantOccurrence(row: DictionaryPageOccurrence): boolean {
  return normalize(row.typology) === 'variante';
}

function isVariantAlternative(row: DictionaryPageOccurrence): boolean {
  return normalize(row.typology) === 'alternativa alla variante';
}

function englishTypologyLabel(value: string | null): string {
  const v = normalize(value);
  if (v === 'principale') return 'Main';
  if (v === 'alternativa alla principale') return 'Alternative to main';
  if (v === 'variante') return 'Variant';
  if (v === 'alternativa alla variante') return 'Alternative to variant';
  return value || 'Other';
}

function englishSynonymAssessment(value: string | null): string {
  const v = normalize(value);
  if (v.includes('sinonimo corretto')) return 'Confirmed synonym';
  if (v.includes('sinonimi vaghi')) return 'Vague synonymy';
  if (v.includes('no sinonimia')) return 'No synonymy';
  return value || 'Unassessed';
}

function visibleSynonymNote(value: string | null): string | null {
  if (!value) return null;
  const v = normalize(value).replace(/[.,;:!?]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (v.includes('il carattere era probabilmente associato a diversa romanizzazione')) return null;
  if (v.includes('probabilmente associato') && v.includes('diversa romanizzazione')) return null;
  return value;
}

function SlashBreakText({ value }: { value: string }) {
  const parts = text(value).split('/');
  return (
    <>
      {parts.map((part, index) => (
        <span className="dsl-slash-chunk" key={`${index}-${part}`}>
          {part}{index < parts.length - 1 ? <><span aria-hidden="true">/</span><wbr /></> : null}
        </span>
      ))}
    </>
  );
}

function groupSearchText(group: LineGroup): string {
  const values: unknown[] = [group.line];
  for (const row of group.occurrences) {
    values.push(
      row.character,
      row.simplified,
      row.romanization,
      row.modernRomanization,
      stripHtml(row.latinDefinition),
      row.englishDefinition,
      ...row.glosses.map(g => g.value),
      ...row.graphicVariants.flatMap(v => [v.relatedCharacter, v.relatedSimplified]),
      ...row.synonyms.flatMap(s => [s.relatedCharacter, s.relatedSimplified, s.relatedRomanization, s.assessment]),
    );
  }
  return normalize(values.filter(Boolean).join(' '));
}

function primaryOccurrence(group: LineGroup): DictionaryPageOccurrence | undefined {
  return group.occurrences.find(row => normalize(row.typology) === 'principale') ?? group.occurrences[0];
}

function uniqueValues(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function DefinitionHtml({ html }: { html: string | null }) {
  if (!html) return null;
  // latin_definition_2 is an editorial field and intentionally stores inline HTML.
  return <div className="dsl-latin-html" dangerouslySetInnerHTML={{ __html: html }} />;
}

function GlossText({ value }: { value: string }) {
  const raw = text(value);
  const marker = /\*{0,3}\s*(?:\((https?:\/\/[^)\s]+)\)|\[(https?:\/\/[^\]\s]+)\])/giu;
  const parts: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = marker.exec(raw)) !== null) {
    const before = raw.slice(cursor, match.index);
    const url = match[1] || match[2] || '';
    // The external reference belongs to the immediately preceding Han character.
    // We remove the URL syntax from the visible gloss and render that character as
    // a clickable character + asterisk. Any text after the closing bracket is kept.
    const characterMatch = before.match(/^(.*)(\p{Script=Han})(\s*)$/us);

    if (characterMatch && url) {
      if (characterMatch[1]) parts.push(characterMatch[1]);
      parts.push(
        <a
          className="dsl-gloss-ref"
          href={url}
          target="_blank"
          rel="noreferrer"
          title="Open external character reference"
          onClick={event => event.stopPropagation()}
          key={`gloss-ref-${key++}`}
        >
          {characterMatch[2]}<sup>*</sup>
        </a>,
      );
      if (characterMatch[3]) parts.push(characterMatch[3]);
    } else {
      // Malformed/unsupported marker: hide the URL itself but preserve preceding text.
      parts.push(before);
    }

    cursor = marker.lastIndex;
  }

  if (cursor === 0) return <>{raw}</>;
  if (cursor < raw.length) parts.push(raw.slice(cursor));
  return <>{parts}</>;
}

function statusClass(value: string | null | undefined): string {
  const normalized = normalize(value);
  if (normalized.includes('corretto')) return 'good';
  if (normalized.includes('vagh')) return 'vague';
  if (normalized.includes('no sinon')) return 'negative';
  return '';
}

export default function DictionaryPageBrowser() {
  const [requestedPage, setRequestedPage] = useState(1);
  const [payload, setPayload] = useState<DictionaryPagePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [historicalStrokesFilter, setHistoricalStrokesFilter] = useState('');
  const [modernStrokesFilter, setModernStrokesFilter] = useState('');
  const [typologyFilter, setTypologyFilter] = useState('');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [activeLine, setActiveLine] = useState<string>('');
  const [locationReady, setLocationReady] = useState(false);
  const deferredQuery = useDeferredValue(normalize(query.trim()));

  useEffect(() => {
    const initial = pageFromLocation();
    setRequestedPage(initial);
    setLocationReady(true);

    const onPopState = () => setRequestedPage(pageFromLocation());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (!locationReady) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchPage(requestedPage, controller.signal)
      .then(next => {
        setPayload(next);
        setLoading(false);
        setQuery('');
        setHistoricalStrokesFilter('');
        setModernStrokesFilter('');
        setTypologyFilter('');

        const groups = groupOccurrences(next.data);
        const firstContent = groups.find(group => !group.special) ?? groups[0];
        const requestedLine = new URLSearchParams(window.location.search).get('line');
        const requestedGroup = requestedLine == null
          ? undefined
          : groups.find(group => text(group.line) === requestedLine || group.key === requestedLine);
        const activeGroup = requestedGroup ?? firstContent;
        setActiveLine(activeGroup?.key ?? '');
        if (requestedGroup) {
          window.setTimeout(() => {
            document.getElementById(`dsl-line-${encodeURIComponent(requestedGroup.key)}`)
              ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 0);
        }

        const firstSynonymGroup = activeGroup
          ? groupSynonymsByPosition(activeGroup)[0]
          : groups.flatMap(group => groupSynonymsByPosition(group))[0];
        if (firstSynonymGroup) {
          setSelection({ kind: 'synonym', group: firstSynonymGroup });
        } else {
          const firstGraphic = groups
            .flatMap(group => dedupeGraphicVariants(group))
            .find(Boolean);
          setSelection(firstGraphic
            ? { kind: 'graphic', item: firstGraphic.item, occurrence: firstGraphic.occurrence }
            : null);
        }
      })
      .catch(err => {
        if (err?.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });

    return () => controller.abort();
  }, [requestedPage, locationReady]);

  const groups = useMemo(() => groupOccurrences(payload?.data ?? []), [payload]);
  const filterOptions = useMemo(() => {
    const data = payload?.data ?? [];
    return {
      historicalStrokes: uniqueValues(data.map(row => text(row.historicalStrokes) || null)).sort(naturalCompare),
      modernStrokes: uniqueValues(data.map(row => text(row.modernStrokes) || null)).sort(naturalCompare),
      typologies: uniqueValues(data.map(row => row.typology)).sort(naturalCompare),
    };
  }, [payload]);

  const visibleGroups = useMemo(() => {
    return groups.filter(group => {
      if (deferredQuery && !groupSearchText(group).includes(deferredQuery)) return false;
      if (historicalStrokesFilter && !group.occurrences.some(row => text(row.historicalStrokes) === historicalStrokesFilter)) return false;
      if (modernStrokesFilter && !group.occurrences.some(row => text(row.modernStrokes) === modernStrokesFilter)) return false;
      if (typologyFilter && !group.occurrences.some(row => text(row.typology) === typologyFilter)) return false;
      return true;
    });
  }, [groups, deferredQuery, historicalStrokesFilter, modernStrokesFilter, typologyFilter]);

  const pageMeta = useMemo(() => {
    const source = payload?.data ?? [];
    return {
      radicals: uniqueValues(source.map(row => row.historicalRadical?.value)),
      strokes: uniqueValues(source.map(row => text(row.historicalStrokes) || null)),
      branches: uniqueValues(source.map(row => row.earthlyBranch?.value)),
      strokeBoundary: source.some(row => row.strokeBoundary),
    };
  }, [payload]);

  function navigate(page: number) {
    const max = payload?.maxPage ?? Number.POSITIVE_INFINITY;
    const next = Math.max(1, Math.min(page, max));
    if (next === requestedPage) return;
    const url = new URL(window.location.href);
    if (next === 1) url.searchParams.delete('page');
    else url.searchParams.set('page', String(next));
    url.searchParams.delete('line');
    window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
    setRequestedPage(next);
  }

  function focusLine(lineKey: string) {
    setActiveLine(lineKey);
    const node = document.getElementById(`dsl-line-${encodeURIComponent(lineKey)}`);
    node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  const maxPage = payload?.maxPage ?? null;

  return (
    <div className="dsl-app">
      <div className="dsl-page-toolbar" aria-label="Dictionary page controls">
        <div className="dsl-page-tools">
          <span className="dsl-page-label">Page {requestedPage}</span>
          <button
            type="button"
            className="dsl-icon-button"
            onClick={() => navigate(requestedPage - 1)}
            disabled={requestedPage <= 1 || loading}
            aria-label="Previous dictionary page"
          >‹</button>
          <button
            type="button"
            className="dsl-icon-button"
            onClick={() => navigate(requestedPage + 1)}
            disabled={Boolean(maxPage && requestedPage >= maxPage) || loading}
            aria-label="Next dictionary page"
          >›</button>
          <label className="dsl-search">
            <span aria-hidden="true">⌕</span>
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search Chinese, Latin, reading…"
              aria-label="Search within current dictionary page"
            />
          </label>
        </div>
      </div>

      <div className="dsl-layout">
        <aside className="dsl-left">
          <section className="dsl-page-box">
            <small>PAGE</small>
            <strong>{requestedPage}</strong>
            <div className="dsl-page-nav">
              <button type="button" onClick={() => navigate(requestedPage - 1)} disabled={requestedPage <= 1 || loading}>‹</button>
              <span>│</span>
              <button type="button" onClick={() => navigate(requestedPage + 1)} disabled={Boolean(maxPage && requestedPage >= maxPage) || loading}>›</button>
            </div>
          </section>

          <div className="dsl-locus-list">
            {groups.map(group => {
              const primary = primaryOccurrence(group);
              return (
                <button
                  type="button"
                  className={`dsl-locus-link ${activeLine === group.key ? 'active' : ''} ${group.special ? 'special' : ''}`}
                  onClick={() => focusLine(group.key)}
                  key={group.key}
                >
                  <span>
                    <span className="dsl-locus-line">Line {text(group.line) || '—'}</span>
                    {!group.special && primary ? (
                      <span className="dsl-locus-word">
                        <span className="dsl-locus-glyph">{glyphDisplay(primary.character, primary.simplified, primary.glyphLink)}</span>
                        <em>{primary.romanization || ''}</em>
                      </span>
                    ) : <span className="dsl-locus-word dsl-empty-word">—</span>}
                  </span>
                  <span className="dsl-count">{group.occurrences.length}</span>
                </button>
              );
            })}
            {!loading && groups.length === 0 && <p className="dsl-empty-sidebar">No encoded lines on this page.</p>}
          </div>

          <section className="dsl-index-meta">
            <h3>HISTORICAL INDEX</h3>
            <dl>
              <div><dt>Radical</dt><dd>{pageMeta.radicals.join(', ') || '—'}</dd></div>
              <div><dt>Strokes</dt><dd>{pageMeta.strokes.join(', ') || '—'}</dd></div>
              <div><dt>Branch</dt><dd>{pageMeta.branches.join(', ') || '—'}</dd></div>
              <div><dt>Boundary</dt><dd>{pageMeta.strokeBoundary ? 'yes' : '—'}</dd></div>
            </dl>
            <p className="dsl-index-note">Historical indexing metadata remain distinct from the modern radical and stroke count.</p>
          </section>

          {filtersOpen ? (
            <section className="dsl-filter-panel">
              <label>Historical strokes
                <select value={historicalStrokesFilter} onChange={event => setHistoricalStrokesFilter(event.target.value)}>
                  <option value="">All</option>
                  {filterOptions.historicalStrokes.map(value => <option value={value} key={value}>{value}</option>)}
                </select>
              </label>
              <label>Modern strokes
                <select value={modernStrokesFilter} onChange={event => setModernStrokesFilter(event.target.value)}>
                  <option value="">All</option>
                  {filterOptions.modernStrokes.map(value => <option value={value} key={value}>{value}</option>)}
                </select>
              </label>
              <label>Occurrence role
                <select value={typologyFilter} onChange={event => setTypologyFilter(event.target.value)}>
                  <option value="">All</option>
                  {filterOptions.typologies.map(value => <option value={value} key={value}>{value}</option>)}
                </select>
              </label>
              <button type="button" className="dsl-filter-reset" onClick={() => {
                setHistoricalStrokesFilter('');
                setModernStrokesFilter('');
                setTypologyFilter('');
              }}>Clear filters</button>
            </section>
          ) : null}

          <div className="dsl-filter-toggle-wrap">
            <button type="button" className={`dsl-filter-toggle ${filtersOpen ? 'open' : ''}`} onClick={() => setFiltersOpen(value => !value)}>
              <span aria-hidden="true">☷</span> FILTERS
            </button>
          </div>
        </aside>

        <main className="dsl-folio" aria-busy={loading}>
          <div className="dsl-folio-head">
            <div aria-label="Stroke section" />
            <div>CHARACTER</div>
            <div>DEFINITION(S)</div>
            <div>GLOSSES</div>
            <div>GRAPHIC<br />VARIANTS</div>
            <div>SYNONYMS</div>
          </div>

          <div className="dsl-folio-body">
            {error && <div className="dsl-message dsl-error">{error}</div>}
            {!error && payload?.warnings?.length ? (
              <details className="dsl-warning">
                <summary>Some optional scholarly-apparatus data could not be loaded.</summary>
                <ul>{payload.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
              </details>
            ) : null}

            {!error && visibleGroups.map(group => {
              const primary = primaryOccurrence(group);
              const graphics = dedupeGraphicVariants(group);
              const synonymGroups = groupSynonymsByPosition(group);
              const glosses = uniqueValues(group.occurrences.flatMap(row => row.glosses.map(item => item.value)));
              const secondaryReadings = group.occurrences.filter(row => isMainAlternative(row) && Boolean(row.romanization));
              const variants = group.occurrences.filter(row => isVariantOccurrence(row));
              const hiddenDefinitionIds = new Set(
                group.occurrences
                  .filter(row => isMainAlternative(row) || isVariantAlternative(row))
                  .map(row => String(row.id)),
              );
              const extraDefinitions = group.occurrences.filter(row => {
                if (primary && String(row.id) === String(primary.id)) return false;
                if (hiddenDefinitionIds.has(String(row.id))) return false;
                if (isVariantOccurrence(row)) return false;
                return Boolean(row.latinDefinition);
              });
              const hasVariantDefinition = variants.some(row => Boolean(row.latinDefinition));

              return (
                <article
                  id={`dsl-line-${encodeURIComponent(group.key)}`}
                  className={`dsl-entry ${group.special ? 'dsl-special-entry' : ''}`}
                  key={group.key}
                  onClick={() => setActiveLine(group.key)}
                >
                  <div className="dsl-cell dsl-stroke-cell" title={strokeMarker(group) ? `Stroke-section boundary: ${text(group.occurrences.find(row => row.strokeBoundary)?.historicalStrokes)}` : undefined}>
                    {strokeMarker(group)}
                  </div>

                  {group.special ? (
                    <>
                      <div className="dsl-cell" />
                      <div className="dsl-cell dsl-special-definition">{group.specialReplacement || ''}</div>
                      <div className="dsl-cell" />
                      <div className="dsl-cell" />
                      <div className="dsl-cell" />
                    </>
                  ) : (
                    <>
                      <div className="dsl-cell dsl-lexeme">
                        {primary ? (
                          <>
                            <span className="dsl-main-char">
                              {recordGlyph(primary.characterId, primary.character, primary.simplified, primary.glyphLink)}
                            </span>
                            <div className="dsl-reading-stack">
                              <em className="dsl-main-reading">{primary.romanization || '—'}</em>
                              {secondaryReadings.map(occurrence => (
                                <div className="dsl-secondary-reading" key={String(occurrence.id)}>
                                  <span aria-hidden="true" />
                                  <em>{occurrence.romanization}</em>
                                </div>
                              ))}
                            </div>
                          </>
                        ) : null}
                      </div>

                      <div className="dsl-cell dsl-definition">
                        {primary?.latinDefinition ? (
                          <div className={`dsl-main-definition ${hasVariantDefinition ? 'with-variants' : ''}`}>
                            {hasVariantDefinition ? <span className="dsl-definition-label">Main definition</span> : null}
                            <DefinitionHtml html={primary.latinDefinition} />
                          </div>
                        ) : null}

                        {variants.map(occurrence => occurrence.latinDefinition ? (
                          <div className="dsl-def-block dsl-variant-definition" key={String(occurrence.id)}>
                            <div className="dsl-def-type">
                              <span>(Variant)</span>
                              {occurrence.romanization ? <b>{occurrence.romanization}</b> : null}
                            </div>
                            <div className="dsl-def-copy"><DefinitionHtml html={occurrence.latinDefinition} /></div>
                          </div>
                        ) : null)}

                        {extraDefinitions.map(occurrence => (
                          <div className="dsl-def-block" key={String(occurrence.id)}>
                            <div className="dsl-def-type">
                              <span>({englishTypologyLabel(occurrence.typology)})</span>
                              {occurrence.romanization ? <b>{occurrence.romanization}</b> : null}
                            </div>
                            <div className="dsl-def-copy"><DefinitionHtml html={occurrence.latinDefinition} /></div>
                          </div>
                        ))}
                      </div>

                      <div className="dsl-cell dsl-gloss">
                        {glosses.length ? glosses.map(value => <span key={value}><GlossText value={value} /></span>) : <span className="dsl-muted">—</span>}
                      </div>

                      <div className="dsl-cell dsl-graphic">
                        {graphics.length ? graphics.map(({ item, occurrence }) => (
                          <div className="dsl-graphic-item" key={`${item.relationId}-${item.relatedCharacterId}`}>
                            <button
                              type="button"
                              className={`dsl-glyph-tile ${selection?.kind === 'graphic' && String(selection.item.relationId) === String(item.relationId) ? 'selected' : ''}`}
                              onClick={event => {
                                event.stopPropagation();
                                setSelection({ kind: 'graphic', item, occurrence });
                                setActiveLine(group.key);
                              }}
                              title={item.evidentialStatus || 'Inspect graphic relation'}
                            >
                              {glyphLabel(item.relatedCharacter, item.relatedSimplified)}{isPlaceholder(item.relatedCharacter) ? <sup>*</sup> : null}
                            </button>
                            {item.relatedCharacterId != null ? (
                              <a className="dsl-record-mini-link" href={characterRecordUrl(item.relatedCharacterId) || '#'} onClick={event => event.stopPropagation()} title="Open character record">record ↗</a>
                            ) : null}
                            {isPlaceholder(item.relatedCharacter) && item.relatedGlyphLink ? (
                              <a className="dsl-record-mini-link external" href={item.relatedGlyphLink} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()} title="Open external historical glyph reference">glyph *</a>
                            ) : null}
                          </div>
                        )) : <span className="dsl-muted">—</span>}
                      </div>

                      <div className="dsl-cell dsl-synonyms">
                        {synonymGroups.length ? synonymGroups.map(synonymGroup => {
                          const { representative } = synonymGroup;
                          const selected = selection?.kind === 'synonym' && selection.group.position === synonymGroup.position
                            && String(selection.group.representative.item.relatedCharacterId) === String(representative.item.relatedCharacterId);
                          return (
                            <button
                              type="button"
                              className={`dsl-syn ${positionClass(synonymGroup.position)} ${selected ? 'selected' : ''}`}
                              key={`pos-${synonymGroup.position}`}
                              onClick={event => {
                                event.stopPropagation();
                                setSelection({ kind: 'synonym', group: synonymGroup });
                                setActiveLine(group.key);
                              }}
                              aria-label={`Synonym position ${synonymGroup.position}: ${glyphLabel(representative.item.relatedCharacter, representative.item.relatedSimplified)}`}
                            >
                              <span className="dsl-syn-word">
                                {glyphLabel(representative.item.relatedCharacter, representative.item.relatedSimplified)}
                                {isPlaceholder(representative.item.relatedCharacter) ? <sup>*</sup> : null}
                              </span>
                            </button>
                          );
                        }) : <span className="dsl-muted dsl-no-relations">—</span>}
                      </div>
                    </>
                  )}
                </article>
              );
            })}

            {!loading && !error && visibleGroups.length === 0 && (
              <div className="dsl-message">No matching lines on page {requestedPage}.</div>
            )}

            {loading && <div className="dsl-loading"><span /> Loading page {requestedPage}…</div>}
          </div>

          <footer className="dsl-folio-foot">
            <span>{payload ? `${payload.count} occurrences · ${payload.lineCount} printed lines` : 'Dictionary page'}</span>
            <span>page-by-page Directus reconstruction</span>
          </footer>
        </main>

        <aside className="dsl-inspector-shell">
          <div className="dsl-inspector-title">SCHOLARLY INSPECTOR</div>
          <div className="dsl-inspector">
            {!selection ? (
              <div className="dsl-inspector-empty">
                <span className="dsl-rosette-large">✺</span>
                <p>Select a graphic variant or synonym to inspect its documentary relation.</p>
              </div>
            ) : selection.kind === 'synonym' ? (
              <SynonymInspector selection={selection} />
            ) : (
              <GraphicInspector selection={selection} />
            )}

            <div className="dsl-inspector-nav">
              <button type="button" onClick={() => navigate(requestedPage - 1)} disabled={requestedPage <= 1 || loading} aria-label="Previous page">‹</button>
              <button type="button" className="active" onClick={() => setSelection(null)} aria-label="Clear relation selection">⌘</button>
              <button type="button" onClick={() => navigate(requestedPage + 1)} disabled={Boolean(maxPage && requestedPage >= maxPage) || loading} aria-label="Next page">›</button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function SynonymInspector({ selection }: { selection: Extract<Selection, { kind: 'synonym' }> }) {
  const { group } = selection;
  const { representative } = group;
  const { item, occurrence } = representative;
  const { picks, alternatives } = synonymCandidateSets(group);
  const relationLabel = `Synonym position ${group.position}`;

  const candidateCard = (candidate: SynonymCandidate, index: number, preferred: boolean) => {
    const candidateItem = candidate.item;
    return (
      <article className={`dsl-syn-candidate ${preferred ? 'preferred' : ''}`} key={`${candidateItem.relatedWordId}-${candidateItem.relationId}-${index}`}>
        <div className="dsl-syn-candidate-head">
          <strong>{candidateItem.relatedRomanization || 'Reading not recorded'}</strong>
          {candidateItem.assessment ? <span className={`dsl-status ${statusClass(candidateItem.assessment)}`}>{englishSynonymAssessment(candidateItem.assessment)}</span> : null}
        </div>
        <p>{candidateItem.relatedEnglishDefinition
          ? <SlashBreakText value={candidateItem.relatedEnglishDefinition} />
          : 'No English definition recorded for this character–reading pair.'}</p>
        {visibleSynonymNote(candidateItem.note) ? <small>{visibleSynonymNote(candidateItem.note)}</small> : null}
      </article>
    );
  };

  return (
    <>
      <span className="dsl-selected-label">SELECTED SYNONYM</span>
      <span className="dsl-selected-source">Line {text(occurrence.line) || '—'} · {relationLabel}</span>
      <div className="dsl-selected-glyph">
        <strong>{recordGlyph(item.relatedCharacterId, item.relatedCharacter, item.relatedSimplified, item.relatedGlyphLink)}</strong>
        <div className="dsl-selected-pair">
          <span>{item.sourceCharacter || '—'} → {item.relatedCharacter || item.relatedSimplified || '—'}</span>
          <a className="dsl-open-record-button" href={characterRecordUrl(item.relatedCharacterId) || '#'}>Open character record ↗</a>
        </div>
      </div>

      <section className="dsl-inspector-section dsl-syn-pick-section">
        <h4>SPECIALIST PICK</h4>
        {picks.map((candidate, index) => candidateCard(candidate, index, true))}
      </section>

      {alternatives.length ? (
        <section className="dsl-inspector-section">
          <h4>OTHER RECORDED READINGS</h4>
          <p className="dsl-sidebar-explainer">Other character–reading combinations encoded for the same manuscript synonym slot.</p>
          {alternatives.map((candidate, index) => candidateCard(candidate, index, false))}
        </section>
      ) : null}

      <dl className="dsl-inspect-list">
        <div><dt>position</dt><dd>{group.position} / 4</dd></div>
        <div><dt>candidates</dt><dd>{group.candidates.length}</dd></div>
      </dl>

      <section className="dsl-inspector-section">
        <h4>DOCUMENTARY CONTEXT</h4>
        <p>Line {text(occurrence.line) || '—'} ({englishTypologyLabel(occurrence.typology)})</p>
        <DefinitionHtml html={occurrence.latinDefinition} />
      </section>
    </>
  );
}

function GraphicInspector({ selection }: { selection: Extract<Selection, { kind: 'graphic' }> }) {
  const { item, occurrence } = selection;

  return (
    <>
      <span className="dsl-selected-label">SELECTED RELATION</span>
      <span className="dsl-selected-source">Line {text(occurrence.line) || '—'} · graphic variant</span>
      <div className="dsl-selected-glyph">
        <strong>{recordGlyph(item.relatedCharacterId, item.relatedCharacter, item.relatedSimplified, item.relatedGlyphLink)}</strong>
        <div className="dsl-selected-pair"><span>{item.sourceCharacter || '—'} → {item.relatedCharacter || item.relatedSimplified || '—'}</span>{item.relatedCharacterId != null ? <a className="dsl-open-record-button" href={characterRecordUrl(item.relatedCharacterId) || '#'}>Open character record ↗</a> : null}</div>
      </div>

      {item.evidentialStatus ? <span className="dsl-status">{item.evidentialStatus}</span> : null}

      <dl className="dsl-inspect-list">
        <div><dt>source</dt><dd>{item.sourceCharacter || occurrence.character || '—'}</dd></div>
        <div><dt>related</dt><dd>{item.relatedCharacter || item.relatedSimplified || '—'}</dd></div>
      </dl>

      <section className="dsl-inspector-section">
        <h4>DOCUMENTARY CONTEXT</h4>
        <p>Line {text(occurrence.line) || '—'} ({englishTypologyLabel(occurrence.typology)})</p>
        <DefinitionHtml html={occurrence.latinDefinition} />
      </section>
    </>
  );
}
