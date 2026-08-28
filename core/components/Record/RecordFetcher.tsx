import { useState, useEffect } from 'react';
import type { ComponentType } from 'react';

export interface RecordFetcherProps {
  /** Directus base URL. Defaults to PUBLIC_DIRECTUS_URL env var. */
  directusUrl?: string;
  /** Directus static token for authentication. Defaults to PUBLIC_DIRECTUS_TOKEN env var. */
  directusToken?: string;
  /**
   * Fields to fetch (Directus fields query, e.g. `"*.*.*"`).
   * Defaults to `"*.*.*"`.
   */
  fields?: string;
  /**
   * User-provided layout component that receives the fetched `record` as a prop.
   * It also receives `table` and `id` for context.
   */
  Layout: ComponentType<{ record: any; table: string; id: string }>;
  /** Optional custom loading component. */
  LoadingComponent?: ComponentType;
  /** Optional custom error component. */
  ErrorComponent?: ComponentType<{ table: string; id: string }>;
}

function DefaultLoading() {
  return (
    <div style={{ padding: '2rem', opacity: 0.5 }}>
      Loading record&hellip;
    </div>
  );
}

function DefaultError({ table, id }: { table: string; id: string }) {
  return (
    <div style={{ padding: '2rem', color: 'red' }}>
      Record not found for table &ldquo;{table}&rdquo; with ID &ldquo;{id}&rdquo;.
    </div>
  );
}

/**
 * Core component that reads `table`, `id`, and `fields` from the URL query
 * string, fetches the matching Directus record, and renders the user-supplied
 * `Layout` component with the resolved `record` object.
 *
 * **Usage in an Astro page:**
 * ```astro
 * ---
 * import RecordFetcher from '@core/components/Record/RecordFetcher.tsx';
 * import MyLayout from '@components/MyRecordLayout.tsx';
 * ---
 * <RecordFetcher Layout={MyLayout} client:load />
 * ```
 *
 * **User layout** only needs to accept `record`:
 * ```tsx
 * export default function MyRecordLayout({ record }) {
 *   return <h1>{record.title}</h1>;
 * }
 * ```
 *
 * URL query parameters recognised:
 * - `table` — Directus collection name (required)
 * - `id`    — Record primary key (required)
 * - `fields` — Directus fields selector (optional, overrides the `fields` prop)
 */
export function RecordFetcher({
  directusUrl = import.meta.env.PUBLIC_DIRECTUS_URL ?? '',
  directusToken = import.meta.env.PUBLIC_DIRECTUS_TOKEN ?? '',
  fields: fieldsProp = '*.*.*',
  Layout,
  LoadingComponent = DefaultLoading,
  ErrorComponent = DefaultError,
}: RecordFetcherProps) {
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
        console.error('RecordFetcher: error fetching record:', err);
        setError(true);
        setLoading(false);
      });
  }, [directusUrl, directusToken, fieldsProp]);

  if (loading) return <LoadingComponent />;
  if (error || !record) return <ErrorComponent table={table} id={id} />;

  return <Layout record={record} table={table} id={id} />;
}

export default RecordFetcher;
