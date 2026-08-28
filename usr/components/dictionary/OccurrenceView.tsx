import { useEffect, useMemo, useState } from 'react';
import { naturalCompare } from './helpers';
import { useDictionaryIndex } from './useDictionaryIndex';

export default function OccurrenceView() {
  const { data, loading, error, warning } = useDictionaryIndex();
  const [occurrenceId, setOccurrenceId] = useState('');

  useEffect(() => {
    setOccurrenceId(new URLSearchParams(window.location.search).get('id') ?? '');
  }, []);

  const row = useMemo(() => data.find(item => String(item.id) === occurrenceId), [data, occurrenceId]);

  const sameLine = useMemo(() => {
    if (!row) return [];
    return data
      .filter(item =>
        String(item.dictionaryId ?? '') === String(row.dictionaryId ?? '') &&
        String(item.page ?? '') === String(row.page ?? '') &&
        String(item.line ?? '') === String(row.line ?? '')
      )
      .sort((a, b) => {
        const rank = (value: string | null) => value === 'principale' ? 0 : 1;
        return rank(a.typology) - rank(b.typology) || naturalCompare(a.id, b.id);
      });
  }, [data, row]);

  if (loading) return <p>Loading occurrence…</p>;
  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!occurrenceId) return <div className="alert alert-warning">No occurrence ID supplied.</div>;
  if (!row) return <div className="alert alert-warning">Occurrence not found in the published index.</div>;

  return (
    <div>
      {warning && <div className="alert alert-warning">{warning}</div>}

      <p><a href="/dictionary">← Back to dictionary</a></p>
      <h1>{row.character || row.simplified || '—'} <small className="text-muted">{row.romanization || ''}</small></h1>

      <div className="row g-4 my-2">
        <div className="col-12 col-lg-7">
          <h2>Occurrence</h2>
          <dl className="row">
            <dt className="col-sm-4">Latin definition</dt><dd className="col-sm-8">{row.latinDefinition || '—'}</dd>
            <dt className="col-sm-4">Occurrence role</dt><dd className="col-sm-8">{row.typology || '—'}</dd>
            <dt className="col-sm-4">Page / line</dt><dd className="col-sm-8">{row.page ?? '—'} / {row.line ?? '—'}</dd>
            <dt className="col-sm-4">Historical strokes</dt><dd className="col-sm-8">{row.historicalStrokes ?? '—'}</dd>
            <dt className="col-sm-4">Stroke-section boundary</dt><dd className="col-sm-8">{row.strokeBoundary ? 'Yes' : 'No'}</dd>
            <dt className="col-sm-4">Interpreted word/reading</dt><dd className="col-sm-8">{row.interpreted ? 'Yes' : 'No'}</dd>
          </dl>
        </div>
        <div className="col-12 col-lg-5">
          <h2>Character / reading</h2>
          <dl className="row">
            <dt className="col-sm-5">Character</dt><dd className="col-sm-7"><a href={`/characters/view?id=${encodeURIComponent(String(row.characterId ?? ''))}`}>{row.character || '—'}</a></dd>
            <dt className="col-sm-5">Simplified / modern</dt><dd className="col-sm-7">{row.simplified || '—'}</dd>
            <dt className="col-sm-5">Modern strokes</dt><dd className="col-sm-7">{row.modernStrokes ?? '—'}</dd>
            <dt className="col-sm-5">Historical romanization</dt><dd className="col-sm-7">{row.romanization || '—'}</dd>
            <dt className="col-sm-5">Modern romanization</dt><dd className="col-sm-7">{row.modernRomanization || '—'}</dd>
            <dt className="col-sm-5">Normalized romanization</dt><dd className="col-sm-7">{row.simpleRomanization || '—'}</dd>
            <dt className="col-sm-5">Tone</dt><dd className="col-sm-7">{row.tone ?? '—'}</dd>
            <dt className="col-sm-5">English definition</dt><dd className="col-sm-7">{row.englishDefinition || '—'}</dd>
          </dl>
        </div>
      </div>

      <h2>Printed line context</h2>
      <p className="text-muted">All occurrences sharing the same dictionary, page and line are shown together.</p>
      <div className="table-responsive">
        <table className="table table-hover align-middle">
          <thead><tr><th>Character</th><th>Reading</th><th>Role</th><th>Latin definition</th><th></th></tr></thead>
          <tbody>
            {sameLine.map(item => (
              <tr key={String(item.id)} className={String(item.id) === occurrenceId ? 'table-active' : ''}>
                <td>{item.character || item.simplified || '—'}</td>
                <td>{item.romanization || '—'}</td>
                <td>{item.typology || '—'}</td>
                <td>{item.latinDefinition || '—'}</td>
                <td>{String(item.id) === occurrenceId ? 'Current' : <a href={`/dictionary/view?id=${encodeURIComponent(String(item.id))}`}>Open</a>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
