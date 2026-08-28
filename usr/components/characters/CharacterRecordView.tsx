import { useEffect, useMemo, useState } from 'react';
import type {
  CharacterRecordDetailPayload,
  RecordCompound,
  RecordGraphicVariant,
  RecordLexicalRelation,
  RecordLocus,
  RecordReading,
} from './recordTypes';
import './character-record.css';

const recordCache = new Map<string, Promise<CharacterRecordDetailPayload>>();
let searchIndexPromise: Promise<any> | null = null;

type RelationTab = 'all' | 'synonyms' | 'antonyms' | 'variants' | 'compounds';
type NetworkItem =
  | { key: string; kind: 'lexical'; label: string; sub: string; characterId: string; relation: RecordLexicalRelation; category: string }
  | { key: string; kind: 'variant'; label: string; sub: string; characterId: string; variant: RecordGraphicVariant; category: string }
  | { key: string; kind: 'compound'; label: string; sub: string; characterId: ''; compound: RecordCompound; category: string };

function readJson<T>(url: string): Promise<T> {
  return fetch(url).then(async response => {
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error || `Request failed (${response.status})`);
    return body as T;
  });
}

function loadRecord(id: string): Promise<CharacterRecordDetailPayload> {
  if (!recordCache.has(id)) recordCache.set(id, readJson<CharacterRecordDetailPayload>(`/data/character-record/${encodeURIComponent(id)}.json`));
  return recordCache.get(id)!;
}

function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map(v => v?.trim()).filter((v): v is string => Boolean(v))));
}

function formatEnglishDefinition(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/\s*\/\s*/g, '; ')
    .replace(/;\s*;/g, '; ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function locusLabel(locus: RecordLocus): string {
  const page = locus.page == null ? 'p. —' : `p. ${locus.page}`;
  const line = locus.line == null || locus.line === '' ? 'l. —' : `l. ${locus.line}`;
  return `${page} · ${line}`;
}

function dictionaryHref(locus: RecordLocus): string | null {
  if (locus.page == null) return null;
  const line = locus.line == null ? '' : `&line=${encodeURIComponent(String(locus.line))}`;
  return `/dictionary?page=${encodeURIComponent(String(locus.page))}${line}`;
}

function Glyph({ glyph, link, className = '' }: { glyph: string; link?: string | null; className?: string }) {
  if (link) return <a className={className} href={link} target="_blank" rel="noreferrer">{glyph}</a>;
  return <span className={className}>{glyph}</span>;
}

function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: string }) {
  return <span className={`cr-badge cr-badge-${tone}`}>{children}</span>;
}

function typologyTone(value: string | null): string {
  const v = (value || '').toLowerCase();
  if (v.includes('principal')) return 'principal';
  if (v.includes('variant')) return 'variant';
  if (v.includes('altern')) return 'alternative';
  if (v.includes('no sinon')) return 'rejected';
  if (v.includes('corrett')) return 'principal';
  return 'neutral';
}

function sourceStrokeLabel(values: Array<string | number>): string {
  if (!values.length) return '—';
  if (values.length === 1) return String(values[0]);
  const nums = values.map(Number).filter(Number.isFinite);
  if (nums.length === values.length) {
    const min = Math.min(...nums); const max = Math.max(...nums);
    return min === max ? String(min) : `${min}–${max}`;
  }
  return values.join(', ');
}

function copyText(text: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const input = document.createElement('textarea');
  input.value = text; document.body.appendChild(input); input.select(); document.execCommand('copy'); input.remove();
  return Promise.resolve();
}

