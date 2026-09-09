import React, { useEffect, useMemo, useState } from 'react';
import { withBase } from '../chind/paths';
import type { FormStat, LatinCorpusPayload, LatinEntry, WordGroup } from './types';

const APPENDIX_TYPES = new Set(['antinomy', 'composti', 'particulae numerales']);

// Technical/editorial artefacts: always excluded from every analytical view.
const FIXED_ANALYSIS_EXCLUSIONS = new Set(['sect', 'macr', 'ccedil', 'v', 't', 'change', 'radical']);

// Conservative default list of Latin function words. These forms are excluded
// from the analytical corpus by default, but the user can restore them with
// the "Include function words" switch. No stemming or lemmatisation is used.
const LATIN_FUNCTION_WORDS = new Set([
  // conjunctions / connective particles
  'ac', 'at', 'atque', 'aut', 'autem', 'donec', 'dum', 'enim', 'ergo', 'etenim', 'et', 'igitur', 'itaque',
  'licet', 'nam', 'namque', 'nec', 'neque', 'neve', 'nisi', 'postquam', 'priusquam', 'quamquam', 'quamvis',
  'quia', 'quoniam', 'quoad', 'sed', 'seu', 'si', 'sin', 'sive', 'tamquam', 'ubi', 'ut', 'uti', 'vel', 'velut',
  'verum', 'vero',
  // prepositions and closely related function words
  'a', 'ab', 'abs', 'ad', 'ante', 'apud', 'circa', 'circum', 'cis', 'citra', 'contra', 'cum', 'de', 'e', 'ex',
  'extra', 'in', 'infra', 'inter', 'intra', 'iuxta', 'ob', 'per', 'post', 'praeter', 'pro', 'propter', 'sine',
  'sub', 'super', 'supra', 'trans', 'ultra',
  // relative / interrogative forms
  'qui', 'quae', 'quod', 'cuius', 'cui', 'quem', 'quam', 'quo', 'qua', 'quibus', 'quos', 'quas',
  'quis', 'quid',
  // frequent grammatical particles/pronominal forms already treated as display stopwords
  'an', 'etiam', 'non', 'ne', 'num', 'quoque', 'quidem', 'se', 'sui', 'sibi', 'est', 'sunt',
]);
const PAGE_BIN = 50;
const RANKING_PAGE_SIZE = 10;
const CONCORDANCE_PAGE_SIZE = 10;
const COMPARE_PAGE_SIZE = 10;
const NEARBY_PAGE_SIZE = 10;
const NGRAM_PAGE_SIZE = 10;

