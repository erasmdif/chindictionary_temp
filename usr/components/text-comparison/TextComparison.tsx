import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  ComparisonCharacter,
  ComparisonCompound,
  ComparisonStatus,
  ComparisonVariant,
  TextComparisonIndexPayload,
} from './types';
import './text-comparison.css';

type CharacterDetailPayload = {
  character?: {
    id: string;
    displayCharacter: string;
    rawCharacter: string | null;
    simplified: string | null;
    glyphLink: string | null;
    formalism: boolean;
    modernRadical: string | null;
    modernStrokes: string | number | null;
  };
  readings?: Array<{
    id: string;
    historical: string | null;
    modern: string | null;
    english: string | null;
    occurrenceCount: number;
    definitions?: Array<{ typology: string | null; html: string; count: number }>;
  }>;
  attestations?: Array<{
    id: string;
    page: number | null;
    line: string | number | null;
    typology: string | null;
    latinDefinitionHtml: string | null;
  }>;
  graphicVariants?: Array<{
    key: string;
    targetCharacterId: string;
    targetGlyph: string;
    typology: string | null;
    evidenceCount: number;
  }>;
};

type Token = {
  key: string;
  sourceText: string;
  status: ComparisonStatus;
  characters: ComparisonCharacter[];
  variants: ComparisonVariant[];
  compounds: ComparisonCompound[];
};

type PdfRuntime = {
  doc: any;
  numPages: number;
  page: number;
  cache: Map<number, string>;
} | null;

declare global {
  interface Window {
    pdfjsLib?: any;
    Tesseract?: any;
  }
}

const BLOCK_SIZE = 1200;
const PDF_JS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDF_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const TESSERACT_JS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';

const STATUS_LABELS: Record<ComparisonStatus, string> = {
  source: 'Attested in the manuscript',
  historical: 'Attested through a historical glyph',
  variant: 'Mentioned as a graphic variant',
  missing: 'Not found in the source data',
  compound: 'Attested disyllabic unit',
  neutral: 'Non-Han text',
};

function uniqueById<T extends { id: string }>(rows: T[]): T[] {
  return Array.from(new Map(rows.map(row => [row.id, row])).values());
}

function scriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-chind-src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') resolve();
      else {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error(`Could not load ${src}`)), { once: true });
      }
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.chindSrc = src;
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    }, { once: true });
    script.addEventListener('error', () => reject(new Error(`Could not load ${src}`)), { once: true });
    document.head.appendChild(script);
  });
}

async function ensurePdfOcrLibraries() {
  if (!window.pdfjsLib) await scriptOnce(PDF_JS);
  if (!window.Tesseract) await scriptOnce(TESSERACT_JS);
  if (!window.pdfjsLib || !window.Tesseract) throw new Error('PDF OCR libraries are unavailable.');
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER;
}

function isHanCharacter(value: string): boolean {
  return /\p{Script=Han}/u.test(value);
}

function normaliseEnglish(value: string | null | undefined): string {
  return String(value ?? '').replace(/\s*\/\s*/g, '; ').replace(/\s+/g, ' ').trim();
}

function readingLabel(character: ComparisonCharacter | undefined): string | null {
  if (!character) return null;
  const best = [...character.readings].sort((a, b) => b.occurrenceCount - a.occurrenceCount)[0];
  return best?.historical || best?.modern || null;
}

function tokenDisplay(token: Token, romanise: boolean): string {
  if (!romanise) return token.sourceText;
  if (token.status === 'compound') {
    const compound = token.compounds[0];
    return compound?.historicalRomanisation || token.sourceText;
  }
  const reading = readingLabel(token.characters[0]);
  return reading || token.sourceText;
}

function DetailSkeleton() {
  return <div className="tc-detail-loading">Loading detailed record…</div>;
}

