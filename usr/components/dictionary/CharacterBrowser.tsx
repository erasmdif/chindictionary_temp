import { useDeferredValue, useMemo, useState } from 'react';
import { naturalCompare, normalized, text } from './helpers';
import { useDictionaryIndex } from './useDictionaryIndex';
import type { DictionaryOccurrence } from './types';

interface CharacterSummary {
  id: string;
  character: string | null;
  simplified: string | null;
  modernStrokes: string | number | null;
  semanticRadical: string | null;
  phoneticRadical: string | null;
  occurrenceCount: number;
  readings: string[];
}

function buildCharacterSummaries(rows: DictionaryOccurrence[]): CharacterSummary[] {
  const grouped = new Map<string, CharacterSummary & { readingSet: Set<string> }>();

  for (const row of rows) {
    if (row.characterId == null) continue;
    const id = String(row.characterId);
    const existing = grouped.get(id) ?? {
      id,
      character: row.character,
      simplified: row.simplified,
      modernStrokes: row.modernStrokes,
      semanticRadical: row.semanticRadical,
      phoneticRadical: row.phoneticRadical,
      occurrenceCount: 0,
      readings: [],
      readingSet: new Set<string>(),
    };

    existing.occurrenceCount += 1;
    if (row.romanization) existing.readingSet.add(row.romanization);
    grouped.set(id, existing);
  }

  return Array.from(grouped.values()).map(item => ({
    id: item.id,
    character: item.character,
    simplified: item.simplified,
    modernStrokes: item.modernStrokes,
    semanticRadical: item.semanticRadical,
    phoneticRadical: item.phoneticRadical,
    occurrenceCount: item.occurrenceCount,
    readings: Array.from(item.readingSet).sort(naturalCompare),
  }));
}

const CHARACTER_PREVIEW_LIMIT = 100;

export default function CharacterBrowser() {
  const { data, loading, error, warning } = useDictionaryIndex();
  const [query, setQuery] = useState('');
  const [modernStrokes, setModernStrokes] = useState('');
  const deferredQuery = useDeferredValue(normalized(query.trim()));

  // The endpoint is ordered by printed dictionary position. Map insertion order
  // therefore gives us the first appearance of each character in the source.
  const characters = useMemo(
    () => buildCharacterSummaries(data).slice(0, CHARACTER_PREVIEW_LIMIT),
    [data],
  );
  const strokeOptions = useMemo(() => Array.from(new Set(
    characters.map(item => text(item.modernStrokes)).filter(Boolean),
  )).sort(naturalCompare), [characters]);

  const filtered = useMemo(() => characters.filter(item => {
    if (modernStrokes && text(item.modernStrokes) !== modernStrokes) return false;
    if (!deferredQuery) return true;
    const haystack = normalized([
      item.character,
      item.simplified,
      item.semanticRadical,
      item.phoneticRadical,
      item.readings.join(' '),
    ].filter(Boolean).join(' '));
    return haystack.includes(deferredQuery);
  }), [characters, modernStrokes, deferredQuery]);

  if (loading) return <p>Loading character index…</p>;
  if (error) return <div className="alert alert-danger">{error}</div>;

  return (
    <div>
      {warning && <div className="alert alert-warning">{warning}</div>}
      <div className="row g-3 mb-4">
        <div className="col-12 col-md-8">
          <label className="form-label" htmlFor="character-search">Search character / reading / radical</label>
          <input
            id="character-search"
            className="form-control"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Chinese character, normalized form, romanization or radical…"
          />
        </div>
        <div className="col-12 col-md-4">
          <label className="form-label" htmlFor="character-strokes">Modern strokes</label>
          <select id="character-strokes" className="form-select" value={modernStrokes} onChange={e => setModernStrokes(e.target.value)}>
            <option value="">All</option>
            {strokeOptions.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
      </div>

      <p className="text-muted mb-2">Preview: first {CHARACTER_PREVIEW_LIMIT} characters by first appearance in dictionary pages 1–5.</p>
      <p><strong>{filtered.length.toLocaleString()} characters</strong></p>

      <div className="table-responsive">
        <table className="table table-hover align-middle">
          <thead>
            <tr>
              <th>Character</th>
              <th>Simplified / modern</th>
              <th>Modern strokes</th>
              <th>Semantic radical</th>
              <th>Phonetic radical</th>
              <th>Readings</th>
              <th>Occurrences</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => (
              <tr key={item.id}>
                <td><a className="fs-4" href={`/characters/view?id=${encodeURIComponent(item.id)}`}>{item.character || item.simplified || '—'}</a></td>
                <td>{item.simplified || '—'}</td>
                <td>{item.modernStrokes ?? '—'}</td>
                <td>{item.semanticRadical || '—'}</td>
                <td>{item.phoneticRadical || '—'}</td>
                <td>{item.readings.join(', ') || '—'}</td>
                <td>{item.occurrenceCount}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="text-center text-muted py-4">No matching characters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