const noteLibrary = {
  frequency: {
    eyebrow: 'DESCRIPTIVE ANALYSIS',
    title: 'Frequency & dispersion',
    purpose: 'Shows how often a form or user-defined group occurs and how widely it is distributed across dictionary entries.',
    method: ['Normalized frequency = 10,000 × f(w) / N', 'Entry coverage = 100 × df(w) / D', 'Hapax: f(w) = 1; single-entry form: df(w) = 1.'],
    read: ['Frequency and entry coverage measure different things.', 'Counts use accepted Latin tokens after text cleaning.', 'A high value does not imply semantic importance.'],
    refs: [['R1', 'Anthony — AntConc documentation', 'https://www.laurenceanthony.net/software/antconc/'], ['R2', 'Gries 2008 — Dispersions and adjusted frequencies', 'https://www.stgries.info/research/2008_STG_Dispersion_IJCL.pdf']],
  },
  cleaning: {
    eyebrow: 'CORPUS PREPARATION',
    title: 'Text cleaning',
    purpose: 'Separates analysable Latin forms from historical Chinese romanisations and applies the active lexical-exclusion layer before quantitative calculation.',
    method: ['Candidates carrying romanisation marks are excluded as whole tokens.', 'Single-letter forms are always excluded; sect, macr, ccedil, v, t, change and radical are also excluded as technical/editorial artefacts.', 'Latin function words are excluded by default but can be restored by the user; custom exclusions are session-persistent.', '§, strong punctuation, excluded romanisations and lexical exclusions interrupt local analytic sequences.', 'Accepted forms are lower-cased and normalized to Unicode NFC.'],
    read: ['The preview is an audit aid, not a correction layer.', 'Lexical exclusions change analytical denominators; they are not display-only filters.', '§ is an editorial paragraph marker, not a manuscript feature.', 'No automatic u/v, i/j or ae/æ equivalence is applied.'],
    refs: [['R12', 'MDN — String.prototype.normalize()', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/normalize']],
  },
  concordance: {
    eyebrow: 'EVIDENCE VIEW',
    title: 'Concordances',
    purpose: 'Returns every accepted occurrence of a selected form or group to its documentary context.',
    method: ['An inverted search is reconstructed from token offsets stored for each entry.', 'The visible context comes from the source text, so excluded romanisations can remain visible around the hit.'],
    read: ['The highlighted form is the form actually attested.', 'Page and line links return to the Dictionary view.', 'A group concordance merges all explicitly selected forms.'],
    refs: [['R1', 'Anthony — AntConc documentation', 'https://www.laurenceanthony.net/software/antconc/']],
  },
  sequences: {
    eyebrow: 'RECURRENT PATTERNS',
    title: 'Recurring sequences',
    purpose: 'Finds repeated contiguous sequences of two to five accepted Latin tokens.',
    method: ['N-grams are generated only inside the same analytic segment.', 'They never cross §, strong punctuation or an excluded romanisation.', 'Counts retain both occurrences and distinct entry IDs.'],
    read: ['These are recurring token sequences, not automatically grammatical phrases.', 'Stopwords are never removed before sequence construction.', 'Minimum occurrence and entry thresholds are descriptive filters.'],
    refs: [['R1', 'Anthony — AntConc documentation', 'https://www.laurenceanthony.net/software/antconc/']],
  },
  nearby: {
    eyebrow: 'LOCAL CONTEXT',
    title: 'Nearby words',
    purpose: 'Shows which forms occur within a configurable token window around a selected form or group.',
    method: ['Each focal token inspects neighbours within ±k positions inside the same segment.', 'Pair count, focal-token coverage and distinct entries are kept separate.'],
    read: ['Pair counts may exceed the number of focal occurrences.', 'Coverage is bounded between 0 and 100%.', 'Proximity does not demonstrate synonymy or grammatical dependency.'],
    refs: [['R4', 'Church & Hanks 1990 — Word Association Norms', 'https://aclanthology.org/J90-1003/']],
  },
  comparison: {
    eyebrow: 'DESCRIPTIVE COMPARISON',
    title: 'Compare sections',
    purpose: 'Compares relative frequency and diffusion between two explicitly defined portions of the dictionary.',
    method: ['pX = fX / NX; pY = fY / NY', 'Δ = 10,000 × (pX − pY)', 'ratio = pX / pY when the denominator is non-zero.'],
    read: ['“Only in X” means absent from the selected Y sample, not unique in absolute terms.', 'Overlapping X/Y selections are flagged.', 'This release is descriptive: no significance labels are assigned.'],
    refs: [['R3', 'UCREL — Log-likelihood and effect size', 'https://ucrel-web.lancs.ac.uk/llwizard.html']],
  },
  length: {
    eyebrow: 'ENTRY PROFILE',
    title: 'Definition length & repetition',
    purpose: 'Describes how long the Latin definitions are and how much form repetition occurs inside each entry.',
    method: ['L = accepted Latin tokens; V = distinct forms.', 'R = 1 − V/L when L > 0.', 'Median and quartiles are calculated on entry token lengths.'],
    read: ['R depends on entry length and is not a direct lexical-richness score.', 'The number of segments reflects the editorial segmentation rules.', 'Length does not automatically measure grammatical complexity.'],
    refs: [],
  },
} as const;

type NoteKey = keyof typeof noteLibrary;
type TabKey = 'overview' | 'words' | 'compare';
type Focus = { kind: 'form' | 'group'; value: string } | null;

type StatBundle = {
  N: number;
  D: number;
  S: number;
  empty: number;
  forms: FormStat[];
  byForm: Map<string, FormStat>;
};

function naturalCompare(a: unknown, b: unknown): number {
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' });
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function quantile(values: number[], q: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * q;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
}

function fmt(value: number | null | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function entryLocus(entry: LatinEntry): string {
  const page = entry.page == null ? 'unlocated' : `p. ${entry.page}`;
  const line = entry.line ? ` · l. ${entry.line}` : '';
  return `${page}${line}`;
}

function statBundle(entries: LatinEntry[]): StatBundle {
  const counts = new Map<string, number>();
  const entryIds = new Map<string, Set<string>>();
  let N = 0;
  let D = 0;
  let S = 0;
  let empty = 0;

  for (const entry of entries) {
    if (!entry.tokens.length) {
      empty += 1;
      continue;
    }
    D += 1;
    N += entry.tokens.length;
    S += entry.segmentCount;
    const seenHere = new Set<string>();
    for (const token of entry.tokens) {
      counts.set(token.form, (counts.get(token.form) ?? 0) + 1);
      seenHere.add(token.form);
    }
    for (const form of seenHere) {
      const ids = entryIds.get(form) ?? new Set<string>();
      ids.add(entry.id);
      entryIds.set(form, ids);
    }
  }

  const forms = [...counts].map(([form, count]) => {
    const entryCount = entryIds.get(form)?.size ?? 0;
    return {
      form,
      count,
      entryCount,
      normalized: N > 0 ? 10000 * count / N : null,
      diffusion: D > 0 ? 100 * entryCount / D : null,
    } satisfies FormStat;
  }).sort((a, b) => b.count - a.count || a.form.localeCompare(b.form));

  return { N, D, S, empty, forms, byForm: new Map(forms.map(row => [row.form, row])) };
}

function normalizeFormsInput(value: string): string[] {
  return [...new Set(
    value
      .split(/[\s,;]+/)
      .map(item => item.trim().normalize('NFC').toLocaleLowerCase())
      .filter(Boolean),
  )];
}

function latinLetterCount(form: string): number {
  return [...form.normalize('NFC')].filter(char => /\p{L}/u.test(char)).length;
}

function applyLexicalExclusions(entries: LatinEntry[], excluded: Set<string>): LatinEntry[] {
  return entries.map(entry => {
    const tokens: LatinEntry['tokens'] = [];
    let derivedSegment = -1;
    let previousSourceSegment: number | null = null;
    let breakBeforeNext = true;

    for (const token of entry.tokens) {
      if (previousSourceSegment == null || token.segment !== previousSourceSegment) {
        breakBeforeNext = true;
        previousSourceSegment = token.segment;
      }

      if (latinLetterCount(token.form) < 2 || excluded.has(token.form)) {
        // Technical/lexical exclusions are boundaries for local-context analyses:
        // removing a one-letter form or "et" must not create artificial adjacency.
        breakBeforeNext = true;
        continue;
      }

      if (breakBeforeNext) {
        derivedSegment += 1;
        breakBeforeNext = false;
      }
      tokens.push({ ...token, segment: derivedSegment });
    }

    const distinctForms = new Set(tokens.map(token => token.form)).size;
    const segmentCount = new Set(tokens.map(token => token.segment)).size;
    return {
      ...entry,
      tokens,
      segmentCount,
      distinctForms,
      repetition: tokens.length > 0 ? 1 - distinctForms / tokens.length : null,
    };
  });
}

function focusForms(focus: Focus, groups: WordGroup[], fallback?: string): Set<string> {
  if (!focus) return fallback ? new Set([fallback]) : new Set();
  if (focus.kind === 'form') return new Set([focus.value]);
  const group = groups.find(item => item.id === focus.value);
  return new Set(group?.forms ?? []);
}

function focusLabel(focus: Focus, groups: WordGroup[], fallback?: string): string {
  if (!focus) return fallback ?? 'No selection';
  if (focus.kind === 'form') return focus.value;
  return groups.find(item => item.id === focus.value)?.label ?? 'Group';
}

function download(name: string, content: string, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 300);
}

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const points = values.map((v, i) => `${i * (72 / Math.max(1, values.length - 1))},${24 - (v / max) * 20}`).join(' ');
  return <svg className="la-spark" viewBox="0 0 72 28" aria-hidden="true"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>;
}

function DistributionChart({ rows, label }: { rows: Array<{ start: number; end: number; value: number; N: number; D: number }>; label: string }) {
  const width = 620;
  const height = 230;
  const left = 52;
  const right = 18;
  const top = 18;
  const bottom = 44;
  const innerW = width - left - right;
  const innerH = height - top - bottom;
  const max = Math.max(1, ...rows.map(row => row.value));
  const x = (index: number) => left + (rows.length <= 1 ? innerW / 2 : index * innerW / (rows.length - 1));
  const y = (value: number) => top + innerH - (value / max) * innerH;
  const points = rows.map((row, index) => `${x(index)},${y(row.value)}`).join(' ');

  return (
    <div className="la-chart-wrap">
      <svg className="la-line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Distribution of ${label}`}>
        {[0, .25, .5, .75, 1].map(tick => {
          const yy = top + innerH - tick * innerH;
          return <g key={tick}><line x1={left} x2={width - right} y1={yy} y2={yy} className="la-grid-line" /><text x={left - 8} y={yy + 4} textAnchor="end">{fmt(max * tick, 1)}</text></g>;
        })}
        <polyline points={points} fill="none" className="la-series-line" />
        {rows.map((row, index) => (
          <g key={`${row.start}-${row.end}`}>
            <circle cx={x(index)} cy={y(row.value)} r="5" className="la-series-dot"><title>{`Pages ${row.start}–${row.end}: ${fmt(row.value, 1)} / 10k · N ${row.N.toLocaleString()} · D ${row.D.toLocaleString()}`}</title></circle>
            <text x={x(index)} y={height - 17} textAnchor="middle" className="la-axis-label">{row.start === row.end ? row.start : `${row.start}–${row.end}`}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function LengthHistogram({ entries }: { entries: LatinEntry[] }) {
  const analysable = entries.filter(entry => entry.tokens.length > 0);
  const lengths = analysable.map(entry => entry.tokens.length);
  const bins = Array.from({ length: 16 }, (_, index) => ({ label: index < 15 ? String(index + 1) : '16+', count: 0 }));
  for (const value of lengths) bins[Math.min(15, Math.max(0, value - 1))].count += 1;
  const max = Math.max(1, ...bins.map(bin => bin.count));
  const med = median(lengths);
  const q1 = quantile(lengths, .25);
  const q3 = quantile(lengths, .75);
  const repetitionValues = analysable.map(entry => entry.repetition).filter((value): value is number => value != null);
  const repetition = repetitionValues.length ? repetitionValues.reduce((a, b) => a + b, 0) / repetitionValues.length : null;

  return (
    <div className="la-length-content">
      <div className="la-histogram" aria-label="Definition length histogram">
        {bins.map(bin => <div className="la-hist-col" key={bin.label}><span style={{ height: `${Math.max(2, 78 * bin.count / max)}px` }} title={`${bin.label} tokens: ${bin.count} entries`} /><small>{bin.label}</small></div>)}
      </div>
      <div className="la-length-metrics">
        <p><span>Median</span><strong>{fmt(med, 1)} tokens</strong></p>
        <p><span>Q1–Q3</span><strong>{fmt(q1, 1)}–{fmt(q3, 1)}</strong></p>
        <p><span>Mean R</span><strong>{fmt(repetition, 3)}</strong></p>
      </div>
    </div>
  );
}

export default function LatinAnalysis() {
  const [payload, setPayload] = useState<LatinCorpusPayload | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<TabKey>('overview');
  const [noteKey, setNoteKey] = useState<NoteKey>('frequency');
  const [noteOpen, setNoteOpen] = useState(true);
  const [corpusMode, setCorpusMode] = useState<'all' | 'main' | 'appendix'>('all');
  const [typology, setTypology] = useState('all');
  const [pageFrom, setPageFrom] = useState<number | ''>('');
  const [pageTo, setPageTo] = useState<number | ''>('');
  const [includeFunctionWords, setIncludeFunctionWords] = useState(false);
  const [customExclusions, setCustomExclusions] = useState<string[]>([]);
  const [exclusionOpen, setExclusionOpen] = useState(false);
  const [exclusionInput, setExclusionInput] = useState('');
  const [focus, setFocus] = useState<Focus>(null);
  const [wordQuery, setWordQuery] = useState('');
  const [groups, setGroups] = useState<WordGroup[]>([]);
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupLabel, setGroupLabel] = useState('');
  const [groupFormsInput, setGroupFormsInput] = useState('');
  const [cleaningOpen, setCleaningOpen] = useState(false);
  const [rankingPage, setRankingPage] = useState(1);
  const [concordancePage, setConcordancePage] = useState(1);
  const [comparePage, setComparePage] = useState(1);
  const [nearPage, setNearPage] = useState(1);
  const [ngramPage, setNgramPage] = useState(1);
  const [ngramN, setNgramN] = useState(2);
  const [ngramMinCount, setNgramMinCount] = useState(2);
  const [ngramMinEntries, setNgramMinEntries] = useState(1);
  const [ngramFocusOnly, setNgramFocusOnly] = useState(false);
  const [ngramRows, setNgramRows] = useState<Array<{ sequence: string; count: number; entries: number; examples: string[] }>>([]);
  const [nearWindow, setNearWindow] = useState(3);
  const [hideFocalMembers, setHideFocalMembers] = useState(true);
  const [xFrom, setXFrom] = useState<number | ''>('');
  const [xTo, setXTo] = useState<number | ''>('');
  const [yFrom, setYFrom] = useState<number | ''>('');
  const [yTo, setYTo] = useState<number | ''>('');
  const [xTypology, setXTypology] = useState('all');
  const [yTypology, setYTypology] = useState('all');
  const [compareRest, setCompareRest] = useState(true);
  const [compareView, setCompareView] = useState<'x' | 'y' | 'onlyX' | 'onlyY'>('x');

  useEffect(() => {
    let cancelled = false;
    fetch(`${withBase('/data/latin-analysis-corpus.json')}?analysisSchema=html-entities-v2`, { cache: 'no-store' })
      .then(response => {
        if (!response.ok) throw new Error(`Corpus request failed (${response.status}).`);
        return response.json();
      })
      .then((data: LatinCorpusPayload) => {
        if (cancelled) return;
        setPayload(data);
        setPageFrom(data.pageMin ?? '');
        setPageTo(data.pageMax ?? '');
        if (data.pageMin != null && data.pageMax != null) {
          const mid = Math.floor((data.pageMin + data.pageMax) / 2);
          setXFrom(data.pageMin);
          setXTo(mid);
          setYFrom(mid + 1);
          setYTo(data.pageMax);
        }
      })
      .catch(err => !cancelled && setError(err instanceof Error ? err.message : String(err)));

    try {
      const stored = localStorage.getItem('chind-latin-word-groups');
      if (stored) setGroups(JSON.parse(stored));
      const excluded = localStorage.getItem('chind-latin-custom-exclusions');
      if (excluded) setCustomExclusions(JSON.parse(excluded));
    } catch { /* session storage is optional */ }
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    try { localStorage.setItem('chind-latin-word-groups', JSON.stringify(groups)); } catch { /* optional */ }
  }, [groups]);

  useEffect(() => {
    try { localStorage.setItem('chind-latin-custom-exclusions', JSON.stringify(customExclusions)); } catch { /* optional */ }
  }, [customExclusions]);

  const corpusSelectionEntries = useMemo(() => {
    if (!payload) return [];
    const fullRange = pageFrom === payload.pageMin && pageTo === payload.pageMax;
    return payload.entries.filter(entry => {
      if (corpusMode === 'main' && APPENDIX_TYPES.has(entry.typology)) return false;
      if (corpusMode === 'appendix' && !APPENDIX_TYPES.has(entry.typology)) return false;
      if (typology !== 'all' && entry.typology !== typology) return false;
      if (entry.page == null) return fullRange;
      if (pageFrom !== '' && entry.page < Number(pageFrom)) return false;
      if (pageTo !== '' && entry.page > Number(pageTo)) return false;
      return true;
    });
  }, [payload, corpusMode, typology, pageFrom, pageTo]);

  const activeExcludedForms = useMemo(() => {
    const excluded = new Set(FIXED_ANALYSIS_EXCLUSIONS);
    if (!includeFunctionWords) LATIN_FUNCTION_WORDS.forEach(form => excluded.add(form));
    customExclusions.forEach(form => excluded.add(form));
    return excluded;
  }, [includeFunctionWords, customExclusions]);

  const selectedEntries = useMemo(
    () => applyLexicalExclusions(corpusSelectionEntries, activeExcludedForms),
    [corpusSelectionEntries, activeExcludedForms],
  );

  const stats = useMemo(() => statBundle(selectedEntries), [selectedEntries]);
  const fallbackFocus = stats.forms[0]?.form;
  const activeForms = useMemo(() => focusForms(focus, groups, fallbackFocus), [focus, groups, fallbackFocus]);
  const activeLabel = focusLabel(focus, groups, fallbackFocus);
  const excludedFocusForms = useMemo(
    () => [...activeForms].filter(form => activeExcludedForms.has(form)).length,
    [activeForms, activeExcludedForms],
  );

  const focusStats = useMemo(() => {
    if (!activeForms.size) return { count: 0, entries: 0 };
    let count = 0;
    const ids = new Set<string>();
    for (const entry of selectedEntries) {
      let hit = false;
      for (const token of entry.tokens) if (activeForms.has(token.form)) { count += 1; hit = true; }
      if (hit) ids.add(entry.id);
    }
    return { count, entries: ids.size };
  }, [selectedEntries, activeForms]);

  const distribution = useMemo(() => {
    const pages = selectedEntries.map(entry => entry.page).filter((value): value is number => value != null);
    if (!pages.length || !activeForms.size) return [];
    const min = Math.min(...pages);
    const max = Math.max(...pages);
    const start0 = Math.floor((min - 1) / PAGE_BIN) * PAGE_BIN + 1;
    const rows: Array<{ start: number; end: number; value: number; N: number; D: number }> = [];
    for (let start = start0; start <= max; start += PAGE_BIN) {
      const end = start + PAGE_BIN - 1;
      const entries = selectedEntries.filter(entry => entry.page != null && entry.page >= start && entry.page <= end);
      const N = entries.reduce((sum, entry) => sum + entry.tokens.length, 0);
      const D = entries.filter(entry => entry.tokens.length > 0).length;
      let f = 0;
      for (const entry of entries) for (const token of entry.tokens) if (activeForms.has(token.form)) f += 1;
      rows.push({ start, end, value: N > 0 ? 10000 * f / N : 0, N, D });
    }
    return rows;
  }, [selectedEntries, activeForms]);

  const concordances = useMemo(() => {
    if (!activeForms.size) return [];
    const rows: Array<{ tokenId: number; entry: LatinEntry; form: string; raw: string; left: string; right: string }> = [];
    for (const entry of selectedEntries) {
      for (const token of entry.tokens) {
        if (!activeForms.has(token.form)) continue;
        const left = entry.text.slice(Math.max(0, token.start - 54), token.start).replace(/^.*?\n/s, '');
        const right = entry.text.slice(token.end, Math.min(entry.text.length, token.end + 54)).replace(/\n.*$/s, '');
        rows.push({ tokenId: token.id, entry, form: token.form, raw: token.raw, left, right });
      }
    }
    rows.sort((a, b) => (a.entry.page ?? Number.MAX_SAFE_INTEGER) - (b.entry.page ?? Number.MAX_SAFE_INTEGER) || naturalCompare(a.entry.line, b.entry.line) || a.tokenId - b.tokenId);
    return rows;
  }, [selectedEntries, activeForms]);

  const nearRows = useMemo(() => {
    if (!activeForms.size || focusStats.count === 0) return [];
    const map = new Map<string, { pairs: number; focusHits: Set<number>; entries: Set<string>; positions: Map<number, number> }>();
    for (const entry of selectedEntries) {
      const segments = new Map<number, typeof entry.tokens>();
      for (const token of entry.tokens) {
        const list = segments.get(token.segment) ?? [];
        list.push(token);
        segments.set(token.segment, list);
      }
      for (const tokens of segments.values()) {
        tokens.forEach((token, index) => {
          if (!activeForms.has(token.form)) return;
          const lo = Math.max(0, index - nearWindow);
          const hi = Math.min(tokens.length - 1, index + nearWindow);
          for (let j = lo; j <= hi; j += 1) {
            if (j === index) continue;
            const candidate = tokens[j];
            if (hideFocalMembers && activeForms.has(candidate.form)) continue;
            const item = map.get(candidate.form) ?? { pairs: 0, focusHits: new Set<number>(), entries: new Set<string>(), positions: new Map<number, number>() };
            item.pairs += 1;
            item.focusHits.add(token.id);
            item.entries.add(entry.id);
            const distance = j - index;
            item.positions.set(distance, (item.positions.get(distance) ?? 0) + 1);
            map.set(candidate.form, item);
          }
        });
      }
    }
    return [...map].map(([form, item]) => ({
      form,
      pairs: item.pairs,
      focusHits: item.focusHits.size,
      coverage: focusStats.count > 0 ? 100 * item.focusHits.size / focusStats.count : 0,
      entries: item.entries.size,
      positions: item.positions,
    })).sort((a, b) => b.pairs - a.pairs || b.entries - a.entries || a.form.localeCompare(b.form));
  }, [selectedEntries, activeForms, nearWindow, hideFocalMembers, focusStats.count]);

  const compareData = useMemo(() => {
    const universe = selectedEntries;
    const inRange = (entry: LatinEntry, from: number | '', to: number | '', type: string) => {
      if (entry.page == null) return false;
      if (from !== '' && entry.page < Number(from)) return false;
      if (to !== '' && entry.page > Number(to)) return false;
      if (type !== 'all' && entry.typology !== type) return false;
      return true;
    };
    const x = universe.filter(entry => inRange(entry, xFrom, xTo, xTypology));
    const xIds = new Set(x.map(entry => entry.id));
    const y = compareRest
      ? universe.filter(entry => !xIds.has(entry.id))
      : universe.filter(entry => inRange(entry, yFrom, yTo, yTypology));
    const yIds = new Set(y.map(entry => entry.id));
    const overlap = [...xIds].filter(id => yIds.has(id)).length;
    const sx = statBundle(x);
    const sy = statBundle(y);
    const forms = new Set([...sx.byForm.keys(), ...sy.byForm.keys()]);
    let rows = [...forms].map(form => {
      const a = sx.byForm.get(form);
      const b = sy.byForm.get(form);
      const fX = a?.count ?? 0;
      const fY = b?.count ?? 0;
      const pX = sx.N > 0 ? fX / sx.N : 0;
      const pY = sy.N > 0 ? fY / sy.N : 0;
      return {
        form,
        fX,
        fY,
        normX: sx.N > 0 ? 10000 * pX : null,
        normY: sy.N > 0 ? 10000 * pY : null,
        delta: sx.N > 0 && sy.N > 0 ? 10000 * (pX - pY) : null,
        ratio: pY > 0 ? pX / pY : null,
        logRatio: pX > 0 && pY > 0 ? Math.log2(pX / pY) : null,
        dX: a?.diffusion ?? null,
        dY: b?.diffusion ?? null,
      };
    });
    rows = rows.filter(row => {
      if (compareView === 'onlyX') return row.fX > 0 && row.fY === 0;
      if (compareView === 'onlyY') return row.fY > 0 && row.fX === 0;
      if (compareView === 'x') return (row.delta ?? 0) > 0;
      return (row.delta ?? 0) < 0;
    }).sort((a, b) => {
      if (compareView === 'x' || compareView === 'onlyX') return (b.delta ?? Number.MAX_VALUE) - (a.delta ?? Number.MAX_VALUE) || b.fX - a.fX;
      return (a.delta ?? -Number.MAX_VALUE) - (b.delta ?? -Number.MAX_VALUE) || b.fY - a.fY;
    });
    return { x, y, sx, sy, overlap, rows };
  }, [selectedEntries, xFrom, xTo, yFrom, yTo, xTypology, yTypology, compareRest, compareView]);

  const suggestions = useMemo(() => {
    const query = wordQuery.trim().normalize('NFC').toLocaleLowerCase();
    if (!query) return stats.forms.slice(0, 12);
    return stats.forms.filter(row => row.form.startsWith(query) || row.form.includes(query)).slice(0, 12);
  }, [wordQuery, stats.forms]);

  const runNgrams = () => {
    const map = new Map<string, { count: number; entries: Set<string>; examples: string[] }>();
    for (const entry of selectedEntries) {
      const segments = new Map<number, string[]>();
      for (const token of entry.tokens) {
        const list = segments.get(token.segment) ?? [];
        list.push(token.form);
        segments.set(token.segment, list);
      }
      for (const forms of segments.values()) {
        for (let i = 0; i <= forms.length - ngramN; i += 1) {
          const window = forms.slice(i, i + ngramN);
          if (ngramFocusOnly && activeForms.size && !window.some(form => activeForms.has(form))) continue;
          const key = JSON.stringify(window);
          const item = map.get(key) ?? { count: 0, entries: new Set<string>(), examples: [] };
          item.count += 1;
          item.entries.add(entry.id);
          if (item.examples.length < 3) item.examples.push(`${entryLocus(entry)} · ${window.join(' ')}`);
          map.set(key, item);
        }
      }
    }
    setNgramRows([...map].map(([key, value]) => ({ sequence: (JSON.parse(key) as string[]).join(' '), count: value.count, entries: value.entries.size, examples: value.examples }))
      .filter(row => row.count >= ngramMinCount && row.entries >= ngramMinEntries)
      .sort((a, b) => b.count - a.count || b.entries - a.entries || a.sequence.localeCompare(b.sequence)));
    setNgramPage(1);
    setNoteKey('sequences');
    setNoteOpen(true);
  };

  const addCustomExclusions = () => {
    const forms = normalizeFormsInput(exclusionInput);
    if (!forms.length) return;
    setCustomExclusions(current => [...new Set([...current, ...forms])].sort((a, b) => a.localeCompare(b)));
    setExclusionInput('');
  };

  const saveGroup = () => {
    const forms = normalizeFormsInput(groupFormsInput);
    if (!forms.length) return;
    const label = groupLabel.trim() || forms.join(' + ');
    const group: WordGroup = { id: `g-${Date.now()}`, label, forms };
    setGroups(current => [...current, group]);
    setFocus({ kind: 'group', value: group.id });
    setGroupLabel('');
    setGroupFormsInput('');
    setGroupOpen(false);
  };

  const exportRanking = () => {
    const rows = [['form', 'occurrences', 'per_10000_tokens', 'entries', 'entry_percent'], ...stats.forms.map(row => [row.form, row.count, row.normalized ?? '', row.entryCount, row.diffusion ?? ''])];
    download('chind-latin-frequency.csv', rows.map(row => row.map(csvCell).join(',')).join('\n'), 'text/csv;charset=utf-8');
  };

  const rankingMaxPage = Math.max(1, Math.ceil(stats.forms.length / RANKING_PAGE_SIZE));
  const rankingSlice = stats.forms.slice((rankingPage - 1) * RANKING_PAGE_SIZE, rankingPage * RANKING_PAGE_SIZE);
  const rankingStart = stats.forms.length ? (rankingPage - 1) * RANKING_PAGE_SIZE + 1 : 0;
  const rankingEnd = Math.min(rankingPage * RANKING_PAGE_SIZE, stats.forms.length);

  const concordanceMaxPage = Math.max(1, Math.ceil(concordances.length / CONCORDANCE_PAGE_SIZE));
  const concordanceSlice = concordances.slice((concordancePage - 1) * CONCORDANCE_PAGE_SIZE, concordancePage * CONCORDANCE_PAGE_SIZE);

  const compareMaxPage = Math.max(1, Math.ceil(compareData.rows.length / COMPARE_PAGE_SIZE));
  const compareSlice = compareData.rows.slice((comparePage - 1) * COMPARE_PAGE_SIZE, comparePage * COMPARE_PAGE_SIZE);
  const compareStart = compareData.rows.length ? (comparePage - 1) * COMPARE_PAGE_SIZE + 1 : 0;
  const compareEnd = Math.min(comparePage * COMPARE_PAGE_SIZE, compareData.rows.length);

  const nearMaxPage = Math.max(1, Math.ceil(nearRows.length / NEARBY_PAGE_SIZE));
  const nearSlice = nearRows.slice((nearPage - 1) * NEARBY_PAGE_SIZE, nearPage * NEARBY_PAGE_SIZE);
  const nearStart = nearRows.length ? (nearPage - 1) * NEARBY_PAGE_SIZE + 1 : 0;
  const nearEnd = Math.min(nearPage * NEARBY_PAGE_SIZE, nearRows.length);

  const ngramMaxPage = Math.max(1, Math.ceil(ngramRows.length / NGRAM_PAGE_SIZE));
  const ngramSlice = ngramRows.slice((ngramPage - 1) * NGRAM_PAGE_SIZE, ngramPage * NGRAM_PAGE_SIZE);
  const ngramStart = ngramRows.length ? (ngramPage - 1) * NGRAM_PAGE_SIZE + 1 : 0;
  const ngramEnd = Math.min(ngramPage * NGRAM_PAGE_SIZE, ngramRows.length);

  useEffect(() => {
    setRankingPage(page => Math.min(page, rankingMaxPage));
  }, [rankingMaxPage]);

  useEffect(() => {
    setConcordancePage(page => Math.min(page, concordanceMaxPage));
  }, [concordanceMaxPage]);

  useEffect(() => {
    setComparePage(1);
  }, [compareView, xFrom, xTo, yFrom, yTo, xTypology, yTypology, compareRest, selectedEntries]);

  useEffect(() => {
    setComparePage(page => Math.min(page, compareMaxPage));
  }, [compareMaxPage]);

  useEffect(() => {
    setNearPage(1);
  }, [activeLabel, nearWindow, hideFocalMembers, selectedEntries]);

  useEffect(() => {
    setNearPage(page => Math.min(page, nearMaxPage));
  }, [nearMaxPage]);

  useEffect(() => {
    setNgramPage(page => Math.min(page, ngramMaxPage));
  }, [ngramMaxPage]);

  if (error) return <main className="la-shell"><div className="la-state la-error"><strong>Latin analysis could not be loaded.</strong><p>{error}</p></div></main>;
  if (!payload) return <main className="la-shell"><div className="la-state"><span className="la-spinner" />Preparing Latin corpus and analytical indexes…</div></main>;

  const hapax = stats.forms.filter(row => row.count === 1).length;
  const note = noteLibrary[noteKey];
  const cardSpark = [4, 6, 5, 9, 7, 12, 10, 15];

  return (
    <main className={`la-shell ${noteOpen ? 'has-note' : ''}`}>
      <section className="la-workspace">
        <header className="la-hero">
          <div>
            <p className="la-kicker"><span>ANALYSIS</span><i>/</i><strong>LATIN DEFINITIONS</strong></p>
            <h1>Lexical Analysis</h1>
            <p>Explore frequency, distribution, recurring patterns and documentary evidence in <code>occ.latin_definition_2</code>.</p>
          </div>
          <button className="la-ready" type="button" onClick={() => { setNoteKey('cleaning'); setNoteOpen(true); }}><span /> Corpus ready</button>
        </header>

        <nav className="la-tabs" aria-label="Latin analysis sections">
          <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>Overview</button>
          <button className={tab === 'words' ? 'active' : ''} onClick={() => setTab('words')}>Explore words</button>
          <button className={tab === 'compare' ? 'active' : ''} onClick={() => setTab('compare')}>Compare sections</button>
        </nav>

        <section className="la-filterbar">
          <label><span>Corpus</span><select value={corpusMode} onChange={event => setCorpusMode(event.target.value as any)}><option value="all">Whole dictionary</option><option value="main">Main dictionary</option><option value="appendix">Appendices</option></select></label>
          <label><span>Pages from</span><input type="number" value={pageFrom} min={payload.pageMin ?? undefined} max={pageTo === '' ? undefined : Number(pageTo)} onChange={event => setPageFrom(event.target.value === '' ? '' : Number(event.target.value))} /></label>
          <label><span>to</span><input type="number" value={pageTo} min={pageFrom === '' ? undefined : Number(pageFrom)} max={payload.pageMax ?? undefined} onChange={event => setPageTo(event.target.value === '' ? '' : Number(event.target.value))} /></label>
          <label><span>Typology</span><select value={typology} onChange={event => setTypology(event.target.value)}><option value="all">All typologies</option>{payload.typologies.map(type => <option value={type} key={type}>{type}</option>)}</select></label>
          <div className="la-groups-filter"><span>Word groups <small>(what to search)</small></span><div className="la-chip-row">{groups.slice(0, 3).map(group => <button key={group.id} className={focus?.kind === 'group' && focus.value === group.id ? 'la-chip active' : 'la-chip'} onClick={() => setFocus({ kind: 'group', value: group.id })}>{group.label}</button>)}<button className="la-edit-groups" onClick={() => setGroupOpen(true)}>Edit groups</button></div></div>
          <label className="la-toggle"><span>Include function words<small>{includeFunctionWords ? 'included in analyses' : `${LATIN_FUNCTION_WORDS.size} excluded by default`}</small></span><input type="checkbox" checked={includeFunctionWords} onChange={event => setIncludeFunctionWords(event.target.checked)} /><i /></label>
          <div className="la-exclusion-filter"><span>Word exclusions <small>{customExclusions.length ? `${customExclusions.length} custom` : 'custom blacklist'}</small></span><button className="la-edit-exclusions" type="button" onClick={() => setExclusionOpen(true)}>Edit exclusions</button></div>
          <button className="la-apply" type="button" onClick={() => { setFocus(null); setRankingPage(1); setConcordancePage(1); setComparePage(1); setNearPage(1); setNgramPage(1); }}>Apply filters</button>
          <button className="la-clean-link" type="button" onClick={() => { setCleaningOpen(true); setNoteKey('cleaning'); setNoteOpen(true); }}>Review text cleaning →</button>
        </section>

        <div className="la-denominators"><span>N <strong>{stats.N.toLocaleString()}</strong> analytical Latin tokens</span><i>·</i><span>D <strong>{stats.D.toLocaleString()}</strong> analysable entries</span><i>·</i><span>S <strong>{stats.S.toLocaleString()}</strong> segments</span><i>·</i><span><strong>{stats.empty.toLocaleString()}</strong> empty entries after exclusions</span><i>·</i><span className="la-exclusion-count"><strong>{activeExcludedForms.size}</strong> excluded forms</span></div>

        {tab === 'overview' && <>
          <section className="la-stat-grid">
            <button className="la-stat-card" onClick={() => { setNoteKey('frequency'); setNoteOpen(true); }}><span className="la-stat-icon">▤</span><span><small>LATIN TOKENS</small><strong>{stats.N.toLocaleString()}</strong></span><Sparkline values={cardSpark} /><b>ⓘ</b></button>
            <button className="la-stat-card" onClick={() => { setNoteKey('frequency'); setNoteOpen(true); }}><span className="la-stat-icon">▱</span><span><small>DISTINCT FORMS</small><strong>{stats.forms.length.toLocaleString()}</strong></span><Sparkline values={[3,5,7,6,9,12,11,16]} /><b>ⓘ</b></button>
            <button className="la-stat-card" onClick={() => { setNoteKey('length'); setNoteOpen(true); }}><span className="la-stat-icon">▯</span><span><small>ANALYSABLE ENTRIES</small><strong>{stats.D.toLocaleString()}</strong></span><Sparkline values={[7,8,7,9,11,10,13,12]} /><b>ⓘ</b></button>
            <button className="la-stat-card" onClick={() => { setNoteKey('frequency'); setNoteOpen(true); }}><span className="la-stat-icon">◒</span><span><small>HAPAX FORMS</small><strong>{hapax.toLocaleString()}</strong></span><Sparkline values={[2,3,4,4,6,7,8,11]} /><b>ⓘ</b></button>
          </section>

          <section className="la-dashboard-grid">
            <article className="la-panel la-ranking-panel">
              <header><div><h2>Most frequent forms <button className="la-info" onClick={() => { setNoteKey('frequency'); setNoteOpen(true); }}>ⓘ</button></h2><p>Occurrences per 10,000 accepted tokens · {rankingStart}–{rankingEnd} of {stats.forms.length.toLocaleString()}</p></div><div className="la-panel-head-tools"><span className="la-focus-pill">{activeLabel}</span><div className="la-pager"><button disabled={rankingPage <= 1} onClick={() => setRankingPage(page => Math.max(1, page - 1))}>←</button><span>{rankingPage}/{rankingMaxPage}</span><button disabled={rankingPage >= rankingMaxPage} onClick={() => setRankingPage(page => Math.min(rankingMaxPage, page + 1))}>→</button></div></div></header>
              <div className="la-ranking-head"><span>Form</span><span>Occurrences<br/><small>(per 10k)</small></span><span>Entries<br/><small>(%)</small></span></div>
              <div className="la-ranking-list">{rankingSlice.map((row, index) => {
                const max = Math.max(1, stats.forms[0]?.count ?? 1);
                const absoluteRank = (rankingPage - 1) * RANKING_PAGE_SIZE + index;
                return <button key={row.form} className={activeForms.has(row.form) && activeForms.size === 1 ? 'active' : ''} onClick={() => { setFocus({ kind: 'form', value: row.form }); setNoteKey('frequency'); setNoteOpen(true); }}><span className="la-rank-form"><small className="la-rank-number">{absoluteRank + 1}</small>{row.form}</span><span className="la-rank-bar"><i style={{ width: `${Math.max(3, 100 * row.count / max)}%` }} data-rank={absoluteRank} /></span><span>{row.count.toLocaleString()} <small>{fmt(row.normalized, 1)}</small></span><span>{row.entryCount.toLocaleString()} <small>{fmt(row.diffusion, 1)}%</small></span></button>;
              })}</div>
              <footer><span>Click a form to focus the other analyses.</span><div className="la-pager"><button disabled={rankingPage <= 1} onClick={() => setRankingPage(page => Math.max(1, page - 1))}>←</button><span>{rankingStart}–{rankingEnd}</span><button disabled={rankingPage >= rankingMaxPage} onClick={() => setRankingPage(page => Math.min(rankingMaxPage, page + 1))}>→</button></div></footer>
            </article>

            <article className="la-panel la-distribution-panel">
              <header><div><h2>Distribution across the dictionary <button className="la-info" onClick={() => { setNoteKey('frequency'); setNoteOpen(true); }}>ⓘ</button></h2><p><strong>{activeLabel}</strong> · {PAGE_BIN}-page intervals · per 10,000 tokens</p></div></header>
              {distribution.length ? <DistributionChart rows={distribution} label={activeLabel} /> : <div className="la-empty">Select a form or group with located attestations.</div>}
            </article>

            <article className="la-panel la-length-panel">
              <header><div><h2>Definition length & repetition <button className="la-info" onClick={() => { setNoteKey('length'); setNoteOpen(true); }}>ⓘ</button></h2><p>Accepted Latin tokens per entry</p></div></header>
              <LengthHistogram entries={selectedEntries} />
            </article>
          </section>

          <div className="la-bottom-actions"><button onClick={() => { setTab('words'); setConcordancePage(1); setNoteKey('concordance'); }}>▣ Open concordances</button><button onClick={() => { setTab('words'); setWordQuery(activeLabel); }}>▥ Explore selected form</button><button onClick={exportRanking}>⇩ Export CSV</button></div>
        </>}

        {tab === 'words' && <section className="la-words-grid">
          <article className="la-panel la-word-browser">
            <header><div><h2>Explore a form or word group</h2><p>Suggestions come from forms actually present in the selected corpus; no stemming or automatic lemmatisation is applied.</p></div></header>
            <div className="la-word-search"><input value={wordQuery} onChange={event => setWordQuery(event.target.value)} placeholder="Type a Latin form…" /><button onClick={() => { const form = wordQuery.trim().normalize('NFC').toLocaleLowerCase(); if (form) { setFocus({ kind: 'form', value: form }); setConcordancePage(1); } }}>Select form</button></div>
            <div className="la-suggestions">{suggestions.map(row => <button key={row.form} onClick={() => { setFocus({ kind: 'form', value: row.form }); setWordQuery(row.form); setConcordancePage(1); }}>{row.form}<small>{row.count.toLocaleString()}</small></button>)}</div>
            <div className="la-focus-summary"><span>Current focus</span><strong>{activeLabel}</strong><small>{focusStats.count.toLocaleString()} occurrences · {focusStats.entries.toLocaleString()} entries{excludedFocusForms ? ` · ${excludedFocusForms} focus form${excludedFocusForms === 1 ? '' : 's'} excluded by current settings` : ''}</small></div>
          </article>

          <article className="la-panel la-concordance-panel">
            <header><div><h2>Concordances <button className="la-info" onClick={() => { setNoteKey('concordance'); setNoteOpen(true); }}>ⓘ</button></h2><p>{concordances.length.toLocaleString()} occurrence{concordances.length === 1 ? '' : 's'} for {activeLabel} · {concordances.length ? `${(concordancePage - 1) * CONCORDANCE_PAGE_SIZE + 1}–${Math.min(concordancePage * CONCORDANCE_PAGE_SIZE, concordances.length)}` : '0'} shown</p></div><div className="la-pager"><button disabled={concordancePage <= 1} onClick={() => setConcordancePage(page => Math.max(1, page - 1))}>←</button><span>{concordancePage}/{concordanceMaxPage}</span><button disabled={concordancePage >= concordanceMaxPage} onClick={() => setConcordancePage(page => Math.min(concordanceMaxPage, page + 1))}>→</button></div></header>
            <div className="la-table-wrap la-paged-table"><table className="la-kwic"><thead><tr><th>Left context</th><th>Form</th><th>Right context</th><th>Page / line</th></tr></thead><tbody>{concordanceSlice.map(row => <tr key={row.tokenId}><td className="left">{row.left}</td><td><mark>{row.raw}</mark></td><td>{row.right}</td><td>{row.entry.page != null ? <a href={withBase(`/dictionary?page=${row.entry.page}${row.entry.line ? `&line=${encodeURIComponent(row.entry.line)}` : ''}`)}>{entryLocus(row.entry)} ↗</a> : entryLocus(row.entry)}</td></tr>)}</tbody></table></div>
          </article>

          <article className="la-panel la-near-panel">
            <header><div><h2>Nearby words <button className="la-info" onClick={() => { setNoteKey('nearby'); setNoteOpen(true); }}>ⓘ</button></h2><p>Accepted forms within the same analytic segment · {nearRows.length ? `${nearStart}–${nearEnd} of ${nearRows.length.toLocaleString()}` : 'no associations'}</p></div><div className="la-panel-head-tools"><div className="la-inline-controls"><label>Window <select value={nearWindow} onChange={event => setNearWindow(Number(event.target.value))}><option value={3}>±3</option><option value={5}>±5</option></select></label><label className="la-mini-check"><input type="checkbox" checked={hideFocalMembers} onChange={event => setHideFocalMembers(event.target.checked)} /> hide focal forms</label></div><div className="la-pager"><button disabled={nearPage <= 1} onClick={() => setNearPage(page => Math.max(1, page - 1))}>←</button><span>{nearPage}/{nearMaxPage}</span><button disabled={nearPage >= nearMaxPage} onClick={() => setNearPage(page => Math.min(nearMaxPage, page + 1))}>→</button></div></div></header>
            <div className="la-table-wrap la-paged-table"><table><thead><tr><th>Associated</th><th>Pairs</th><th>Focal hits</th><th>Coverage</th><th>Entries</th></tr></thead><tbody>{nearSlice.map(row => <tr key={row.form}><td><button className="la-table-link" onClick={() => { setFocus({ kind: 'form', value: row.form }); setWordQuery(row.form); setNearPage(1); }}>{row.form}</button></td><td>{row.pairs}</td><td>{row.focusHits}</td><td>{fmt(row.coverage, 1)}%</td><td>{row.entries}</td></tr>)}</tbody></table></div>
            <footer className="la-table-footer"><span>{nearRows.length.toLocaleString()} associated form{nearRows.length === 1 ? '' : 's'}</span><div className="la-pager"><button disabled={nearPage <= 1} onClick={() => setNearPage(page => Math.max(1, page - 1))}>←</button><span>{nearStart}–{nearEnd}</span><button disabled={nearPage >= nearMaxPage} onClick={() => setNearPage(page => Math.min(nearMaxPage, page + 1))}>→</button></div></footer>
          </article>

          <article className="la-panel la-ngram-panel">
            <header><div><h2>Recurring sequences <button className="la-info" onClick={() => { setNoteKey('sequences'); setNoteOpen(true); }}>ⓘ</button></h2><p>Contiguous n-grams built inside analytic segment boundaries{ngramRows.length ? ` · ${ngramStart}–${ngramEnd} of ${ngramRows.length.toLocaleString()}` : ''}</p></div>{ngramRows.length > 0 && <div className="la-pager"><button disabled={ngramPage <= 1} onClick={() => setNgramPage(page => Math.max(1, page - 1))}>←</button><span>{ngramPage}/{ngramMaxPage}</span><button disabled={ngramPage >= ngramMaxPage} onClick={() => setNgramPage(page => Math.min(ngramMaxPage, page + 1))}>→</button></div>}</header>
            <div className="la-ngram-controls"><label className="la-ngram-length">Length<select value={ngramN} onChange={event => setNgramN(Number(event.target.value))}>{[2,3,4,5].map(n => <option key={n} value={n}>{n} words</option>)}</select></label><label>Min. occurrences<input type="number" min={1} value={ngramMinCount} onChange={event => setNgramMinCount(Math.max(1, Number(event.target.value) || 1))} /></label><label>Min. entries<input type="number" min={1} value={ngramMinEntries} onChange={event => setNgramMinEntries(Math.max(1, Number(event.target.value) || 1))} /></label><label className="la-mini-check"><input type="checkbox" checked={ngramFocusOnly} onChange={event => setNgramFocusOnly(event.target.checked)} /> must contain current focus</label><button className="la-ngram-run" onClick={runNgrams}>Run sequence analysis</button></div>
            {ngramRows.length ? <><div className="la-table-wrap la-paged-table"><table><thead><tr><th>Sequence</th><th>Occurrences</th><th>Entries</th><th>Examples</th></tr></thead><tbody>{ngramSlice.map(row => <tr key={row.sequence}><td><strong>{row.sequence}</strong></td><td>{row.count}</td><td>{row.entries}</td><td><small>{row.examples.join(' · ')}</small></td></tr>)}</tbody></table></div><footer className="la-table-footer"><span>{ngramRows.length.toLocaleString()} matching sequence{ngramRows.length === 1 ? '' : 's'}</span><div className="la-pager"><button disabled={ngramPage <= 1} onClick={() => setNgramPage(page => Math.max(1, page - 1))}>←</button><span>{ngramStart}–{ngramEnd}</span><button disabled={ngramPage >= ngramMaxPage} onClick={() => setNgramPage(page => Math.min(ngramMaxPage, page + 1))}>→</button></div></footer></> : <div className="la-empty">Choose the parameters and run the sequence analysis.</div>}
          </article>
        </section>}

        {tab === 'compare' && <section className="la-compare-area">
          <div className="la-compare-selectors">
            <article className="la-compare-card x"><span>CORPUS X</span><div><label>Pages from<input type="number" value={xFrom} onChange={event => setXFrom(event.target.value === '' ? '' : Number(event.target.value))} /></label><label>to<input type="number" value={xTo} onChange={event => setXTo(event.target.value === '' ? '' : Number(event.target.value))} /></label><label>Typology<select value={xTypology} onChange={event => setXTypology(event.target.value)}><option value="all">All</option>{payload.typologies.map(type => <option value={type} key={type}>{type}</option>)}</select></label></div><small>N {compareData.sx.N.toLocaleString()} · D {compareData.sx.D.toLocaleString()}</small></article>
            <div className="la-compare-vs">VS</div>
            <article className="la-compare-card y"><span>CORPUS Y</span><label className="la-rest-switch"><input type="checkbox" checked={compareRest} onChange={event => setCompareRest(event.target.checked)} /> selection against rest of filtered dictionary</label>{!compareRest && <div><label>Pages from<input type="number" value={yFrom} onChange={event => setYFrom(event.target.value === '' ? '' : Number(event.target.value))} /></label><label>to<input type="number" value={yTo} onChange={event => setYTo(event.target.value === '' ? '' : Number(event.target.value))} /></label><label>Typology<select value={yTypology} onChange={event => setYTypology(event.target.value)}><option value="all">All</option>{payload.typologies.map(type => <option value={type} key={type}>{type}</option>)}</select></label></div>}<small>N {compareData.sy.N.toLocaleString()} · D {compareData.sy.D.toLocaleString()}</small></article>
          </div>
          {compareData.overlap > 0 && <div className="la-warning">⚠ X and Y overlap by {compareData.overlap.toLocaleString()} entries. Descriptive results remain visible, but independent-sample statistical tests would not be appropriate.</div>}
          <article className="la-panel la-compare-results">
            <header><div><h2>More / less frequent by portion <button className="la-info" onClick={() => { setNoteKey('comparison'); setNoteOpen(true); }}>ⓘ</button></h2><p>Normalized descriptive comparison · {compareStart}–{compareEnd} of {compareData.rows.length.toLocaleString()} forms</p></div><div className="la-panel-head-tools la-compare-head-tools"><div className="la-view-switch"><button className={compareView === 'x' ? 'active' : ''} onClick={() => { setCompareView('x'); setComparePage(1); }}>More in X</button><button className={compareView === 'y' ? 'active' : ''} onClick={() => { setCompareView('y'); setComparePage(1); }}>More in Y</button><button className={compareView === 'onlyX' ? 'active' : ''} onClick={() => { setCompareView('onlyX'); setComparePage(1); }}>Only X</button><button className={compareView === 'onlyY' ? 'active' : ''} onClick={() => { setCompareView('onlyY'); setComparePage(1); }}>Only Y</button></div><div className="la-pager"><button disabled={comparePage <= 1} onClick={() => setComparePage(page => Math.max(1, page - 1))}>←</button><span>{comparePage}/{compareMaxPage}</span><button disabled={comparePage >= compareMaxPage} onClick={() => setComparePage(page => Math.min(compareMaxPage, page + 1))}>→</button></div></div></header>
            <div className="la-table-wrap la-paged-table"><table className="la-compare-table"><thead><tr><th>Form</th><th>X count</th><th>X / 10k</th><th>Y count</th><th>Y / 10k</th><th>Δ / 10k</th><th>Ratio</th><th>log-ratio</th></tr></thead><tbody>{compareSlice.map(row => <tr key={row.form}><td><button className="la-table-link" onClick={() => { setFocus({ kind: 'form', value: row.form }); setWordQuery(row.form); setTab('words'); setConcordancePage(1); }}>{row.form}</button></td><td>{row.fX}</td><td>{fmt(row.normX, 2)}</td><td>{row.fY}</td><td>{fmt(row.normY, 2)}</td><td className={(row.delta ?? 0) >= 0 ? 'positive' : 'negative'}>{fmt(row.delta, 2)}</td><td>{row.fY === 0 && row.fX > 0 ? 'only X' : row.fX === 0 && row.fY > 0 ? 'only Y' : fmt(row.ratio, 2)}</td><td>{fmt(row.logRatio, 2)}</td></tr>)}</tbody></table></div>
            <footer className="la-table-footer"><span>{compareData.rows.length.toLocaleString()} matching forms</span><div className="la-pager"><button disabled={comparePage <= 1} onClick={() => setComparePage(page => Math.max(1, page - 1))}>←</button><span>{compareStart}–{compareEnd}</span><button disabled={comparePage >= compareMaxPage} onClick={() => setComparePage(page => Math.min(compareMaxPage, page + 1))}>→</button></div></footer>
          </article>
        </section>}
      </section>

      {noteOpen && <aside className="la-note-panel">
        <button className="la-note-close" onClick={() => setNoteOpen(false)} aria-label="Close analysis note">×</button>
        <p className="la-note-eyebrow">ANALYSIS NOTE</p>
        <h2>{note.title}</h2><span className="la-note-tag">{note.eyebrow}</span>
        <section><h3>PURPOSE</h3><p>{note.purpose}</p></section>
        <section><h3>METHOD</h3><div className="la-method-box">{note.method.map(line => <p key={line}>{line}</p>)}</div></section>
        <section><h3>HOW TO READ</h3><ul>{note.read.map(line => <li key={line}>{line}</li>)}</ul></section>
        {note.refs.length > 0 && <section><h3>REFERENCES</h3><div className="la-ref-list">{(note.refs as readonly (readonly [string, string, string])[]).map(([id, label, href]) => <a key={id} href={href} target="_blank" rel="noreferrer"><span>[{id}]</span>{label}<b>↗</b></a>)}</div></section>}
        <div className="la-note-actions"><a href={withBase('/documentation')}>Open documentation</a><button onClick={() => { setTab('words'); setNoteKey('concordance'); }}>View evidence</button></div>
      </aside>}

      {groupOpen && <div className="la-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setGroupOpen(false); }}><section className="la-modal" role="dialog" aria-modal="true" aria-labelledby="group-editor-title"><button className="la-modal-close" onClick={() => setGroupOpen(false)}>×</button><p className="la-kicker"><span>WORD GROUPS</span><i>/</i><strong>SESSION</strong></p><h2 id="group-editor-title">Define what to search</h2><p>Groups are explicit OR-lists of forms. Their labels do not imply validated lemmatisation.</p><label>Group label<input value={groupLabel} onChange={event => setGroupLabel(event.target.value)} placeholder="e.g. Totality" /></label><label>Forms<textarea value={groupFormsInput} onChange={event => setGroupFormsInput(event.target.value)} placeholder="totus, tota, totum, toto, totam" rows={4} /></label><div className="la-modal-actions"><button onClick={saveGroup}>Add group</button><button className="secondary" onClick={() => download('chind-latin-word-groups.json', JSON.stringify(groups, null, 2), 'application/json')}>Export JSON</button></div>{groups.length > 0 && <div className="la-group-list">{groups.map(group => <div key={group.id}><span><strong>{group.label}</strong><small>{group.forms.join(', ')}</small></span><button onClick={() => setGroups(current => current.filter(item => item.id !== group.id))}>Remove</button></div>)}</div>}</section></div>}

      {exclusionOpen && <div className="la-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setExclusionOpen(false); }}><section className="la-modal la-exclusion-modal" role="dialog" aria-modal="true" aria-labelledby="exclusion-title"><button className="la-modal-close" onClick={() => setExclusionOpen(false)}>×</button><p className="la-kicker"><span>CORPUS</span><i>/</i><strong>WORD EXCLUSIONS</strong></p><h2 id="exclusion-title">Exclude forms from analysis</h2><p>Custom exclusions affect denominators, rankings, comparisons, concordances and local-context analyses. Excluded forms also act as boundaries for recurring sequences and nearby-word windows, so removing a function word never creates artificial adjacency.</p><label>Forms to exclude<textarea value={exclusionInput} onChange={event => setExclusionInput(event.target.value)} placeholder="e.g. forma1, forma2, forma3" rows={3} /></label><div className="la-modal-actions"><button onClick={addCustomExclusions}>Add exclusions</button><button className="secondary" onClick={() => setCustomExclusions([])} disabled={!customExclusions.length}>Clear custom list</button></div><div className="la-exclusion-info"><section><h3>Always excluded</h3><p>Any one-letter form; {[...FIXED_ANALYSIS_EXCLUSIONS].join(', ')}</p><small>Minimum analytical word length: 2 letters. Technical/editorial artefacts cannot be restored from the interface.</small></section><section><h3>Function words</h3><p>{[...LATIN_FUNCTION_WORDS].join(', ')}</p><small>{includeFunctionWords ? 'Currently included in analyses.' : 'Excluded by default. Use “Include function words” in the filter bar to restore them.'}</small></section></div><section className="la-custom-exclusions"><h3>Custom exclusions</h3>{customExclusions.length ? <div className="la-exclusion-chips">{customExclusions.map(form => <button key={form} type="button" title={`Remove ${form}`} onClick={() => setCustomExclusions(current => current.filter(item => item !== form))}><span>{form}</span>×</button>)}</div> : <p className="la-empty-inline">No custom exclusions have been added.</p>}</section></section></div>}

      {cleaningOpen && <div className="la-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setCleaningOpen(false); }}><section className="la-modal la-cleaning-modal" role="dialog" aria-modal="true" aria-labelledby="cleaning-title"><button className="la-modal-close" onClick={() => setCleaningOpen(false)}>×</button><p className="la-kicker"><span>CORPUS</span><i>/</i><strong>TEXT CLEANING</strong></p><h2 id="cleaning-title">Romanisation exclusion preview</h2><p>{payload.stats.excludedCandidates.toLocaleString()} candidates were excluded from the whole corpus because they carry the configured romanisation markers. The table shows a limited audit sample.</p><div className="la-clean-rules"><span>Whole token excluded</span><span>Unicode NFC for accepted forms</span><span>§ and strong punctuation break segments</span><span>No u/v or i/j merging</span></div><div className="la-table-wrap"><table><thead><tr><th>Candidate</th><th>Reason</th><th>Context</th><th>Locus</th></tr></thead><tbody>{payload.cleaningPreview.map((row, index) => <tr key={`${row.entryId}-${index}`}><td><code>{row.raw}</code></td><td>{row.reason}</td><td>{row.context}</td><td>{row.page == null ? 'unlocated' : `p. ${row.page}${row.line ? ` · l. ${row.line}` : ''}`}</td></tr>)}</tbody></table></div></section></div>}
    </main>
  );
}