export default function TextComparison() {
  const [index, setIndex] = useState<TextComparisonIndexPayload | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [draftText, setDraftText] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [romanise, setRomanise] = useState(false);
  const [includeCompounds, setIncludeCompounds] = useState(false);
  const [browseMode, setBrowseMode] = useState(true);
  const [blockIndex, setBlockIndex] = useState(0);
  const [selected, setSelected] = useState<Token | null>(null);
  const [detail, setDetail] = useState<CharacterDetailPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [pdfVersion, setPdfVersion] = useState(0);
  const pdfRef = useRef<PdfRuntime>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inspectorBodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    fetch('/data/text-comparison-index.json')
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
        return body as TextComparisonIndexPayload;
      })
      .then(payload => { if (active) setIndex(payload); })
      .catch(error => { if (active) setIndexError(error instanceof Error ? error.message : String(error)); });
    return () => { active = false; };
  }, []);

  const indexes = useMemo(() => {
    const direct = new Map<string, ComparisonCharacter[]>();
    const historical = new Map<string, ComparisonCharacter[]>();
    const variants = new Map<string, ComparisonVariant[]>();
    const characterById = new Map<string, ComparisonCharacter>();
    const compounds = new Map<string, ComparisonCompound[]>();

    if (!index) return { direct, historical, variants, characterById, compounds };

    for (const character of index.characters) {
      characterById.set(character.id, character);
      if (!character.attested) continue;
      if (character.formalism && character.simplified) {
        const list = historical.get(character.simplified) ?? [];
        list.push(character);
        historical.set(character.simplified, list);
      } else if (character.rawCharacter) {
        const list = direct.get(character.rawCharacter) ?? [];
        list.push(character);
        direct.set(character.rawCharacter, list);
      }
    }

    for (const relation of index.variants) {
      if (!relation.variantMatchGlyph) continue;
      const list = variants.get(relation.variantMatchGlyph) ?? [];
      list.push(relation);
      variants.set(relation.variantMatchGlyph, list);
    }

    for (const compound of index.compounds) {
      for (const form of compound.matchForms) {
        if (Array.from(form).length !== 2) continue;
        const list = compounds.get(form) ?? [];
        list.push(compound);
        compounds.set(form, list);
      }
    }

    return { direct, historical, variants, characterById, compounds };
  }, [index]);

  const visibleText = useMemo(() => {
    const units = Array.from(sourceText);
    if (!browseMode || pdfRef.current) return sourceText;
    const start = blockIndex * BLOCK_SIZE;
    return units.slice(start, start + BLOCK_SIZE).join('');
  }, [sourceText, browseMode, blockIndex, pdfVersion]);

  const tokens = useMemo<Token[]>(() => {
    const units = Array.from(visibleText);
    const out: Token[] = [];
    let i = 0;

    while (i < units.length) {
      if (includeCompounds && i + 1 < units.length) {
        const pair = `${units[i]}${units[i + 1]}`;
        const compoundHits = indexes.compounds.get(pair) ?? [];
        if (compoundHits.length) {
          const componentIds = compoundHits.flatMap(row => [row.first.characterId, row.second.characterId]);
          out.push({
            key: `compound-${i}`,
            sourceText: pair,
            status: 'compound',
            characters: uniqueById(componentIds.map(id => indexes.characterById.get(id)).filter((x): x is ComparisonCharacter => Boolean(x))),
            variants: [],
            compounds: compoundHits,
          });
          i += 2;
          continue;
        }
      }

      const ch = units[i];
      if (!isHanCharacter(ch)) {
        out.push({ key: `neutral-${i}`, sourceText: ch, status: 'neutral', characters: [], variants: [], compounds: [] });
        i += 1;
        continue;
      }
      const direct = indexes.direct.get(ch) ?? [];
      const historical = indexes.historical.get(ch) ?? [];
      const variantHits = indexes.variants.get(ch) ?? [];

      if (direct.length) {
        out.push({ key: `char-${i}`, sourceText: ch, status: 'source', characters: direct, variants: [], compounds: [] });
      } else if (historical.length) {
        out.push({ key: `historical-${i}`, sourceText: ch, status: 'historical', characters: historical, variants: [], compounds: [] });
      } else if (variantHits.length) {
        const targetCharacters = uniqueById(
          variantHits
            .map(row => indexes.characterById.get(row.variantCharacterId))
            .filter((x): x is ComparisonCharacter => Boolean(x)),
        );
        out.push({ key: `variant-${i}`, sourceText: ch, status: 'variant', characters: targetCharacters, variants: variantHits, compounds: [] });
      } else {
        out.push({ key: `missing-${i}`, sourceText: ch, status: 'missing', characters: [], variants: [], compounds: [] });
      }
      i += 1;
    }
    return out;
  }, [visibleText, includeCompounds, indexes]);

  const tokenStats = useMemo(() => {
    const stats: Record<ComparisonStatus, number> = { source: 0, historical: 0, variant: 0, missing: 0, compound: 0, neutral: 0 };
    for (const token of tokens) stats[token.status] += 1;
    return stats;
  }, [tokens]);

  const textBlockCount = useMemo(() => Math.max(1, Math.ceil(Array.from(sourceText).length / BLOCK_SIZE)), [sourceText]);

  useEffect(() => {
    setSelected(null);
    setDetail(null);
    setDetailError(null);
  }, [blockIndex, sourceText, includeCompounds]);

  useEffect(() => {
    if (!selected) return;
    const frame = window.requestAnimationFrame(() => {
      inspectorBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selected?.key]);

  useEffect(() => {
    const characterId = selected?.status === 'compound' ? null : selected?.characters[0]?.id;
    if (!characterId) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    let active = true;
    setDetailLoading(true);
    setDetailError(null);
    fetch(`/data/character-record/${encodeURIComponent(characterId)}.json`)
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
        return body as CharacterDetailPayload;
      })
      .then(payload => { if (active) setDetail(payload); })
      .catch(error => { if (active) setDetailError(error instanceof Error ? error.message : String(error)); })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [selected]);

  function analyseDraft() {
    pdfRef.current = null;
    setPdfVersion(v => v + 1);
    setSourceText(draftText);
    setBlockIndex(0);
    setStatusMessage('');
  }

  async function loadPdfPage(page: number) {
    const runtime = pdfRef.current;
    if (!runtime) return;
    runtime.page = page;
    setPdfVersion(v => v + 1);
    if (runtime.cache.has(page)) {
      const cached = runtime.cache.get(page) || '';
      setDraftText(cached);
      setSourceText(cached);
      setStatusMessage('');
      return;
    }

    setStatusMessage(`OCR processing page ${page} of ${runtime.numPages}…`);
    const pdfPage = await runtime.doc.getPage(page);
    const viewport = pdfPage.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable.');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await pdfPage.render({ canvasContext: context, viewport }).promise;
    const result = await window.Tesseract.recognize(canvas, 'chi_sim+chi_tra+eng');
    const text = String(result?.data?.text ?? '').trim();
    runtime.cache.set(page, text);
    setDraftText(text);
    setSourceText(text);
    setStatusMessage('');
  }

  async function handleFile(file: File) {
    setStatusMessage('Reading file…');
    try {
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        await ensurePdfOcrLibraries();
        const bytes = await file.arrayBuffer();
        const doc = await window.pdfjsLib.getDocument({ data: bytes }).promise;
        pdfRef.current = { doc, numPages: doc.numPages, page: 1, cache: new Map() };
        setBlockIndex(0);
        await loadPdfPage(1);
      } else {
        pdfRef.current = null;
        const text = await file.text();
        setDraftText(text);
        setSourceText(text);
        setBlockIndex(0);
        setStatusMessage('');
        setPdfVersion(v => v + 1);
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function previousPageOrBlock() {
    const runtime = pdfRef.current;
    if (runtime) {
      if (runtime.page > 1) void loadPdfPage(runtime.page - 1);
      return;
    }
    if (browseMode && blockIndex > 0) setBlockIndex(value => value - 1);
  }

  function nextPageOrBlock() {
    const runtime = pdfRef.current;
    if (runtime) {
      if (runtime.page < runtime.numPages) void loadPdfPage(runtime.page + 1);
      return;
    }
    if (browseMode && blockIndex < textBlockCount - 1) setBlockIndex(value => value + 1);
  }

  const runtime = pdfRef.current;
  const navigationLabel = runtime
    ? `Page ${runtime.page} / ${runtime.numPages}`
    : browseMode
      ? `Block ${Math.min(blockIndex + 1, textBlockCount)} / ${textBlockCount}`
      : 'Full text';

  const previousDisabled = runtime ? runtime.page <= 1 : (!browseMode || blockIndex <= 0);
  const nextDisabled = runtime ? runtime.page >= runtime.numPages : (!browseMode || blockIndex >= textBlockCount - 1);

  const primaryCharacter = selected?.characters[0] ?? null;
  const primaryCompound = selected?.compounds[0] ?? null;
  const firstAttestation = detail?.attestations?.find(att => att.page != null) ?? null;

  return (
    <main className="tc-page">
      <section className="tc-heading">
        <div>
          <span className="tc-kicker">Research tool</span>
          <h1>Text comparison</h1>
          <p>
            Compare an external Chinese text with the lexicographic material represented in the <em>Dictionarium sinico-latinum</em>.
            The tool distinguishes direct attestations, historical non-Unicode forms, occurrence-backed graphic variants, and absent characters.
          </p>
        </div>
        <div className="tc-index-state" aria-live="polite">
          {indexError ? <strong>Index unavailable</strong> : index ? <strong>Comparison index ready</strong> : <strong>Loading comparison index…</strong>}
          <span>{index ? `${index.stats.attestedCharacters} attested characters · ${index.stats.compounds} compounds` : indexError || 'Directus data are being prepared.'}</span>
        </div>
      </section>

      <section className="tc-controls">
        <div className="tc-input-group">
          <label htmlFor="tc-source-text">Text to compare</label>
          <textarea
            id="tc-source-text"
            value={draftText}
            onChange={event => setDraftText(event.target.value)}
            placeholder="Paste Chinese text here, or upload a TXT/PDF file…"
          />
          <div className="tc-input-actions">
            <button type="button" className="tc-btn tc-btn-primary" onClick={analyseDraft} disabled={!draftText.trim() || !index}>Analyse text</button>
            <button type="button" className="tc-btn" onClick={() => fileRef.current?.click()}>Choose file</button>
            <input
              ref={fileRef}
              className="tc-file-input"
              type="file"
              accept=".txt,.text,.md,.pdf,text/plain,application/pdf"
              onChange={event => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
                event.currentTarget.value = '';
              }}
            />
            <span className="tc-status-message">{statusMessage}</span>
          </div>
        </div>

        <div className="tc-options">
          <h2>Comparison options</h2>
          <label className="tc-switch-row">
            <input type="checkbox" checked={romanise} onChange={event => setRomanise(event.target.checked)} />
            <span className="tc-switch" />
            <span><strong>Historical romanisation</strong><small>Replace recognised characters with the best-attested historical reading.</small></span>
          </label>
          <label className="tc-switch-row">
            <input type="checkbox" checked={includeCompounds} onChange={event => setIncludeCompounds(event.target.checked)} />
            <span className="tc-switch" />
            <span><strong>Disyllabic units</strong><small>Match two-character units stored in <code>composite_words</code> before single-character tagging.</small></span>
          </label>
          <label className="tc-switch-row">
            <input type="checkbox" checked={browseMode} disabled={Boolean(runtime)} onChange={event => { setBrowseMode(event.target.checked); setBlockIndex(0); }} />
            <span className="tc-switch" />
            <span><strong>Browse long texts</strong><small>Render long TXT input in blocks of {BLOCK_SIZE} Unicode characters.</small></span>
          </label>
        </div>
      </section>

      <section className="tc-legend" aria-label="Comparison legend">
        <span className="tc-legend-title">Legend</span>
        <span className="tc-legend-item source"><i /> Attested</span>
        <span className="tc-legend-item historical"><i /> Historical glyph</span>
        <span className="tc-legend-item variant"><i /> Graphic variant</span>
        <span className="tc-legend-item missing"><i /> Absent</span>
        <span className="tc-legend-item compound"><i /> Disyllabic unit</span>
      </section>

      <section className="tc-workspace">
        <article className="tc-text-panel">
          <header className="tc-panel-head">
            <div>
              <span className="tc-panel-kicker">Compared text</span>
              <strong>{sourceText ? navigationLabel : 'No text loaded'}</strong>
            </div>
            <div className="tc-nav-controls">
              <button type="button" onClick={previousPageOrBlock} disabled={previousDisabled}>‹</button>
              <span>{navigationLabel}</span>
              <button type="button" onClick={nextPageOrBlock} disabled={nextDisabled}>›</button>
            </div>
          </header>

          <div className="tc-text" aria-live="polite">
            {!sourceText && <p className="tc-empty">Paste or upload a text to begin the comparison.</p>}
            {sourceText && !index && <p className="tc-empty">Preparing the dictionary comparison index…</p>}
            {sourceText && index && tokens.map(token => token.status === 'neutral' ? (
              <span key={token.key} className="tc-token tc-neutral">{token.sourceText}</span>
            ) : (
              <button
                type="button"
                key={token.key}
                className={`tc-token tc-${token.status}${selected?.key === token.key ? ' selected' : ''}`}
                title={STATUS_LABELS[token.status]}
                onClick={() => setSelected(token)}
              >
                {tokenDisplay(token, romanise)}
              </button>
            ))}
          </div>

          {sourceText && index && (
            <footer className="tc-text-stats">
              <span><b>{tokenStats.source}</b> attested</span>
              <span><b>{tokenStats.historical}</b> historical</span>
              <span><b>{tokenStats.variant}</b> variants</span>
              <span><b>{tokenStats.missing}</b> absent</span>
              {includeCompounds && <span><b>{tokenStats.compound}</b> compounds</span>}
            </footer>
          )}
        </article>

        <aside className="tc-inspector">
          <header className="tc-inspector-head">
            <span>Scholarly inspector</span>
            {selected && <button type="button" onClick={() => setSelected(null)} aria-label="Close inspector">×</button>}
          </header>

          {!selected && (
            <div className="tc-inspector-empty">
              <span className="tc-empty-glyph">字</span>
              <strong>Select a tagged element</strong>
              <p>Click a character or compound in the compared text to inspect its status and dictionary data.</p>
            </div>
          )}

          {selected && (
            <div className="tc-inspector-body" ref={inspectorBodyRef}>
              <div className={`tc-status-card tc-status-${selected.status}`}>
                <span>{STATUS_LABELS[selected.status]}</span>
                <strong>{selected.sourceText}</strong>
                {selected.status === 'historical' && selected.characters[0]?.displayCharacter && (
                  <small>Source representation: {selected.characters[0].displayCharacter}</small>
                )}
              </div>

              <nav className="tc-inspector-actions" aria-label="Selected element actions">
                {primaryCharacter && (
                  <a className="tc-action tc-action-primary" href={`/characters/view?id=${primaryCharacter.id}`}>Character record ↗</a>
                )}
                {firstAttestation && (
                  <a
                    className="tc-action"
                    href={`/dictionary?page=${firstAttestation.page}${firstAttestation.line != null ? `&line=${encodeURIComponent(String(firstAttestation.line))}` : ''}`}
                  >
                    Open dictionary locus ↗
                  </a>
                )}
                {selected.status === 'compound' && primaryCompound && (
                  <>
                    <a className="tc-action tc-action-primary" href={`/characters/view?id=${primaryCompound.first.characterId}`}>First component ↗</a>
                    <a className="tc-action" href={`/characters/view?id=${primaryCompound.second.characterId}`}>Second component ↗</a>
                  </>
                )}
                <a className="tc-action" href="/characters">Open character index ↗</a>
                {primaryCharacter?.formalism && primaryCharacter.glyphLink && (
                  <a className="tc-action" href={primaryCharacter.glyphLink} target="_blank" rel="noopener noreferrer">Historical glyph source ↗</a>
                )}
              </nav>

              {selected.status === 'missing' && (
                <section className="tc-detail-section">
                  <h3>No source match</h3>
                  <p>This character is not directly attested, not represented by a linked historical glyph, and not documented as an occurrence-backed graphic variant in the current comparison index.</p>
                </section>
              )}

              {selected.status === 'compound' && selected.compounds.map(compound => (
                <section className="tc-detail-section tc-compound-detail" key={compound.id}>
                  <h3>Composite word #{compound.id}</h3>
                  <div className="tc-compound-word">{compound.displayWord}</div>
                  <dl>
                    <div><dt>Historical reading</dt><dd>{compound.historicalRomanisation || '—'}</dd></div>
                    <div><dt>First component</dt><dd><a href={`/characters/view?id=${compound.first.characterId}`}>{compound.first.glyph}</a> {compound.first.historical || ''}</dd></div>
                    <div><dt>Second component</dt><dd><a href={`/characters/view?id=${compound.second.characterId}`}>{compound.second.glyph}</a> {compound.second.historical || ''}</dd></div>
                    {compound.word && <div><dt>Recorded word</dt><dd>{compound.word}</dd></div>}
                  </dl>
                  <p className="tc-method-note">Composite matching is based exclusively on records currently stored in <code>composite_words</code>.</p>
                </section>
              ))}

              {selected.status === 'variant' && (
                <section className="tc-detail-section">
                  <h3>Graphic-variant evidence</h3>
                  <p>The selected character is not being treated as a main <code>occ.word</code> form here. It is retrieved from a graphic relation explicitly connected to at least one occurrence through <code>occ_chinese_chinese</code>.</p>
                  <div className="tc-variant-list">
                    {selected.variants.map(relation => (
                      <div className="tc-variant-row" key={`${relation.relationId}-${relation.sourceCharacterId}-${relation.variantCharacterId}`}>
                        <span className="tc-variant-pair"><a href={`/characters/view?id=${relation.sourceCharacterId}`}>{relation.sourceGlyph}</a> → <a href={`/characters/view?id=${relation.variantCharacterId}`}>{relation.variantGlyph}</a></span>
                        <span>{relation.typology || 'graphic relation'}</span>
                        <small>{relation.evidenceCount} documentary {relation.evidenceCount === 1 ? 'link' : 'links'}</small>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {selected.status !== 'compound' && selected.status !== 'missing' && selected.characters.length > 0 && (
                <section className="tc-detail-section">
                  <h3>Character record</h3>
                  {selected.characters.map(character => (
                    <div className="tc-character-summary" key={character.id}>
                      <div className="tc-character-title">
                        <span>{character.displayCharacter}</span>
                        <a href={`/characters/view?id=${character.id}`}>Open full record ↗</a>
                      </div>
                      {character.glyphLink && character.formalism && (
                        <a className="tc-glyph-link" href={character.glyphLink} target="_blank" rel="noopener noreferrer">Open historical glyph reference ↗</a>
                      )}
                      <dl>
                        <div><dt>Attestations</dt><dd>{character.attestationCount}</dd></div>
                        <div><dt>Readings</dt><dd>{character.readings.length}</dd></div>
                      </dl>
                      <div className="tc-reading-list">
                        {character.readings.slice(0, 5).map(reading => (
                          <div key={reading.id}>
                            <strong>{reading.historical || reading.modern || '—'}</strong>
                            {reading.english && <span>{normaliseEnglish(reading.english)}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </section>
              )}

              {detailLoading && <DetailSkeleton />}
              {detailError && <div className="tc-detail-error">Detailed record could not be loaded: {detailError}</div>}
              {detail && !detailLoading && (
                <section className="tc-detail-section tc-documentary-detail">
                  <h3>Documentary close-up</h3>
                  {detail.attestations?.length ? (
                    <div className="tc-attestation-list">
                      {detail.attestations.slice(0, 4).map(att => (
                        <article key={att.id}>
                          <div className="tc-attestation-meta">
                            <a href={`/dictionary?page=${att.page ?? ''}${att.line != null ? `&line=${encodeURIComponent(String(att.line))}` : ''}`}>p. {att.page ?? '—'} · l. {att.line ?? '—'}</a>
                            <span>{att.typology || 'occurrence'}</span>
                          </div>
                          {att.latinDefinitionHtml && <div className="tc-latin" dangerouslySetInnerHTML={{ __html: att.latinDefinitionHtml }} />}
                        </article>
                      ))}
                    </div>
                  ) : <p>No direct occurrence is attached to this character record.</p>}
                </section>
              )}
            </div>
          )}
        </aside>
      </section>

      {index?.warnings?.length ? (
        <details className="tc-data-notes">
          <summary>Data-access notes ({index.warnings.length})</summary>
          <ul>{index.warnings.map((warning, idx) => <li key={idx}>{warning}</li>)}</ul>
        </details>
      ) : null}
    </main>
  );
}
