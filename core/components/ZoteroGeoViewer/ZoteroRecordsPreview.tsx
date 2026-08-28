import React, { useState, useEffect } from 'react';

// Helper to strip two outermost divs from a HTML string
function stripWrappingDivs(html: string): string {
  if (typeof html !== "string") return html;
  // Remove first <div>...</div>
  html = html.replace(/^\s*<div[^>]*>([\s\S]*)<\/div>\s*$/, "$1");
  // Remove next <div>...</div>
  html = html.replace(/^\s*<div[^>]*>([\s\S]*)<\/div>\s*$/, "$1");
  return html;
}

interface ZoteroItem {
  key: string;
  bib?: string;
  data?: {
    key?: string;
    title?: string;
  };
}

interface ZoteroTag {
  main: string;
  alternatives?: string[];
}

interface ZoteroRecordsPreviewProps {
  groupId: number;
  tag: ZoteroTag | null;
}

export function ZoteroRecordsPreview({ groupId, tag }: ZoteroRecordsPreviewProps) {
  const [records, setRecords] = useState<ZoteroItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tag || !tag.main) {
      setRecords([]);
      setError(null);
      setLoading(false);
      return;
    }
    
    let cancelled = false;

    async function fetchAllRecords() {
      if (!tag || !tag.main) return; // Additional null check for TypeScript
      
      setLoading(true);
      setError(null);
      setRecords([]);

      const allTags = [
        tag.main,
        ...(tag.alternatives || [])
      ].filter(Boolean);
      const tagsQuery = allTags.map(t => `@${t}`).join(' || ');
      
      const baseUrl = `https://api.zotero.org/groups/${groupId}/items`;
      const limit = 100;
      const buildUrl = (start = 0) =>
        `${baseUrl}?sort=date&include=bib&tag=${encodeURIComponent(tagsQuery)}&format=json&limit=${limit}&start=${start}`;

      try {
        let all: ZoteroItem[] = [];
        let start = 0;
        let total: number | null = null;
        let hasNext = true;

        while (hasNext) {
          const resp = await fetch(buildUrl(start), {
            headers: { Accept: "application/json" },
          });
          if (!resp.ok)
            throw new Error(`Zotero API error: ${resp.status} ${resp.statusText}`);

          if (total == null) {
            const totalHeader = resp.headers.get("Total-Results") || resp.headers.get("total-results");
            if (totalHeader) {
              const n = parseInt(totalHeader, 10);
              if (!Number.isNaN(n)) total = n;
            }
          }

          const page = await resp.json();
          if (cancelled) return;

          all = all.concat(page);

          if (total != null) {
            hasNext = all.length < total;
          } else {
            const link = resp.headers.get("Link") || resp.headers.get("link");
            if (link && /rel="next"/i.test(link)) {
              hasNext = true;
            } else {
              hasNext = page.length === limit;
            }
          }
          start += page.length;

          // Update progressively so the UI shows results while loading
          setRecords([...all]);
        }

        if (!cancelled) setRecords(all);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Error fetching records");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAllRecords();
    return () => {
      cancelled = true;
    };
  }, [groupId, tag]);

  if (!tag || !tag.main) return null;
  
  return (
    <div className="mt-3">
      <h4 className="h5 fw-semibold">
        Zotero records for <span className="text-primary">{tag.main}</span>
        {tag.alternatives && tag.alternatives.length > 0 && (
          <small className="text-secondary ms-2">{' '}
            (including: {tag.alternatives.join(", ")})
          </small>
        )}
      </h4>
      {loading && <div className="text-primary">Loading records...</div>}
      {error && <div className="text-danger">Error: {error}</div>}
      {!loading && records && records.length > 0 && (
        <ol className="mt-3">
          {records.map(item => {
            const key = item.key || item.data?.key;
            const zoteroLink = key
              ? `https://www.zotero.org/groups/${groupId}/items/${key}`
              : null;
            return (
              <li
                key={key}
                className="mb-2 ps-3"
                style={{  }}
              >
                {item.bib ? (
                  <span
                    dangerouslySetInnerHTML={{
                      __html: stripWrappingDivs(item.bib),
                    }}
                  />
                ) : item.data && item.data.title ? (
                  item.data.title
                ) : (
                  JSON.stringify(item)
                )}
                {zoteroLink && (
                  <React.Fragment>
                    <br />
                    <a
                      href={zoteroLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="small text-primary text-decoration-underline"
                      style={{ whiteSpace: "nowrap" }}
                    >
                      View in the Zotero Library
                    </a>
                  </React.Fragment>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {!loading && (!records || records.length === 0) && !error && (
        <div className="text-danger">No records found for this tag.</div>
      )}
    </div>
  );
}