import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { CharacterLocus, CharacterRecord, CharacterReading, CharacterVariant, CharactersPayload, CharactersLatinPayload, LatinDefinitionRecord } from './types';
import './characters.css';
import { withBase } from '../chind/paths';

type Mode = 'modern' | 'source';
type CellSelection = { radical: string; stroke: string } | null;
type Assignment = { radical: string; stroke: string; count: number };
type RadicalComparison = {
  same: number;
  different: number;
  unknown: number;
  total: number;
  samePct: number;
  differentPct: number;
  unknownPct: number;
};
type RadicalComparisonClass = 'same' | 'different' | 'unknown';

let payloadPromise: Promise<CharactersPayload> | null = null;
let latinPayloadPromise: Promise<CharactersLatinPayload> | null = null;

function loadPayload(): Promise<CharactersPayload> {
  if (!payloadPromise) {
    payloadPromise = fetch(withBase('/data/characters-index.json'))
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error || `Character index request failed (${response.status})`);
        return body as CharactersPayload;
      });
  }
  return payloadPromise;
}

function loadLatinPayload(): Promise<CharactersLatinPayload> {
  if (!latinPayloadPromise) {
    latinPayloadPromise = fetch(withBase('/data/characters-latin.json'))
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error || `Latin-definition index request failed (${response.status})`);
        return body as CharactersLatinPayload;
      });
  }
  return latinPayloadPromise;
}

function text(value: unknown): string {
  return value == null ? '' : String(value);
}

function normalizeSearch(value: unknown): string {
  return text(value)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function naturalCompare(a: unknown, b: unknown): number {
  return text(a).localeCompare(text(b), undefined, { numeric: true, sensitivity: 'base' });
}

function useDebouncedValue<T>(value: T, delay = 220): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(handle);
  }, [value, delay]);
  return debounced;
}

function strokeKey(value: unknown): string {
  if (value == null || value === '') return '∅';
  return text(value);
}

function radicalKey(value: unknown): string {
  const valueText = text(value).trim();
  return valueText || '∅';
}

function assignmentsForCharacter(character: CharacterRecord, mode: Mode): Assignment[] {
  const map = new Map<string, Assignment>();

  if (mode === 'modern') {
    // For the current reconstruction, stroke classes come from occ.n_strokes.
    // The radical is still the explicit modern semantic radical.
    if (!character.semanticRadical) return [];
    const radical = radicalKey(character.semanticRadical);
    for (const locus of character.loci) {
      const stroke = strokeKey(locus.historicalStrokes);
      const key = `${radical}\u0000${stroke}`;
      const existing = map.get(key) ?? { radical, stroke, count: 0 };
      existing.count += locus.count;
      map.set(key, existing);
    }
    return Array.from(map.values());
  }

  for (const locus of character.loci) {
    if (!locus.sourceRadical) continue;
    const radical = radicalKey(locus.sourceRadical);
    const stroke = strokeKey(locus.historicalStrokes);
    const key = `${radical}\u0000${stroke}`;
    const existing = map.get(key) ?? { radical, stroke, count: 0 };
    existing.count += locus.count;
    map.set(key, existing);
  }
  return Array.from(map.values());
}

function classifyRadicalComparison(character: CharacterRecord, loci: CharacterLocus[]): RadicalComparisonClass {
  const modernRadical = text(character.semanticRadical).trim();
  if (!modernRadical) return 'unknown';
  const sourceRadicals = Array.from(new Set(
    loci.map(locus => text(locus.sourceRadical).trim()).filter(Boolean)
  ));
  if (!sourceRadicals.length) return 'unknown';
  // Conservative change metric: one documented divergence is enough to classify
  // the character as "different". "Same" means all known source assignments agree.
  return sourceRadicals.some(radical => radical !== modernRadical) ? 'different' : 'same';
}

function summarizeRadicalComparison(items: Array<{ character: CharacterRecord; loci: CharacterLocus[] }>): RadicalComparison | null {
  if (!items.length) return null;
  let same = 0;
  let different = 0;
  let unknown = 0;
  for (const item of items) {
    const classification = classifyRadicalComparison(item.character, item.loci);
    if (classification === 'same') same += 1;
    else if (classification === 'different') different += 1;
    else unknown += 1;
  }
  const total = same + different + unknown;
  if (!total) return null;
  return {
    same,
    different,
    unknown,
    total,
    samePct: (same / total) * 100,
    differentPct: (different / total) * 100,
    unknownPct: (unknown / total) * 100,
  };
}

function RadicalDonut({ title, comparison }: { title: string; comparison: RadicalComparison | null }) {
  if (!comparison) {
    return <div className="chr-compare-card unavailable"><strong>{title}</strong><span>No comparable characters.</span></div>;
  }
  const sameEnd = comparison.samePct;
  const differentEnd = comparison.samePct + comparison.differentPct;
  const style = {
    '--same-end': `${sameEnd}%`,
    '--different-end': `${differentEnd}%`,
  } as CSSProperties;
  const tooltip = `${comparison.total} distinct characters · ${comparison.same} same · ${comparison.different} different · ${comparison.unknown} unknown`;
  return (
    <div className="chr-compare-card">
      <strong>{title}</strong>
      <div className="chr-donut" style={style} title={tooltip} aria-label={tooltip}>
        <span><b>{comparison.samePct.toFixed(1)}%</b><small>same</small></span>
      </div>
      <small>{comparison.total} distinct character{comparison.total === 1 ? '' : 's'}</small>
    </div>
  );
}

function readingMatchesFilters(reading: CharacterReading, historical: string, modern: string, meaning: string): boolean {
  if (historical) {
    const haystack = normalizeSearch([reading.historical, reading.simpleHistorical].filter(Boolean).join(' '));
    if (!haystack.includes(historical)) return false;
  }
  if (modern && !normalizeSearch(reading.modern).includes(modern)) return false;
  if (meaning && !normalizeSearch(reading.english).includes(meaning)) return false;
  return true;
}

function characterMatchesText(character: CharacterRecord, historical: string, modern: string, meaning: string): boolean {
  if (!historical && !modern && !meaning) return true;
  return character.readings.some(reading => readingMatchesFilters(reading, historical, modern, meaning));
}