function RelationMap({
  data,
  selectedReadingId,
  tab,
  setTab,
  selectedKey,
  onSelect,
}: {
  data: CharacterRecordDetailPayload;
  selectedReadingId: string;
  tab: RelationTab;
  setTab: (tab: RelationTab) => void;
  selectedKey: string | null;
  onSelect: (item: NetworkItem) => void;
}) {
  const lexical = data.lexicalRelations.filter(rel => !selectedReadingId || rel.localReadingId === selectedReadingId);
  const compounds = data.compounds.filter(compound => !selectedReadingId ||
    (compound.selectedRoles.includes('first') && compound.first.id === selectedReadingId) ||
    (compound.selectedRoles.includes('second') && compound.second.id === selectedReadingId));

  const allItems: NetworkItem[] = [
    ...lexical.map(relation => ({
      key: `lex:${relation.id}`,
      kind: 'lexical' as const,
      label: relation.targetGlyph,
      sub: relation.targetHistorical || relation.targetModern || '',
      characterId: relation.targetCharacterId,
      relation,
      category: relation.category,
    })),
    ...data.graphicVariants.map(variant => ({
      key: `var:${variant.key}`,
      kind: 'variant' as const,
      label: variant.targetGlyph,
      sub: variant.typology || 'graphic variant',
      characterId: variant.targetCharacterId,
      variant,
      category: 'variant',
    })),
    ...compounds.map(compound => ({
      key: `cmp:${compound.id}`,
      kind: 'compound' as const,
      label: compound.word || `${compound.first.glyph}${compound.second.glyph}`,
      sub: [compound.first.historical, compound.second.historical].filter(Boolean).join('–'),
      characterId: '' as const,
      compound,
      category: 'compound',
    })),
  ];

  const filtered = allItems.filter(item => {
    if (tab === 'all') return true;
    if (tab === 'synonyms') return item.kind === 'lexical' && (item.category === 'synonym' || item.category === 'association');
    if (tab === 'antonyms') return item.kind === 'lexical' && (item.category === 'antonym' || item.category === 'rejected');
    if (tab === 'variants') return item.kind === 'variant';
    return item.kind === 'compound';
  });
  const visible = filtered.slice(0, 12);
  const cx = 230, cy = 150, radius = 102;

  return <section className="cr-panel cr-relations" id="lexical-relations">
    <div className="cr-panel-title-row"><h2>CHARACTER RELATIONSHIP MAP</h2><span>{filtered.length} relations</span></div>
    <div className="cr-rel-tabs" role="tablist">
      {([['all','All'],['synonyms','Synonyms'],['antonyms','Antonyms / rejected'],['variants','Variants'],['compounds','Compounds']] as Array<[RelationTab,string]>).map(([value,label]) =>
        <button key={value} type="button" className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{label}</button>)}
    </div>
    <div className="cr-network-wrap">
      <svg viewBox="0 0 460 300" className="cr-network" role="img" aria-label="Character relationship network">
        {visible.map((item, index) => {
          const angle = (-Math.PI / 2) + (index * Math.PI * 2 / Math.max(visible.length, 1));
          const x = cx + Math.cos(angle) * radius;
          const y = cy + Math.sin(angle) * radius;
          return <line key={`edge:${item.key}`} x1={cx} y1={cy} x2={x} y2={y} className={`cr-edge cr-edge-${item.category} ${selectedKey === item.key ? 'selected' : ''}`} onClick={() => onSelect(item)} />;
        })}
        <circle cx={cx} cy={cy} r="39" className="cr-node-center" />
        <text x={cx} y={cy + 7} className="cr-center-glyph" textAnchor="middle">{data.character.displayCharacter}</text>
        {visible.map((item, index) => {
          const angle = (-Math.PI / 2) + (index * Math.PI * 2 / Math.max(visible.length, 1));
          const x = cx + Math.cos(angle) * radius;
          const y = cy + Math.sin(angle) * radius;
          const openTarget = () => {
            if (item.characterId) window.location.href = `/characters/view?id=${encodeURIComponent(item.characterId)}`;
            else onSelect(item);
          };
          return <g key={item.key} className={`cr-node cr-node-${item.category} ${selectedKey === item.key ? 'selected' : ''}`} role="button" tabIndex={0} aria-label={`${item.label} ${item.sub}`} onClick={openTarget} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') openTarget(); }}>
            <circle cx={x} cy={y} r="29" />
            <text x={x} y={y + 2} textAnchor="middle" className="cr-node-glyph">{item.label.length > 3 ? item.label.slice(0, 3) : item.label}</text>
            <text x={x} y={y + 17} textAnchor="middle" className="cr-node-reading">{item.sub.slice(0, 12)}</text>
          </g>;
        })}
      </svg>
      <div className="cr-network-legend">
        <span><i className="synonym" />Synonym / association</span>
        <span><i className="rejected" />Antonym / rejected</span>
        <span><i className="variant" />Graphic variant</span>
        <span><i className="compound" />Compound</span>
      </div>
    </div>
    {filtered.length > visible.length && <p className="cr-network-more">Network view shows the first {visible.length} of {filtered.length} relations; all remain available through filters and record navigation.</p>}
  </section>;
}

