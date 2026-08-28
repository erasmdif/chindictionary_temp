import { useState, useEffect } from 'react';

export interface UseRecordFetcherOptions {
  /** Directus base URL. Defaults to PUBLIC_DIRECTUS_URL env var. */
  directusUrl?: string;
  /** Directus static token. Defaults to PUBLIC_DIRECTUS_TOKEN env var. */
  directusToken?: string;
  /**
   * Fields to fetch (Directus fields query).
   * Can be overridden per-request by a `fields` URL query parameter.
   * Defaults to `"*.*.*"`.
   */
  fields?: string;
}

export interface UseRecordFetcherResult {
  record: any | null;
  loading: boolean;
  error: boolean;
  table: string;
  id: string;
}

/**
 * React hook that reads `table`, `id`, and `fields` from the URL query string
 * and fetches the matching Directus record.
 *
 * Designed to be called inside a user component that is itself hydrated by
 * Astro (`client:load` / `client:idle` etc.), avoiding the limitation that
 * Astro cannot serialize React components across the hydration boundary.
 *
 * @example
 * ```tsx
 * // usr/components/RecordView.tsx
 * import { useRecordFetcher } from '@core/components/Record/useRecordFetcher';
 *
 * export default function RecordView() {
 *   const { record, loading, error, table, id } = useRecordFetcher();
 *
 *   if (loading) return <p>Loading…</p>;
 *   if (error || !record) return <p>Record not found.</p>;
 *
 *   return <h1>{record.title}</h1>;
 * }
 * ```
 *
 * ```astro
 * <!-- usr/pages/record.astro -->
 * <RecordView client:load />
 * ```
 */
export function useRecordFetcher({
  directusUrl = import.meta.env.PUBLIC_DIRECTUS_URL ?? '',
  directusToken = import.meta.env.PUBLIC_DIRECTUS_TOKEN ?? '',
  fields: fieldsProp = '*.*.*',
}: UseRecordFetcherOptions = {}): UseRecordFetcherResult {
  const [record, setRecord] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [table, setTable] = useState('');
  const [id, setId] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const actualTable = params.get('table') ?? '';
    const actualId = params.get('id') ?? '';
    const fields = params.get('fields') ?? fieldsProp;

    setTable(actualTable);
    setId(actualId);

    if (!actualTable || !actualId) {
      setError(true);
      setLoading(false);
      return;
    }

    const url = `${directusUrl.replace(/\/$/, '')}/items/${actualTable}/${actualId}?fields=${encodeURIComponent(fields)}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (directusToken) {
      headers['Authorization'] = `Bearer ${directusToken}`;
    }

    fetch(url, { headers })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        setRecord(data.data ?? data);
        setLoading(false);
      })
      .catch(err => {
        console.error('useRecordFetcher: error fetching record:', err);
        setError(true);
        setLoading(false);
      });
  }, [directusUrl, directusToken, fieldsProp]);

  return { record, loading, error, table, id };
}