function locusMatchesScope(locus: CharacterLocus, mode: Mode, radical: string, stroke: string): boolean {
  if (mode === 'source') {
    if (radical && radicalKey(locus.sourceRadical) !== radical) return false;
    if (stroke && strokeKey(locus.historicalStrokes) !== stroke) return false;
  }
  return true;
}

function scopedLoci(character: CharacterRecord, mode: Mode, radical: string, stroke: string): CharacterLocus[] {
  if (mode === 'modern') {
    if (!character.semanticRadical) return [];
    if (radical && radicalKey(character.semanticRadical) !== radical) return [];
    return character.loci.filter(locus => !stroke || strokeKey(locus.historicalStrokes) === stroke);
  }
  return character.loci.filter(locus => locusMatchesScope(locus, mode, radical, stroke));
}

function countLoci(loci: CharacterLocus[]): number {
  return new Set(loci.map(locus => [locus.dictionaryId ?? '', locus.page ?? '', locus.line ?? ''].join('|'))).size;
}

function Glyph({ character, compact = false }: { character: CharacterRecord; compact?: boolean }) {
  const glyph = character.displayCharacter || character.simplified || '—';
  if (character.formalism && character.glyphLink) {
    return (
      <a
        className={compact ? 'chr-glyph chr-glyph-compact' : 'chr-glyph'}
        href={character.glyphLink}
        target="_blank"
        rel="noreferrer"
        title="Non-standard encoded form: open linked glyph resource"
      >{glyph}</a>
    );
  }
  return <span className={compact ? 'chr-glyph chr-glyph-compact' : 'chr-glyph'}>{glyph}</span>;
}

function MiniBars({ values, maxBars = 48, label }: { values: Array<[number, number]>; maxBars?: number; label: string }) {
  if (!values.length) return <div className="chr-chart-empty">No data in current selection.</div>;
  const sorted = [...values].sort((a, b) => a[0] - b[0]);
  const stride = Math.max(1, Math.ceil(sorted.length / maxBars));
  const sampled: Array<[number, number]> = [];
  for (let i = 0; i < sorted.length; i += stride) {
    const chunk = sorted.slice(i, i + stride);
    sampled.push([chunk[0][0], chunk.reduce((sum, [, value]) => sum + value, 0)]);
  }
  const max = Math.max(...sampled.map(([, value]) => value), 1);
  return (
    <div className="chr-mini-bars" role="img" aria-label={label}>
      {sampled.map(([page, value]) => (
        <span key={page} style={{ height: `${Math.max(3, (value / max) * 100)}%` }} title={`p. ${page}: ${value}`} />
      ))}
    </div>
  );
}

function SparkLine({ values, label }: { values: Array<[number, number]>; label: string }) {
  if (!values.length) return <div className="chr-chart-empty">No data.</div>;
  const sorted = [...values].sort((a, b) => a[0] - b[0]);
  const minX = sorted[0][0];
  const maxX = sorted[sorted.length - 1][0];
  const maxY = Math.max(...sorted.map(([, y]) => y), 1);
  const points = sorted.map(([x, y]) => {
    const px = maxX === minX ? 0 : ((x - minX) / (maxX - minX)) * 100;
    const py = 36 - (y / maxY) * 30;
    return `${px},${py}`;
  }).join(' ');
  return (
    <svg className="chr-spark" viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={label}>
      <line x1="0" y1="36" x2="100" y2="36" />
      <polyline points={points} />
    </svg>
  );
}

function formatLocus(locus: CharacterLocus): string {
  const dictionary = locus.dictionaryId ? `${locus.dictionaryId} · ` : '';
  return `${dictionary}p. ${locus.page ?? '—'} · l. ${locus.line ?? '—'}`;
}

function earliestLocus(character: CharacterRecord, mode: Mode, radical: string, stroke: string): CharacterLocus | null {
  const loci = scopedLoci(character, mode, radical, stroke);
  if (!loci.length) return null;
  return [...loci].sort((a, b) =>
    naturalCompare(a.dictionaryId, b.dictionaryId)
    || naturalCompare(a.page, b.page)
    || naturalCompare(a.line, b.line)
  )[0] ?? null;
}

function compareCharactersByFirstAttestation(a: CharacterRecord, b: CharacterRecord, mode: Mode, radical: string, stroke: string): number {
  const al = earliestLocus(a, mode, radical, stroke);
  const bl = earliestLocus(b, mode, radical, stroke);
  return naturalCompare(al?.dictionaryId, bl?.dictionaryId)
    || naturalCompare(al?.page, bl?.page)
    || naturalCompare(al?.line, bl?.line)
    || naturalCompare(a.displayCharacter, b.displayCharacter);
}

function VariantGlyph({ variant }: { variant: CharacterVariant }) {
  const glyph = variant.displayCharacter || variant.simplified || '—';
  if (variant.formalism && variant.glyphLink) {
    return <a className="chr-variant-glyph" href={variant.glyphLink} target="_blank" rel="noreferrer">{glyph}</a>;
  }
  return <span className="chr-variant-glyph">{glyph}</span>;
}

function LatinDefinitionList({ definitions, compact = false }: { definitions: LatinDefinitionRecord[]; compact?: boolean }) {
  if (!definitions.length) return null;
  const visible = compact ? definitions.slice(0, 1) : definitions;
  return (
    <div className={compact ? 'chr-latin-list compact' : 'chr-latin-list'}>
      {visible.map((definition, index) => (
        <div className="chr-latin-definition" key={`${definition.readingId}:${definition.typology ?? ''}:${index}`}>
          {definition.typology && <span className="chr-latin-typology">{definition.typology}</span>}
          <div className="chr-latin-html" dangerouslySetInnerHTML={{ __html: definition.html }} />
          {!compact && definition.occurrenceCount > 1 && <small>{definition.occurrenceCount} attestations</small>}
        </div>
      ))}
      {compact && definitions.length > 1 && <span className="chr-latin-more">+{definitions.length - 1} more</span>}
    </div>
  );
}