function RelationEvidence({ item }: { item: NetworkItem | null }) {
  if (!item) return <div className="cr-relation-evidence empty">Select an edge in the relationship map to inspect its documentary evidence.</div>;
  if (item.kind === 'compound') return <div className="cr-relation-evidence">
    <strong>{item.compound.word || `${item.compound.first.glyph}${item.compound.second.glyph}`}</strong>
    <span>Experimental composite model · no direct occurrence junction is currently recorded.</span>
  </div>;
  if (item.kind === 'variant') return <div className="cr-relation-evidence">
    <strong>{item.variant.targetGlyph}</strong><Badge tone="alternative">{item.variant.typology || 'graphic variant'}</Badge>
    <span>{item.variant.evidenceCount} documentary loci</span>
    {item.variant.evidence[0] && dictionaryHref(item.variant.evidence[0]) && <a href={dictionaryHref(item.variant.evidence[0])!}>{locusLabel(item.variant.evidence[0])} →</a>}
  </div>;
  const rel = item.relation;
  const ev = rel.evidence[0];
  return <div className="cr-relation-evidence">
    <strong>{rel.targetGlyph} <em>{rel.targetHistorical || rel.targetModern || ''}</em></strong>
    <Badge tone={rel.category === 'rejected' ? 'rejected' : 'principal'}>{rel.typology || 'source synonym association'}</Badge>
    <span>{rel.evidenceCount} documentary evidences</span>
    {ev && <><span>{ev.internal == null ? 'internal: —' : `internal: ${ev.internal ? 'true' : 'false'}`} · position {ev.position ?? '—'}</span>{dictionaryHref(ev) && <a href={dictionaryHref(ev)!}>{locusLabel(ev)} →</a>}</>}
  </div>;
}

