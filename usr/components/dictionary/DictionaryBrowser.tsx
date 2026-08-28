import { useDeferredValue, useMemo, useState } from 'react';
import { distinctSorted, occurrenceSearchText, text } from './helpers';
import { useDictionaryIndex } from './useDictionaryIndex';

const PAGE_SIZE = 50;

export default function DictionaryBrowser() {
  const { data, loading, error, warning } = useDictionaryIndex();
  const [query, setQuery] = useState('');
  const [historicalStrokes, setHistoricalStrokes] = useState('');
  const [modernStrokes, setModernStrokes] = useState('');
  const [typology, setTypology] = useState('');
  const [pageFilter, setPageFilter] = useState('');
  const [page, setPage] = useState(1);
  const deferredQuery = useDeferredValue(query.trim().normalize('NFKC').toLocaleLowerCase());

  const searchableRows = useMemo(
    () => data.map(row => ({ row, searchText: occurrenceSearchText(row) })),
    [data],
  );

  const historicalStrokeOptions = useMemo(
    () => distinctSorted(data, row => row.historicalStrokes),
    [data],
  );
  const modernStrokeOptions = useMemo(
    () => distinctSorted(data, row => row.modernStrokes),
    [data],
  );
  const typologyOptions = useMemo(
    () => distinctSorted(data, row => row.typology),
    [data],
  );

  const filtered = useMemo(() => searchableRows.filter(({ row, searchText }) => {
    if (deferredQuery && !searchText.includes(deferredQuery)) return false;
    if (historicalStrokes && text(row.historicalStrokes) !== historicalStrokes) return false;
    if (modernStrokes && text(row.modernStrokes) !== modernStrokes) return false;
    if (typology && text(row.typology) !== typology) return false;
    if (pageFilter && text(row.page) !== pageFilter.trim()) return false;
    return true;
  }).map(item => item.row), [searchableRows, deferredQuery, historicalStrokes, modernStrokes, typology, pageFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const resetPage = () => setPage(1);

  if (loading) return <p>Loading dictionary index…</p>;
  if (error) return <div className="alert alert-danger">{error}</div>;

  return (
    <div>
      {warning && <div className="alert alert-warning">{warning}</div>}

      <div className="row g-3 mb-4">
        <div className="col-12 col-lg-5">
          <label className="form-label" htmlFor="dictionary-search">Search</label>
          <input
            id="dictionary-search"
            className="form-control"
            value={query}
            onChange={e => { setQuery(e.target.value); resetPage(); }}
            placeholder="Character, romanization, Latin or English definition…"
          />
        </div>

        <div className="col-6 col-lg-2">
          <label className="form-label" htmlFor="historical-strokes">Historical strokes</label>
          <select
            id="historical-strokes"
            className="form-select"
            value={historicalStrokes}
            onChange={e => { setHistoricalStrokes(e.target.value); resetPage(); }}
          >
            <option value="">All</option>
            {historicalStrokeOptions.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>

        <div className="col-6 col-lg-2">
          <label className="form-label" htmlFor="modern-strokes">Modern strokes</label>
          <select
            id="modern-strokes"
            className="form-select"
            value={modernStrokes}
            onChange={e => { setModernStrokes(e.target.value); resetPage(); }}
          >
            <option value="">All</option>
            {modernStrokeOptions.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>

        <div className="col-6 col-lg-2">
          <label className="form-label" htmlFor="typology">Occurrence role</label>
          <select
            id="typology"
            className="form-select"
            value={typology}
            onChange={e => { setTypology(e.target.value); resetPage(); }}
          >
            <option value="">All</option>
            {typologyOptions.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>

        <div className="col-6 col-lg-1">
          <label className="form-label" htmlFor="page-filter">Page</label>
          <input
            id="page-filter"
            className="form-control"
            value={pageFilter}
            onChange={e => { setPageFilter(e.target.value); resetPage(); }}
            inputMode="numeric"
          />
        </div>
      </div>

      <p className="text-muted mb-2">Preview restricted to printed dictionary pages 1–5.</p>

      <div className="d-flex justify-content-between align-items-center mb-2">
        <strong>{filtered.length.toLocaleString()} occurrences</strong>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={() => {
            setQuery('');
            setHistoricalStrokes('');
            setModernStrokes('');
            setTypology('');
            setPageFilter('');
            setPage(1);
          }}
        >
          Clear filters
        </button>
      </div>

      <div className="table-responsive">
        <table className="table table-hover align-middle">
          <thead>
            <tr>
              <th>Character</th>
              <th>Romanization</th>
              <th>Latin definition</th>
              <th>Page / line</th>
              <th>Role</th>
              <th>Hist. strokes</th>
              <th>Modern strokes</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(row => (
              <tr key={String(row.id)}>
                <td>
                  {row.characterId != null ? (
                    <a href={`/characters/view?id=${encodeURIComponent(String(row.characterId))}`} className="fs-4">
                      {row.character || row.simplified || '—'}
                    </a>
                  ) : (row.character || row.simplified || '—')}
                  {row.simplified && row.simplified !== row.character && (
                    <div className="small text-muted">{row.simplified}</div>
                  )}
                </td>
                <td>
                  <a href={`/dictionary/view?id=${encodeURIComponent(String(row.id))}`}>
                    {row.romanization || '—'}
                  </a>
                  {row.modernRomanization && <div className="small text-muted">{row.modernRomanization}</div>}
                </td>
                <td>{row.latinDefinition || '—'}</td>
                <td>{row.page ?? '—'} / {row.line ?? '—'}</td>
                <td>{row.typology || '—'}</td>
                <td>{row.historicalStrokes ?? '—'}</td>
                <td>{row.modernStrokes ?? '—'}</td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan={7} className="text-center text-muted py-4">No matching occurrences.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <nav className="d-flex justify-content-center align-items-center gap-3 mt-3" aria-label="Dictionary result pages">
          <button className="btn btn-sm btn-outline-secondary" disabled={safePage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Previous</button>
          <span>Page {safePage} of {totalPages}</span>
          <button className="btn btn-sm btn-outline-secondary" disabled={safePage >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Next</button>
        </nav>
      )}
    </div>
  );
}