export default function CharacterExplorer() {
  const [payload, setPayload] = useState<CharactersPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [locationReady, setLocationReady] = useState(false);

  const [mode, setMode] = useState<Mode>('source');
  const [historicalQuery, setHistoricalQuery] = useState('');
  const [modernQuery, setModernQuery] = useState('');
  const [meaningQuery, setMeaningQuery] = useState('');
  const [radicalSearch, setRadicalSearch] = useState('');
  const [selectedRadical, setSelectedRadical] = useState('');
  const [selectedStroke, setSelectedStroke] = useState('');
  const [selectedCell, setSelectedCell] = useState<CellSelection>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState('');
  const [selectedReadingId, setSelectedReadingId] = useState('');
  const [cellPage, setCellPage] = useState(0);
  const [cellCarousel, setCellCarousel] = useState<Record<string, number>>({});
  const [inspectorClosed, setInspectorClosed] = useState(false);
  const [latinPayload, setLatinPayload] = useState<CharactersLatinPayload | null>(null);
  const [latinRequestedReadingId, setLatinRequestedReadingId] = useState('');
  const [latinLoading, setLatinLoading] = useState(false);
  const [latinError, setLatinError] = useState<string | null>(null);

  const historicalFilter = useDebouncedValue(normalizeSearch(historicalQuery));
  const modernFilter = useDebouncedValue(normalizeSearch(modernQuery));
  const meaningFilter = useDebouncedValue(normalizeSearch(meaningQuery));
  const radicalFilterText = useDebouncedValue(normalizeSearch(radicalSearch));

  useEffect(() => {
    let alive = true;
    loadPayload()
      .then(data => {
        if (!alive) return;
        setPayload(data);
        setLoading(false);
      })
      .catch(err => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!latinRequestedReadingId || latinPayload) return;
    let alive = true;
    setLatinLoading(true);
    setLatinError(null);
    loadLatinPayload()
      .then(data => {
        if (!alive) return;
        setLatinPayload(data);
        setLatinLoading(false);
      })
      .catch(err => {
        if (!alive) return;
        setLatinError(err instanceof Error ? err.message : String(err));
        setLatinLoading(false);
      });
    return () => { alive = false; };
  }, [latinRequestedReadingId, latinPayload]);

  useEffect(() => {
    if (!payload || locationReady) return;
    const params = new URLSearchParams(window.location.search);
    const requestedMode: Mode = params.get('mode') === 'modern' ? 'modern' : 'source';
    setMode(requestedMode === 'source' && !payload.sourceModeAvailable ? 'modern' : requestedMode);
    setHistoricalQuery(params.get('hrom') || '');
    setModernQuery(params.get('mrom') || '');
    setMeaningQuery(params.get('meaning') || '');
    setSelectedRadical(params.get('radical') || '');
    setSelectedStroke(params.get('strokes') || '');
    const cellRadical = params.get('cellRadical');
    const cellStroke = params.get('cellStroke');
    if (cellRadical && cellStroke) setSelectedCell({ radical: cellRadical, stroke: cellStroke });
    setSelectedCharacterId(params.get('character') || '');
    setSelectedReadingId(params.get('reading') || '');
    setLocationReady(true);
  }, [payload, locationReady]);

  useEffect(() => {
    if (!locationReady) return;
    const url = new URL(window.location.href);
    const setOrDelete = (name: string, value: string) => value ? url.searchParams.set(name, value) : url.searchParams.delete(name);
    setOrDelete('mode', mode === 'modern' ? 'modern' : '');
    setOrDelete('hrom', historicalQuery);
    setOrDelete('mrom', modernQuery);
    setOrDelete('meaning', meaningQuery);
    setOrDelete('radical', selectedRadical);
    setOrDelete('strokes', selectedStroke);
    setOrDelete('cellRadical', selectedCell?.radical || '');
    setOrDelete('cellStroke', selectedCell?.stroke || '');
    setOrDelete('character', selectedCharacterId);
    setOrDelete('reading', selectedReadingId);
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }, [locationReady, mode, historicalQuery, modernQuery, meaningQuery, selectedRadical, selectedStroke, selectedCell, selectedCharacterId, selectedReadingId]);

  const textFiltered = useMemo(() => (payload?.data ?? []).filter(character =>
    characterMatchesText(character, historicalFilter, modernFilter, meaningFilter)
  ), [payload, historicalFilter, modernFilter, meaningFilter]);

  const radicalFamilies = useMemo(() => {
    const byRadical = new Map<string, number>();
    for (const character of textFiltered) {
      for (const assignment of assignmentsForCharacter(character, mode)) {
        if (selectedStroke && assignment.stroke !== selectedStroke) continue;
        byRadical.set(assignment.radical, (byRadical.get(assignment.radical) ?? 0) + assignment.count);
      }
    }
    return Array.from(byRadical.entries())
      .map(([radical, count]) => ({ radical, count }))
      .filter(item => !radicalFilterText || normalizeSearch(item.radical).includes(radicalFilterText))
      .sort((a, b) => (b.count - a.count) || naturalCompare(a.radical, b.radical));
  }, [textFiltered, mode, selectedStroke, radicalFilterText]);

  const maxRadicalFamilyAttestations = useMemo(
    () => Math.max(1, ...radicalFamilies.map(item => item.count)),
    [radicalFamilies]
  );

  const scopedCharacters = useMemo(() => textFiltered.filter(character => {
    const assignments = assignmentsForCharacter(character, mode);
    return assignments.some(assignment =>
      (!selectedRadical || assignment.radical === selectedRadical)
      && (!selectedStroke || assignment.stroke === selectedStroke)
    );
  }), [textFiltered, mode, selectedRadical, selectedStroke]);

  const strokes = useMemo(() => {
    const values = new Set<string>();
    for (const character of textFiltered) {
      for (const assignment of assignmentsForCharacter(character, mode)) {
        if (selectedRadical && assignment.radical !== selectedRadical) continue;
        values.add(assignment.stroke);
      }
    }
    return Array.from(values).sort((a, b) => {
      if (a === '∅') return 1;
      if (b === '∅') return -1;
      return naturalCompare(a, b);
    });
  }, [textFiltered, mode, selectedRadical]);

  const matrixRadicals = useMemo(() => {
    const allowed = new Set(radicalFamilies.map(item => item.radical));
    const values = selectedRadical ? [selectedRadical] : Array.from(allowed);
    return values.sort((a, b) => {
      const ac = radicalFamilies.find(item => item.radical === a)?.count ?? 0;
      const bc = radicalFamilies.find(item => item.radical === b)?.count ?? 0;
      return (bc - ac) || naturalCompare(a, b);
    });
  }, [radicalFamilies, selectedRadical]);

  const matrix = useMemo(() => {
    const cells = new Map<string, Array<{ character: CharacterRecord; count: number }>>();
    for (const character of scopedCharacters) {
      for (const assignment of assignmentsForCharacter(character, mode)) {
        if (selectedRadical && assignment.radical !== selectedRadical) continue;
        if (selectedStroke && assignment.stroke !== selectedStroke) continue;
        const k = `${assignment.radical}\u0000${assignment.stroke}`;
        const list = cells.get(k) ?? [];
        list.push({ character, count: assignment.count });
        cells.set(k, list);
      }
    }
    for (const [cellKey, list] of cells.entries()) {
      const [radical, stroke] = cellKey.split('\u0000');
      list.sort((a, b) => compareCharactersByFirstAttestation(a.character, b.character, mode, radical, stroke));
    }
    return cells;
  }, [scopedCharacters, mode, selectedRadical, selectedStroke]);

  const matrixIntensity = useMemo(() => {
    const totals = new Map<string, number>();
    for (const [cellKey, entries] of matrix.entries()) {
      totals.set(cellKey, entries.reduce((sum, entry) => sum + entry.count, 0));
    }
    const positive = Array.from(totals.values()).filter(value => value > 0);
    return {
      totals,
      min: positive.length ? Math.min(...positive) : 0,
      max: positive.length ? Math.max(...positive) : 0,
    };
  }, [matrix]);

  useEffect(() => {
    if (!selectedCell && matrixRadicals.length && strokes.length) {
      for (const radical of matrixRadicals) {
        const found = strokes.find(stroke => matrix.has(`${radical}\u0000${stroke}`));
        if (found) {
          setSelectedCell({ radical, stroke: found });
          break;
        }
      }
    }
  }, [matrixRadicals, strokes, matrix, selectedCell]);

  const cellCharacters = useMemo(() => {
    if (!selectedCell) return [];
    return matrix.get(`${selectedCell.radical}\u0000${selectedCell.stroke}`) ?? [];
  }, [matrix, selectedCell]);

  const cellResults = useMemo(() => {
    if (!selectedCell) return [];
    const out: Array<{
      character: CharacterRecord;
      reading: CharacterReading;
      occurrenceCount: number;
      loci: CharacterLocus[];
    }> = [];
    for (const item of cellCharacters) {
      for (const reading of item.character.readings) {
        const loci = scopedLoci(item.character, mode, selectedCell.radical, selectedCell.stroke)
          .filter(locus => locus.readingId === reading.id);
        const count = loci.reduce((sum, locus) => sum + locus.count, 0);
        if (count === 0) continue;
        out.push({ character: item.character, reading, occurrenceCount: count, loci });
      }
    }
    return out.sort((a, b) => (b.occurrenceCount - a.occurrenceCount) || naturalCompare(a.character.displayCharacter, b.character.displayCharacter) || naturalCompare(a.reading.historical, b.reading.historical));
  }, [cellCharacters, selectedCell, mode]);

  const CELL_PAGE_SIZE = 6;
  const cellPageCount = Math.max(1, Math.ceil(cellResults.length / CELL_PAGE_SIZE));
  const visibleCellResults = cellResults.slice(cellPage * CELL_PAGE_SIZE, (cellPage + 1) * CELL_PAGE_SIZE);

  useEffect(() => {
    setCellPage(0);
  }, [selectedCell]);

  const selectedCharacter = useMemo(() => {
    if (!payload || inspectorClosed) return null;
    return payload.data.find(character => character.id === selectedCharacterId)
      ?? cellCharacters[0]?.character
      ?? null;
  }, [payload, selectedCharacterId, cellCharacters, inspectorClosed]);

  useEffect(() => {
    if (!selectedCharacter) return;
    if (selectedCharacter.id !== selectedCharacterId) setSelectedCharacterId(selectedCharacter.id);
    const valid = selectedCharacter.readings.some(reading => reading.id === selectedReadingId && reading.occurrenceCount > 0);
    if (!valid) {
      const first = selectedCharacter.readings.find(reading => reading.occurrenceCount > 0) ?? selectedCharacter.readings[0];
      setSelectedReadingId(first?.id || '');
    }
  }, [selectedCharacter, selectedCharacterId, selectedReadingId]);

  const selectedReading = selectedCharacter?.readings.find(reading => reading.id === selectedReadingId)
    ?? selectedCharacter?.readings.find(reading => reading.occurrenceCount > 0)
    ?? selectedCharacter?.readings[0]
    ?? null;

  const selectedLatinDefinitions = useMemo(() => {
    if (!selectedReading || !latinPayload) return [];
    return latinPayload.data
      .filter(item => item.readingId === selectedReading.id)
      .sort((a, b) => naturalCompare(a.typology, b.typology) || naturalCompare(a.html, b.html));
  }, [selectedReading, latinPayload]);

  const selectedLoci = useMemo(() => {
    if (!selectedCharacter) return [];
    const rows = selectedCharacter.loci.filter(locus => !selectedReading || locus.readingId === selectedReading.id);
    return rows.sort((a, b) => naturalCompare(a.dictionaryId, b.dictionaryId) || naturalCompare(a.page, b.page) || naturalCompare(a.line, b.line));
  }, [selectedCharacter, selectedReading]);

  const selectedStrokeValues = useMemo(() => Array.from(new Set(
    selectedLoci.map(locus => strokeKey(locus.historicalStrokes))
  )).sort(naturalCompare), [selectedLoci]);


  const selectedCellRadicalComparison = useMemo(() => {
    if (!selectedCell) return null;
    return summarizeRadicalComparison(cellCharacters.map(item => ({
      character: item.character,
      loci: scopedLoci(item.character, mode, selectedCell.radical, selectedCell.stroke),
    })));
  }, [selectedCell, cellCharacters, mode]);

  const comparisonModernRadical = useMemo(() => {
    if (mode === 'modern' && selectedCell?.radical) return selectedCell.radical;
    return selectedCharacter?.semanticRadical?.trim() || null;
  }, [mode, selectedCell, selectedCharacter]);

  const wholeModernRadicalComparison = useMemo(() => {
    if (!payload || !comparisonModernRadical) return null;
    const characters = payload.data.filter(character => character.semanticRadical?.trim() === comparisonModernRadical);
    return summarizeRadicalComparison(characters.map(character => ({ character, loci: character.loci })));
  }, [payload, comparisonModernRadical]);

  const missingModernRadicalCount = useMemo(
    () => textFiltered.filter(character => !character.semanticRadical?.trim()).length,
    [textFiltered]
  );


  const analytics = useMemo(() => {
    const pageCounts = new Map<number, number>();
    const radicalCounts = new Map<string, number>();
    const strokeCounts = new Map<string, number>();
    const physicalPages = new Set<number>();
    let attestations = 0;
    let lociCount = 0;
    let maxObservedLine = 0;

    const heat = new Map<string, number>();
    const minPage = payload?.totals.minPage ?? 1;
    const maxPage = payload?.totals.maxPage ?? minPage;
    const BIN_COUNT = 18;
    const span = Math.max(1, maxPage - minPage + 1);
    const binWidth = Math.max(1, Math.ceil(span / BIN_COUNT));
    const histogram = Array.from({ length: BIN_COUNT }, (_, index) => ({
      start: minPage + index * binWidth,
      end: Math.min(maxPage, minPage + (index + 1) * binWidth - 1),
      count: 0,
    })).filter(bin => bin.start <= maxPage);

    for (const character of scopedCharacters) {
      const loci = scopedLoci(character, mode, selectedRadical, selectedStroke);
      const scopedCount = loci.reduce((sum, locus) => sum + locus.count, 0);
      if (!scopedCount) continue;
      attestations += scopedCount;
      lociCount += countLoci(loci);

      const radicalAssignments = assignmentsForCharacter(character, mode)
        .filter(item => (!selectedRadical || item.radical === selectedRadical) && (!selectedStroke || item.stroke === selectedStroke));
      for (const assignment of radicalAssignments) {
        radicalCounts.set(assignment.radical, (radicalCounts.get(assignment.radical) ?? 0) + assignment.count);
        strokeCounts.set(assignment.stroke, (strokeCounts.get(assignment.stroke) ?? 0) + assignment.count);
      }

      for (const locus of loci) {
        if (locus.page == null) continue;
        physicalPages.add(locus.page);
        pageCounts.set(locus.page, (pageCounts.get(locus.page) ?? 0) + locus.count);
        const binIndex = Math.min(histogram.length - 1, Math.max(0, Math.floor((locus.page - minPage) / binWidth)));
        if (histogram[binIndex]) histogram[binIndex].count += locus.count;
        const lineN = Number(locus.line);
        if (Number.isFinite(lineN) && lineN >= 1) {
          const lineBucket = Math.max(1, Math.round(lineN));
          maxObservedLine = Math.max(maxObservedLine, lineBucket);
          const heatKey = `${binIndex}|${lineBucket}`;
          heat.set(heatKey, (heat.get(heatKey) ?? 0) + locus.count);
        }
      }
    }

    return {
      characters: scopedCharacters.length,
      attestations,
      loci: lociCount,
      pages: physicalPages.size,
      avg: scopedCharacters.length ? attestations / scopedCharacters.length : 0,
      pageCounts: Array.from(pageCounts.entries()).sort((a, b) => a[0] - b[0]),
      radicalCounts: Array.from(radicalCounts.entries()).sort((a, b) => b[1] - a[1]),
      strokeCounts: Array.from(strokeCounts.entries()).sort((a, b) => naturalCompare(a[0], b[0])),
      histogram,
      heat,
      heatLineMax: Math.max(1, maxObservedLine),
    };
  }, [payload, scopedCharacters, mode, selectedRadical, selectedStroke]);

  function clearAll() {
    setHistoricalQuery('');
    setModernQuery('');
    setMeaningQuery('');
    setRadicalSearch('');
    setSelectedRadical('');
    setSelectedStroke('');
    setSelectedCell(null);
  }

  function chooseMode(next: Mode) {
    if (next === 'source' && !payload?.sourceModeAvailable) return;
    setMode(next);
    setSelectedRadical('');
    setSelectedStroke('');
    setSelectedCell(null);
  }

  function selectCharacter(character: CharacterRecord, reading?: CharacterReading) {
    setInspectorClosed(false);
    setSelectedCharacterId(character.id);
    const preferred = reading
      ?? character.readings.find(item => item.occurrenceCount > 0)
      ?? character.readings[0];
    if (preferred) {
      setSelectedReadingId(preferred.id);
      setLatinRequestedReadingId(preferred.id);
    }
  }

  function chooseReading(reading: CharacterReading) {
    setSelectedReadingId(reading.id);
    setLatinRequestedReadingId(reading.id);
  }

  const maxHeat = Math.max(1, ...Array.from(analytics.heat.values()));
  const topRadicals = analytics.radicalCounts.slice(0, 6);
  const maxRadical = Math.max(1, ...topRadicals.map(([, count]) => count));
  const maxStroke = Math.max(1, ...analytics.strokeCounts.map(([, count]) => count));

  if (loading) {
    return <div className="chr-loading"><div className="chr-loader" /><span>Building character index from Directus…</span></div>;
  }
  if (error || !payload) {
    return <div className="chr-loading chr-error"><strong>Characters could not be loaded.</strong><span>{error}</span></div>;
  }

  return (
    <div className="chr-app">


      <div className="chr-shell">
        <aside className="chr-left">
          <section className="chr-left-title">CHARACTER SEARCH</section>

          <section className="chr-panel chr-radical-panel">
            <h2>RADICAL FAMILIES</h2>
            <label className="chr-radical-search">
              <input value={radicalSearch} onChange={event => setRadicalSearch(event.target.value)} placeholder="Search radical…" />
              <span>⌕</span>
            </label>
            <div className="chr-radical-list">
              {radicalFamilies.slice(0, 80).map(item => (
                <button
                  type="button"
                  key={item.radical}
                  className={selectedRadical === item.radical ? 'active' : ''}
                  onClick={() => setSelectedRadical(selectedRadical === item.radical ? '' : item.radical)}
                >
                  <span className="chr-radical-glyph">{item.radical}</span>
                  <span className="chr-radical-label">{item.radical === '∅' ? 'Unclassified' : 'Radical'}</span>
                  <b title={`${item.count} attestations`}>{item.count}</b>
                  <span className="chr-radical-meter" aria-hidden="true">
                    <i style={{ width: `${Math.max(3, (item.count / maxRadicalFamilyAttestations) * 100)}%` }} />
                  </span>
                </button>
              ))}
              {radicalFamilies.length > 80 && <p className="chr-list-note">Showing first 80 families. Use search to narrow the list.</p>}
            </div>
          </section>

          <section className="chr-panel chr-active-filters">
            <h2>ACTIVE FILTERS</h2>
            <div className="chr-chip-list">
              <span className="chr-chip">Radical mode: {mode === 'modern' ? 'MODERN' : 'SOURCE'}</span>
              {selectedRadical && <button type="button" className="chr-chip" onClick={() => setSelectedRadical('')}>Radical: {selectedRadical} ×</button>}
              {selectedStroke && <button type="button" className="chr-chip" onClick={() => setSelectedStroke('')}>Strokes: {selectedStroke} ×</button>}
              {historicalQuery && <button type="button" className="chr-chip" onClick={() => setHistoricalQuery('')}>Historical: {historicalQuery} ×</button>}
              {modernQuery && <button type="button" className="chr-chip" onClick={() => setModernQuery('')}>Modern: {modernQuery} ×</button>}
              {meaningQuery && <button type="button" className="chr-chip" onClick={() => setMeaningQuery('')}>Meaning: {meaningQuery} ×</button>}
            </div>
            <button type="button" className="chr-clear-link" onClick={clearAll}>Clear all</button>
          </section>

          <section className="chr-panel chr-stats">
            <h2>QUICK STATS <small>(FILTERED)</small></h2>
            <dl>
              <div><dt>Characters</dt><dd>{analytics.characters.toLocaleString()}</dd></div>
              <div><dt>Attestations</dt><dd>{analytics.attestations.toLocaleString()}</dd></div>
              <div><dt>Dictionary pages</dt><dd>{analytics.pages.toLocaleString()}</dd></div>
              <div><dt>Physical loci</dt><dd>{analytics.loci.toLocaleString()}</dd></div>
              <div><dt>Avg. attestations</dt><dd>{analytics.avg.toFixed(1)}</dd></div>
            </dl>
          </section>
        </aside>

        <main className="chr-main">
          <section className="chr-filterbar" id="character-search">
            <div className="chr-mode-switch" aria-label="Radical indexing mode">
              <button type="button" className={mode === 'modern' ? 'active' : ''} onClick={() => chooseMode('modern')}>MODERN RADICAL</button>
              <button
                type="button"
                className={mode === 'source' ? 'active' : ''}
                onClick={() => chooseMode('source')}
                disabled={!payload.sourceModeAvailable}
                title={!payload.sourceModeAvailable ? 'Historical radical field is not configured.' : undefined}
              >SOURCE RADICAL</button>
            </div>
            <label><span>Historical romanization</span><input value={historicalQuery} onChange={event => setHistoricalQuery(event.target.value)} placeholder="e.g. chī, jué …" /></label>
            <label><span>Modern romanization</span><input value={modernQuery} onChange={event => setModernQuery(event.target.value)} placeholder="e.g. qīng, zhī …" /></label>
            <label className="chr-meaning"><span>Modern English meaning</span><input value={meaningQuery} onChange={event => setMeaningQuery(event.target.value)} placeholder="e.g. water, river …" /></label>
            <button type="button" className="chr-clear-top" onClick={clearAll}>Clear filters</button>
            {!payload.sourceModeAvailable && <span className="chr-source-note">Source mode awaits the physical historical-radical field name.</span>}
          </section>
          {mode === 'modern' && (
            <div className="chr-modern-radical-warning" role="note">
              <strong>Modern radical coverage is incomplete.</strong>
              <span>{missingModernRadicalCount.toLocaleString()} character{missingModernRadicalCount === 1 ? '' : 's'} in the current text-filtered corpus have no explicit modern semantic radical and are excluded from this indexing mode. Source Radical is the recommended default.</span>
            </div>
          )}

          <section className="chr-workspace">
            <div className="chr-matrix-wrap">
              <div className="chr-section-heading">
                <h1>RADICAL × SOURCE-STROKE MATRIX <span title="For the current reconstruction the stroke axis uses occ.n_strokes; modern semantic radicals are retained for the rows.">ⓘ</span></h1>
                <strong>Source strokes · occ.n_strokes</strong>
              </div>
              <div className="chr-matrix-scroll">
                <table className="chr-matrix">
                  <thead>
                    <tr>
                      <th className="chr-radical-head">Radical</th>
                      {strokes.map(stroke => (
                        <th key={stroke}>
                          <button type="button" className={selectedStroke === stroke ? 'active' : ''} onClick={() => setSelectedStroke(selectedStroke === stroke ? '' : stroke)}>{stroke}</button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrixRadicals.slice(0, 60).map(radical => (
                      <tr key={radical}>
                        <th>
                          <button type="button" className="chr-row-radical" onClick={() => setSelectedRadical(selectedRadical === radical ? '' : radical)}>
                            <span>{radical}</span><small>{radical === '∅' ? 'Unclassified' : 'radical'}</small>
                          </button>
                        </th>
                        {strokes.map(stroke => {
                          const cellKey = `${radical}\u0000${stroke}`;
                          const entries = matrix.get(cellKey) ?? [];
                          const selected = selectedCell?.radical === radical && selectedCell?.stroke === stroke;
                          const rawIndex = cellCarousel[cellKey] ?? 0;
                          const currentIndex = entries.length ? Math.min(rawIndex, entries.length - 1) : 0;
                          const currentEntry = entries[currentIndex];
                          const totalAttestations = matrixIntensity.totals.get(cellKey) ?? 0;
                          const heat = totalAttestations && matrixIntensity.max > matrixIntensity.min
                            ? (totalAttestations - matrixIntensity.min) / (matrixIntensity.max - matrixIntensity.min)
                            : totalAttestations ? 1 : 0;
                          const moveCarousel = (delta: number) => {
                            if (!entries.length) return;
                            const nextIndex = (currentIndex + delta + entries.length) % entries.length;
                            setCellCarousel(previous => ({ ...previous, [cellKey]: nextIndex }));
                            setSelectedCell({ radical, stroke });
                            selectCharacter(entries[nextIndex].character);
                          };
                          return (
                            <td key={stroke}>
                              {entries.length && currentEntry ? (
                                <div
                                  className={`chr-matrix-cell ${entries.length === 1 ? 'single' : ''} ${selected ? 'selected' : ''}`}
                                  style={{ '--cell-heat': heat, backgroundColor: `rgba(200, 154, 67, ${0.08 + heat * 0.38})` } as CSSProperties}
                                  title={`${entries.length} distinct character${entries.length === 1 ? '' : 's'} · ${totalAttestations} attestations`}
                                >
                                  {entries.length > 1 && <button type="button" className="chr-cell-arrow chr-cell-arrow-left" onClick={() => moveCarousel(-1)} aria-label="Previous character in cell">‹</button>}
                                  <button
                                    type="button"
                                    className="chr-cell-main"
                                    onClick={() => { setSelectedCell({ radical, stroke }); selectCharacter(currentEntry.character); }}
                                    aria-label={`${currentEntry.character.displayCharacter || 'character'}, ${currentIndex + 1} of ${entries.length}, radical ${radical}, ${stroke} source strokes, ${totalAttestations} attestations`}
                                  >
                                    <Glyph character={currentEntry.character} compact />
                                    <small>({entries.length})</small>
                                  </button>
                                  {entries.length > 1 && <button type="button" className="chr-cell-arrow chr-cell-arrow-right" onClick={() => moveCarousel(1)} aria-label="Next character in cell">›</button>}
                                </div>
                              ) : <span className="chr-dash">—</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {matrixRadicals.length > 60 && <div className="chr-matrix-note">Matrix shows the first 60 radical families in the current filtered order; use the radical search/filter to reach the remaining families.</div>}
              </div>

              <div className="chr-matrix-foot">
                <span><i /> {mode === 'modern' ? 'Modern semantic-radical indexing (incomplete where unassigned)' : 'Historical source indexing'}</span>
                <span>Cell count = distinct characters · background intensity = attestations</span>
              </div>

            </div>

            <aside className="chr-inspector">
              <div className="chr-inspector-title"><span>SELECTED CHARACTER</span><button type="button" onClick={() => { setInspectorClosed(true); setSelectedCharacterId(''); }} aria-label="Close character selection">×</button></div>
              {selectedCharacter ? (
                <>
                  <div className="chr-character-hero">
                    <Glyph character={selectedCharacter} />
                    <div>
                      <strong>{selectedReading?.modern || selectedReading?.historical || '—'}</strong>
                      {selectedCharacter.readings.filter(reading => reading.occurrenceCount > 0).slice(0, 5).map(reading => (
                        <button key={reading.id} type="button" className={selectedReading?.id === reading.id ? 'active' : ''} onClick={() => chooseReading(reading)}>{reading.historical || reading.modern || 'reading'}</button>
                      ))}
                    </div>
                  </div>
                  <p className="chr-character-meaning">{selectedReading?.english || 'No modern English definition recorded.'}</p>
                  <div className="chr-character-actions">
                    <a href={withBase(`/characters/view?id=${encodeURIComponent(selectedCharacter.id)}`)}>OPEN CHARACTER RECORD</a>
                  </div>
                  <section className="chr-inspector-section chr-latin-section">
                    <h3>DEFINITIO LATINA</h3>
                    {latinLoading && latinRequestedReadingId === selectedReading?.id ? <p className="chr-latin-status">Loading Latin definition…</p> : null}
                    {latinError ? <p className="chr-latin-status error">{latinError}</p> : null}
                    {!latinLoading && !latinError && selectedReading && latinRequestedReadingId === selectedReading.id && selectedLatinDefinitions.length === 0 ? <p className="chr-latin-status">No Latin definition recorded for this reading.</p> : null}
                    <LatinDefinitionList definitions={selectedLatinDefinitions} />
                  </section>
                  <dl className="chr-character-meta">
                    <div><dt>Modern radical</dt><dd>{selectedCharacter.semanticRadical || '—'}</dd></div>
                    <div><dt>Source radical</dt><dd>{payload.sourceModeAvailable ? (Array.from(new Set(selectedLoci.map(locus => locus.sourceRadical).filter(Boolean))).join(', ') || '—') : 'not configured'}</dd></div>
                    <div><dt>Source strokes</dt><dd>{selectedStrokeValues.join(', ') || '—'}</dd></div>
                    <div><dt>Total attestations</dt><dd>{selectedReading?.occurrenceCount ?? selectedCharacter.occurrenceCount}</dd></div>
                    {selectedCharacter.notStandard && <div><dt>Status</dt><dd>non-standard form</dd></div>}
                  </dl>
                  {selectedCharacter.note && <p className="chr-character-note">{selectedCharacter.note}</p>}

                  {selectedCharacter.variants.length > 0 && (
                    <section className="chr-inspector-section chr-variants-section">
                      <h3>GRAPHIC VARIANTS ({selectedCharacter.variants.length})</h3>
                      <div className="chr-variant-list">
                        {selectedCharacter.variants.map(variant => (
                          <div className="chr-variant-card" key={variant.id}>
                            <VariantGlyph variant={variant} />
                            {variant.typology && <span>{variant.typology}</span>}
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  <section className="chr-inspector-section">
                    <h3>DICTIONARY LOCI ({countLoci(selectedLoci)})</h3>
                    <div className="chr-loci-list">
                      {selectedLoci.slice(0, 12).map((locus, index) => locus.page != null ? (
                        <a key={`${locus.dictionaryId}:${locus.page}:${locus.line}:${index}`} href={withBase(`/dictionary?page=${encodeURIComponent(locus.page)}&line=${encodeURIComponent(text(locus.line))}`)} title={locus.typologies.join(', ')}>{formatLocus(locus)}</a>
                      ) : null)}
                      {selectedLoci.length > 12 && <span>+ {selectedLoci.length - 12} more loci</span>}
                    </div>
                  </section>

                  <section className="chr-inspector-section chr-radical-compare">
                    <h3>SOURCE vs MODERN RADICAL</h3>
                    <div className="chr-compare-grid">
                      <RadicalDonut title="SELECTED CELL" comparison={selectedCellRadicalComparison} />
                      <RadicalDonut
                        title={comparisonModernRadical ? `MODERN RADICAL ${comparisonModernRadical}` : 'MODERN RADICAL'}
                        comparison={wholeModernRadicalComparison}
                      />
                    </div>
                    <div className="chr-compare-legend" aria-label="Radical comparison legend">
                      <span><i className="same" />Same</span>
                      <span><i className="different" />Different</span>
                      <span><i className="unknown" />Unknown</span>
                    </div>
                    <p className="chr-compare-note">Distinct characters, literal glyph comparison. Any documented source-radical divergence counts as Different; missing modern or source radical data counts as Unknown.</p>
                  </section>
                </>
              ) : <p className="chr-unavailable">Select a matrix cell or a result row to inspect a character.</p>}
            </aside>
          </section>

          <section className="chr-cell-results">
            <div className="chr-results-head">
              <h2>RESULTS IN SELECTED CELL {selectedCell ? <><b>{selectedCell.radical}</b> × <b>{selectedCell.stroke}</b> SOURCE STROKES</> : null}</h2>
              <div className="chr-results-latin">
                {latinLoading && latinRequestedReadingId === selectedReading?.id ? <span>Loading Latin definition…</span> : null}
                {!latinLoading && selectedLatinDefinitions.length > 0 ? <LatinDefinitionList definitions={selectedLatinDefinitions} compact /> : null}
              </div>
              <div className="chr-results-pager"><span>{cellResults.length ? `${cellPage * CELL_PAGE_SIZE + 1}–${Math.min(cellResults.length, (cellPage + 1) * CELL_PAGE_SIZE)} of ${cellResults.length}` : '0 results'}</span>
                <button type="button" disabled={cellPage <= 0} onClick={() => setCellPage(page => Math.max(0, page - 1))}>‹</button>
                <button type="button" disabled={cellPage >= cellPageCount - 1} onClick={() => setCellPage(page => Math.min(cellPageCount - 1, page + 1))}>›</button>
              </div>
            </div>
            <div className="chr-results-scroll">
              <table>
                <thead><tr><th>Character</th><th>Historical romanization</th><th>Modern romanization</th><th>Modern English meaning</th><th>Strokes</th><th>Attestations</th><th>Dictionary loci</th></tr></thead>
                <tbody>
                  {visibleCellResults.map(result => (
                    <tr key={`${result.character.id}:${result.reading.id}`} className={selectedCharacter?.id === result.character.id && selectedReading?.id === result.reading.id ? 'selected' : ''}>
                      <td><button type="button" className="chr-character-button" onClick={() => selectCharacter(result.character, result.reading)}><Glyph character={result.character} compact /></button></td>
                      <td>{result.reading.historical || '—'}{result.reading.interpreted && <sup title="Editorially interpreted reading">†</sup>}</td>
                      <td>{result.reading.modern || '—'}</td>
                      <td>{result.reading.english || '—'}</td>
                      <td>{selectedCell?.stroke ?? '—'}</td>
                      <td>{result.occurrenceCount.toLocaleString()}</td>
                      <td className="chr-loci-mini">
                        {result.loci.slice(0, 3).map((locus, index) => locus.page != null ? <a key={`${locus.page}:${locus.line}:${index}`} href={withBase(`/dictionary?page=${encodeURIComponent(locus.page)}&line=${encodeURIComponent(text(locus.line))}`)}>p. {locus.page} · l.{text(locus.line) || '—'}</a> : null)}
                        {result.loci.length > 3 && <span>+{result.loci.length - 3}</span>}
                      </td>
                    </tr>
                  ))}
                  {!visibleCellResults.length && <tr><td colSpan={7} className="chr-no-results">Choose a populated matrix cell.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>

      <section className="chr-analytics" id="analytics">
        <div className="chr-analytics-label"><strong>ANALYTICS</strong><small>(FILTERED)</small></div>
        <article><h2>ATTESTATIONS OVER PAGES</h2><SparkLine values={analytics.pageCounts} label="Attestations over dictionary pages" /><div className="chr-axis"><span>p. {payload.totals.minPage ?? '—'}</span><span>p. {payload.totals.maxPage ?? '—'}</span></div></article>
        <article><h2>STROKE COUNT DISTRIBUTION</h2><div className="chr-stroke-bars">{analytics.strokeCounts.slice(0, 18).map(([stroke, count]) => <div key={stroke}><i style={{ height: `${Math.max(3, (count / maxStroke) * 100)}%` }} title={`${stroke} strokes: ${count} attestations`} /><span>{stroke}</span></div>)}</div></article>
        <article className="chr-heat-panel"><h2>LOCUS DENSITY HEATMAP (PAGES × LINES)</h2><div
          className="chr-heatmap"
          style={{
            gridTemplateColumns: `repeat(${Math.max(1, analytics.histogram.length)}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${analytics.heatLineMax}, minmax(0, 1fr))`,
          }}
          role="img"
          aria-label={`Locus density heatmap. Columns are page ranges; rows are dictionary line numbers 1–${analytics.heatLineMax}.`}
        >{Array.from({ length: analytics.heatLineMax }, (_, lineIndex) => Array.from({ length: analytics.histogram.length }, (_, binIndex) => {
          const value = analytics.heat.get(`${binIndex}|${lineIndex + 1}`) ?? 0;
          const opacity = value ? 0.18 + (value / maxHeat) * 0.82 : 0.06;
          const bin = analytics.histogram[binIndex];
          const pageLabel = bin.start === bin.end ? `page ${bin.start}` : `pages ${bin.start}–${bin.end}`;
          const tooltip = `${value} distinct attestation${value === 1 ? '' : 's'} at dictionary line ${lineIndex + 1} within ${pageLabel}`;
          return <span key={`${lineIndex}:${binIndex}`} style={{ opacity }} title={tooltip} aria-label={tooltip} />;
        }))}</div><div className="chr-heat-axis"><span>p. {analytics.histogram[0]?.start ?? '—'}</span><span>page ranges →</span><span>p. {analytics.histogram.at(-1)?.end ?? '—'}</span></div><div className="chr-axis"><span>Lower density</span><span>Higher density</span></div></article>
      </section>

      {payload.warnings.length > 0 && <details className="chr-warnings"><summary>Data-access notes ({payload.warnings.length})</summary>{payload.warnings.map(warning => <p key={warning}>{warning}</p>)}</details>}
    </div>
  );
}