export default function CharacterRecordView() {
  const [data, setData] = useState<CharacterRecordDetailPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedReadingId, setSelectedReadingId] = useState('');
  const [selectedSourceRadical, setSelectedSourceRadical] = useState('');
  const [relationTab, setRelationTab] = useState<RelationTab>('all');
  const [selectedNetworkItem, setSelectedNetworkItem] = useState<NetworkItem | null>(null);
  const [showAllEvidence, setShowAllEvidence] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id') || '';
    if (!id) { setError('No character ID supplied.'); return; }
    loadRecord(id).then(payload => {
      setData(payload);
      const requested = params.get('reading') || '';
      setSelectedReadingId(payload.readings.some(r => r.id === requested) ? requested : (payload.readings[0]?.id || ''));
      const requestedRadical = params.get('srad') || '';
      setSelectedSourceRadical(payload.sourceRadicals.some(r => r.radical === requestedRadical) ? requestedRadical : '');
    }).catch(err => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    if (!data) return;
    const url = new URL(window.location.href);
    if (selectedReadingId) url.searchParams.set('reading', selectedReadingId); else url.searchParams.delete('reading');
    if (selectedSourceRadical) url.searchParams.set('srad', selectedSourceRadical); else url.searchParams.delete('srad');
    if (selectedNetworkItem) url.searchParams.set('relation', selectedNetworkItem.key); else url.searchParams.delete('relation');
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, [data, selectedReadingId, selectedSourceRadical, selectedNetworkItem]);

  const selectedReading = useMemo(() => data?.readings.find(r => r.id === selectedReadingId) ?? null, [data, selectedReadingId]);
  const relationEvidenceOccIds = useMemo(() => {
    if (!selectedNetworkItem || selectedNetworkItem.kind !== 'lexical') return null;
    return new Set(selectedNetworkItem.relation.evidence.map(e => e.occId).filter(Boolean));
  }, [selectedNetworkItem]);

  const filteredAttestations = useMemo(() => {
    if (!data) return [];
    return data.attestations.filter(row =>
      (!selectedReadingId || row.readingId === selectedReadingId)
      && (!selectedSourceRadical || row.sourceRadical === selectedSourceRadical)
      && (!relationEvidenceOccIds || relationEvidenceOccIds.has(row.id))
    );
  }, [data, selectedReadingId, selectedSourceRadical, relationEvidenceOccIds]);

  if (error) return <div className="cr-shell"><main className="cr-error"><a href="/characters">← Index</a><h1>Character record unavailable</h1><p>{error}</p></main></div>;
  if (!data) return <div className="cr-loading"><span className="cr-spinner" /><strong>Loading character record…</strong></div>;

  const historicalReadings = unique(data.readings.map(r => r.historical));
  const modernReadings = unique(data.readings.map(r => r.modern));
  const englishMeanings = unique(data.readings.map(r => formatEnglishDefinition(r.english)));
  const sourceStroke = sourceStrokeLabel(data.sourceStrokeValues);
  const sourceRadicalSummary = unique(data.sourceRadicals.map(r => r.radical));
  const sourceRadicalDisplay = sourceRadicalSummary.length === 0 ? '—' : sourceRadicalSummary.length === 1 ? sourceRadicalSummary[0] : `${sourceRadicalSummary.length} radicals`;

  const selectReading = (reading: RecordReading) => {
    setSelectedReadingId(reading.id);
    setSelectedNetworkItem(null);
    setShowAllEvidence(false);
  };

  const jumpToSection = (event: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    event.preventDefault();
    const target = document.getElementById(targetId);
    if (!target) return;

    const url = new URL(window.location.href);
    url.hash = targetId;
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);

    target.classList.remove('cr-section-flash');
    void target.getBoundingClientRect();
    target.classList.add('cr-section-flash');
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });

    window.setTimeout(() => target.classList.remove('cr-section-flash'), 1650);
  };

  const doCopyCitation = async () => {
    const citation = `CHIND – chindictionary, character “${data.character.displayCharacter}”, record ${data.character.id}, Dictionarium Sinico–Latinum digital reconstruction. ${window.location.href}`;
    await copyText(citation); setActionMessage('Citation copied'); setTimeout(() => setActionMessage(''), 1800);
  };
  const doStableLink = async () => { await copyText(window.location.href); setActionMessage('Stable link copied'); setTimeout(() => setActionMessage(''), 1800); };
  const doExport = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = href; a.download = `CHIND-character-${data.character.id}.json`; a.click(); URL.revokeObjectURL(href);
  };
  const searchCharacter = async (event: React.FormEvent) => {
    event.preventDefault(); const q = searchValue.trim(); if (!q) return;
    if (!searchIndexPromise) searchIndexPromise = readJson<any>('/data/characters-index.json');
    try {
      const index = await searchIndexPromise;
      const normalized = q.replace(/\s+/g,'').toLowerCase();
      const found = (index?.data ?? []).find((row: any) => [row.rawCharacter,row.displayCharacter,row.simplified].filter(Boolean).some((v: any) => String(v).replace(/\s+/g,'').toLowerCase() === normalized));
      if (found?.id) window.location.href = `/characters/view?id=${encodeURIComponent(String(found.id))}`;
      else window.location.href = '/characters';
    } catch { window.location.href = '/characters'; }
  };

  const readingRows = data.readings.flatMap(reading => reading.definitions.length
    ? reading.definitions.map(definition => ({ reading, definition }))
    : [{ reading, definition: null }]);
  const shownEvidence = showAllEvidence ? filteredAttestations : filteredAttestations.slice(0, 12);
  const selectedKey = selectedNetworkItem?.key ?? null;

  return <div className="cr-shell">
    <aside className="cr-sidebar">
      <div className="cr-side-search"><div className="cr-side-kicker">Character search / <b>{data.character.displayCharacter}</b></div><form onSubmit={searchCharacter}><input value={searchValue} onChange={e => setSearchValue(e.target.value)} placeholder="Search another character…" /><button type="submit" aria-label="Search">⌕</button></form></div>
      <nav className="cr-section-nav">
        <a href="#overview" onClick={event => jumpToSection(event, 'overview')}>⌂ <span>Overview</span></a>
        <a href="#readings" onClick={event => jumpToSection(event, 'readings')}>▤ <span>Readings & definitions</span></a>
        <a href="#lexical-relations" onClick={event => jumpToSection(event, 'lexical-relations')}>⌘ <span>Lexical relations</span></a>
        <a href="#graphic-variants" onClick={event => jumpToSection(event, 'graphic-variants')}>⌁ <span>Graphic variants</span></a>
        <a href="#compounds" onClick={event => jumpToSection(event, 'compounds')}>▱ <span>Compound words</span></a>
        <a href="#documentary-evidence" onClick={event => jumpToSection(event, 'documentary-evidence')}>▧ <span>Dictionary attestations</span></a>
        <a href="#notes-sources" onClick={event => jumpToSection(event, 'notes-sources')}>▤ <span>Notes & sources</span></a>
      </nav>
      <section className="cr-side-block"><h2>QUICK FACTS</h2><dl>
        <div><dt>Readings</dt><dd>{data.stats.readings}</dd></div>
        <div><dt>Attestations</dt><dd>{data.stats.attestations}</dd></div>
        <div><dt>Dictionary loci</dt><dd>{data.stats.loci}</dd></div>
        <div><dt>Relations</dt><dd>{data.stats.lexicalRelations + data.stats.graphicRelations}</dd></div>
        <div><dt>Compound words</dt><dd>{data.stats.compounds}</dd></div>
      </dl></section>
      <section className="cr-side-block"><h2>SCHOLARLY STATUS</h2>
        <div className={`cr-status-card ${data.character.notStandard ? 'warning' : 'ok'}`}><b>{data.character.notStandard ? 'Non-standard form' : 'Standard form'}</b><span>{data.character.notStandard ? 'Historical / non-canonical script' : 'Canonical modern script'}</span></div>
        {data.stats.interpretedReadings > 0 && <div className="cr-status-card info"><b>{data.stats.interpretedReadings} interpreted reading{data.stats.interpretedReadings === 1 ? '' : 's'}</b><span>Editorial reconstruction</span></div>}
      </section>
      <footer className="cr-side-footer"><span>Record ID: C-{data.character.id}</span>{data.character.dateUpdated && <span>Last updated: {String(data.character.dateUpdated).slice(0,10)}</span>}</footer>
    </aside>

    <main className="cr-record">
      <section className="cr-hero" id="overview">
        <div className="cr-glyph-tile"><Glyph glyph={data.character.displayCharacter} link={data.character.glyphLink} className="cr-glyph-main" /></div>
        <div className="cr-identity">
          <div className="cr-reading-summary"><div><strong>{historicalReadings.join(' · ') || '—'}</strong><span>Historical readings</span></div><div><strong>{modernReadings.join(' · ') || '—'}</strong><span>Modern romanization</span></div></div>
          <h1>{englishMeanings.join('; ') || 'No modern English definition recorded'}</h1>
          <div className="cr-index-cards">
            <div><span>Modern radical</span><b>{data.character.modernRadical || '—'}</b></div>
            <div><span>Source radical</span><b>{sourceRadicalDisplay}</b></div>
            <div><b>{data.character.modernStrokes ?? data.character.strokesNotNumeric ?? '—'}</b><span>strokes modern</span></div>
            <div><b>{sourceStroke}</b><span>strokes source</span></div>
          </div>
          {data.sourceRadicals.length > 0 && <div className="cr-source-radicals">{data.sourceRadicals.map(item => <button key={`${item.dictionaryId}:${item.radical}`} className={selectedSourceRadical === item.radical ? 'active' : ''} onClick={() => setSelectedSourceRadical(selectedSourceRadical === item.radical ? '' : item.radical)} title={`${item.dictionaryLabel}: ${item.occurrenceCount} attestations`}>{item.dictionaryLabel} · {item.radical}</button>)}</div>}
        </div>
        <div className="cr-record-actions">
          <div className="cr-neighbors">
            {data.neighbors.previous ? <a href={`/characters/view?id=${encodeURIComponent(data.neighbors.previous.id)}`}>‹ <span>Prev: {data.neighbors.previous.glyph}</span></a> : <span />}
            {data.neighbors.next ? <a href={`/characters/view?id=${encodeURIComponent(data.neighbors.next.id)}`}><span>Next: {data.neighbors.next.glyph}</span> ›</a> : <span />}
          </div>
          <div className="cr-action-buttons"><button onClick={doCopyCitation}>⧉ Copy citation</button><button onClick={doStableLink}>⌁ Stable link</button><button onClick={doExport}>⇩ Export record</button></div>
          {actionMessage && <div className="cr-action-message">{actionMessage}</div>}
        </div>
      </section>

      <div className="cr-top-grid">
        <section className="cr-panel cr-readings" id="readings">
          <div className="cr-panel-title-row"><h2>READINGS & DEFINITIONS ({data.readings.length})</h2><span>{selectedReading ? `Filtered: ${selectedReading.historical || selectedReading.modern || selectedReading.id}` : 'All readings'}</span></div>
          <div className="cr-table-scroll"><table><colgroup>
            <col className="cr-col-historical" /><col className="cr-col-modern" /><col className="cr-col-tone" /><col className="cr-col-typology" /><col className="cr-col-english" /><col className="cr-col-latin" /><col className="cr-col-locus" />
          </colgroup><thead><tr><th>Historical romanization</th><th>Modern romanization</th><th>Tone</th><th>Typology</th><th>Modern English definition</th><th>Latin dictionary definition</th><th>Locus</th></tr></thead><tbody>
            {readingRows.map(({reading,definition}, index) => <tr key={`${reading.id}:${definition?.typology ?? ''}:${index}`} className={selectedReadingId === reading.id ? 'selected' : ''} onClick={() => selectReading(reading)}>
              <td><strong>{reading.historical || '—'}</strong>{reading.interpreted && <Badge tone="alternative">interpreted</Badge>}</td><td>{reading.modern || '—'}</td><td>{reading.tone ?? '—'}</td><td>{definition?.typology ? <Badge tone={typologyTone(definition.typology)}>{definition.typology}</Badge> : '—'}</td><td className="cr-english-definition">{formatEnglishDefinition(reading.english) || '—'}</td><td className="cr-latin">{definition ? <span dangerouslySetInnerHTML={{__html: definition.html}} /> : '—'}</td><td>{definition?.loci[0] && dictionaryHref(definition.loci[0]) ? <a onClick={e => e.stopPropagation()} href={dictionaryHref(definition.loci[0])!}>{locusLabel(definition.loci[0])}</a> : '—'}{definition && definition.loci.length > 1 && <small> +{definition.loci.length-1}</small>}</td>
            </tr>)}
          </tbody></table></div>
        </section>

        <div className="cr-network-column">
          <RelationMap data={data} selectedReadingId={selectedReadingId} tab={relationTab} setTab={setRelationTab} selectedKey={selectedKey} onSelect={item => setSelectedNetworkItem(selectedKey === item.key ? null : item)} />
          <RelationEvidence item={selectedNetworkItem} />
        </div>
      </div>

      <div className="cr-middle-grid">
        <section className="cr-panel" id="compounds"><div className="cr-panel-title-row"><h2>POLYSYLLABIC CONSTRUCTIONS ({data.compounds.length})</h2><span>experimental model</span></div>
          <div className="cr-compound-list">{data.compounds.length ? data.compounds.slice(0,8).map(compound => <article key={compound.id} className="cr-compound-card"><div className="cr-compound-word">{compound.word || `${compound.first.glyph}${compound.second.glyph}`}<small>{[compound.first.historical,compound.second.historical].filter(Boolean).join('–')}</small></div><dl><div><dt>Order</dt><dd>{compound.selectedRoles.join(' / ') || '—'} syllable</dd></div><div><dt>Other component</dt><dd>{compound.other ? `${compound.other.glyph} ${compound.other.historical || ''}` : 'same character / multiple roles'}</dd></div><div><dt>Full transcription</dt><dd>{compound.word || '—'}</dd></div></dl><Badge tone="alternative">Experimental model</Badge></article>) : <p className="cr-empty">No composite words currently linked to this character.</p>}</div>
          <p className="cr-method-note">Composite words are not yet directly linked to occurrences; no documentary locus is inferred.</p>
        </section>

        <section className="cr-panel" id="graphic-variants"><div className="cr-panel-title-row"><h2>GRAPHIC FORMS & INDEXING</h2></div>
          <div className="cr-form-grid">
            <div><span>Standard form (traditional)</span><Glyph glyph={data.character.displayCharacter} link={data.character.glyphLink} className="cr-form-glyph" /></div>
            <div><span>Graphic variant (attested / interpreted)</span>{data.graphicVariants[0] ? <Glyph glyph={data.graphicVariants[0].targetGlyph} link={data.graphicVariants[0].targetGlyphLink} className="cr-form-glyph" /> : <b>—</b>}</div>
            <div><span>Simplified (equivalent)</span><b className="cr-form-glyph">{data.character.simplified || '—'}</b></div>
            <div><span>Modern semantic radical</span><b>{data.character.modernRadical || '—'}</b></div>
            <div><span>Phonetic component</span><b>{data.character.phoneticRadical || '—'}</b></div>
            <div><span>Source radical(s)</span><b>{sourceRadicalSummary.join(' · ') || '—'}</b></div>
            <div><span>Strokes (modern)</span><b>{data.character.modernStrokes ?? data.character.strokesNotNumeric ?? '—'}</b></div>
            <div><span>Strokes (source)</span><b>{sourceStroke}</b></div>
            <div><span>Status</span><b>{data.character.notStandard ? 'Non-standard' : 'Standard'}</b></div>
          </div>
          {data.graphicVariants.length > 0 && <div className="cr-variant-strip"><h3>Graphic variants</h3>{data.graphicVariants.map(variant => <a key={variant.key} href={`/characters/view?id=${encodeURIComponent(variant.targetCharacterId)}`}><Glyph glyph={variant.targetGlyph} link={null} className="cr-variant-glyph" /><span>{variant.typology || 'relation'} · {variant.evidenceCount} loci</span></a>)}</div>}
        </section>

      </div>

      <section className="cr-panel cr-documentary" id="documentary-evidence"><div className="cr-panel-title-row"><h2>DOCUMENTARY EVIDENCE</h2><span>{filteredAttestations.length} attestations in current filter</span></div>
        <div className="cr-table-scroll"><table><thead><tr><th>Locus</th><th>Reading</th><th>Typology</th><th>Latin definition</th><th>Source radical</th><th>Strokes</th><th>Relations at locus</th><th>Evidence context</th></tr></thead><tbody>
          {shownEvidence.map(row => <tr key={row.id} className={row.strokeBoundary ? 'stroke-boundary' : ''}><td>{dictionaryHref(row) ? <a href={dictionaryHref(row)!}>{locusLabel(row)}</a> : locusLabel(row)}</td><td>{row.historicalReading || '—'} → {row.modernReading || '—'}</td><td>{row.typology ? <Badge tone={typologyTone(row.typology)}>{row.typology}</Badge> : '—'}{row.strokeBoundary && <Badge tone="alternative">stroke boundary</Badge>}</td><td className="cr-latin">{row.latinDefinitionHtml ? <span dangerouslySetInnerHTML={{__html: row.latinDefinitionHtml}} /> : '—'}</td><td className="cr-source-radical-cell">{row.sourceRadical || '—'}</td><td>{row.historicalStrokes ?? '—'}</td><td><div className="cr-relation-tags">{row.relations.length ? row.relations.map((rel,i) => <span key={`${rel.kind}:${i}`}>{rel.kind === 'lexical' ? rel.label : 'graphic'}{rel.position != null ? ` · position ${rel.position}` : ''}{rel.internal != null ? ` · ${rel.internal ? 'internal' : 'external'}` : ''}</span>) : '—'}</div></td><td>{dictionaryHref(row) ? <a className="cr-open-page" href={dictionaryHref(row)!}>Open reconstructed page ↗</a> : '—'}</td></tr>)}
        </tbody></table></div>
        {filteredAttestations.length > 12 && <button className="cr-show-all" onClick={() => setShowAllEvidence(v => !v)}>{showAllEvidence ? 'Show first 12 attestations' : `View all ${filteredAttestations.length} attestations`}</button>}
      </section>

      <section className="cr-panel cr-notes" id="notes-sources"><div className="cr-panel-title-row"><h2>NOTES & SOURCES</h2></div><div className="cr-note-grid"><div><h3>Character note</h3><p>{data.character.note || 'No character-level note recorded.'}</p></div><div><h3>Graphic source</h3>{data.character.glyphLink ? <a href={data.character.glyphLink} target="_blank" rel="noreferrer">Open external character reference ↗</a> : <p>No external character reference recorded.</p>}<p>Modern and source radicals are intentionally kept separate throughout this record.</p></div></div></section>

      {data.warnings.length > 0 && <details className="cr-warnings"><summary>Data-access notes ({data.warnings.length})</summary>{data.warnings.map((warning,index) => <p key={index}>{warning}</p>)}</details>}
    </main>
  </div>;
}
