import { useEffect, useMemo, useState } from 'react';
import { naturalCompare } from './helpers';
import { useDictionaryIndex } from './useDictionaryIndex';

export default function CharacterOccurrences() {
  const { data, loading, error, warning } = useDictionaryIndex();
  const [characterId, setCharacterId] = useState('');

  useEffect(() => {
    setCharacterId(new URLSearchParams(window.location.search).get('id') ?? '');
  }, []);

  const rows = useMemo(() => data
    .filter(row => String(row.characterId ?? '') === characterId)
    .sort((a, b) => naturalCompare(a.page, b.page) || naturalCompare(a.line, b.line) || naturalCompare(a.id, b.id)),
  [data, characterId]);

  const first = rows[0];
  const readings = useMemo(() => Array.from(new Set(rows.map(row => row.romanization).filter((value): value is string => Boolean(value)))).sort(naturalCompare), [rows]);

  if (loading) return <p>Loading character…</p>;
  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!characterId) return <div className="alert alert-warning">No character ID supplied.</div>;
  if (!first) return <div className="alert alert-warning">Character not found in the published occurrence index.</div>;

  return (
    <div>
      {warning && <div className="alert alert-warning">{warning}</div>}
      <div className="mb-4">
        <h1 className="display-4 mb-2">{first.character || first.simplified || `Character ${characterId}`}</h1>
        {first.simplified && first.simplified !== first.character && <p className="lead mb-2">Modern / simplified: {first.simplified}</p>}
        <dl className="row mb-0">
          <dt className="col-sm-3">Modern strokes</dt><dd className="col-sm-9">{first.modernStrokes ?? '—'}</dd>
          <dt className="col-sm-3">Semantic radical</dt><dd className="col-sm-9">{first.semanticRadical || '—'}</dd>
          <dt className="col-sm-3">Phonetic radical</dt><dd className="col-sm-9">{first.phoneticRadical || '—'}</dd>
          <dt className="col-sm-3">Readings in corpus</dt><dd className="col-sm-9">{readings.join(', ') || '—'}</dd>
          <dt className="col-sm-3">Occurrences</dt><dd className="col-sm-9">{rows.length}</dd>
        </dl>
        {first.glyphLink && <p className="mt-3"><a href={first.glyphLink} target="_blank" rel="noreferrer">External glyph reference</a></p>}
      </div>

      <h2>Dictionary occurrences</h2>
      <div className="table-responsive">
        <table className="table table-hover align-middle">
          <thead>
            <tr>
              <th>Reading</th>
              <th>Latin definition</th>
              <th>Page / line</th>
              <th>Role</th>
              <th>Historical strokes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={String(row.id)}>
                <td>{row.romanization || '—'}</td>
                <td>{row.latinDefinition || '—'}</td>
                <td>{row.page ?? '—'} / {row.line ?? '—'}</td>
                <td>{row.typology || '—'}</td>
                <td>{row.historicalStrokes ?? '—'}</td>
                <td><a href={`/dictionary/view?id=${encodeURIComponent(String(row.id))}`}>Open</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
