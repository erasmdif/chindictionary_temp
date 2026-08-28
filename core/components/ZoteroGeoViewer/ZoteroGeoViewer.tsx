import { useState, useEffect } from 'react';
import type { ZoteroGeoViewerProps } from './types';
import { Map } from '../Map';
import { ZoteroRecordsPreview } from './ZoteroRecordsPreview';

// Module-level cache to avoid re-fetching data
let zoteroCache: Record<string, number> | null = null;
let coordinateCache: any[] | null = null;

const COORDINATES_URL = '/data/zoteroTagCoordinates.geojson';

export function ZoteroGeoViewer(props: ZoteroGeoViewerProps) {
  // Add error handling for props
  if (!props) {
    return (
      <div className="alert alert-danger">
        <h3 className="fw-semibold">Error loading Zotero data</h3>
        <p className="mb-0">Component props are undefined</p>
      </div>
    );
  }

  const {
    groupId,
    layout = '8x4',
    mapHeight = '600px',
    mapCenter = '20.5,40.0,8',
    tagAutocomplete: _tagAutocomplete = true,
    maxItems: _maxItems = 1000
  } = props;

  // Add error handling for required props
  if (!groupId) {
    return (
      <div className="alert alert-danger">
        <h3 className="fw-semibold">Error loading Zotero data</h3>
        <p className="mb-1">Group ID is required</p>
        <p className="small mb-0">Group ID: {groupId}</p>
      </div>
    );
  }
  const [data, setData] = useState<Record<string, number> | null>(null);
  const [mapped, setMapped] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tags, setTags] = useState<Array<{label: string; alts: string[]}>>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTag, setSelectedTag] = useState<{main: string; alternatives: string[]} | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  
  // Per-instance id for namespacing globals when multiple viewers are on same page
  const [instanceId] = useState(() => Math.floor(Math.random() * 1e9));
  const handlerName = `__zotSelectTag_${instanceId}`;

  // Fetch Zotero tags
  async function fetchZoteroTagsFlattened() {
    const baseUrl = `https://api.zotero.org/groups/${groupId}/items/tags`;
    const limit = 100;
    let start = 0;
    let total = Infinity;
    const result: Record<string, number> = {};
    const headers = { Accept: 'application/json' };
    
    while (start < total) {
      const url = `${baseUrl}?start=${start}&limit=${limit}`;
      const resp = await fetch(url, { headers });
      if (!resp.ok) {
        throw new Error(`Zotero API error: ${resp.status} ${resp.statusText}`);
      }
      const items = await resp.json();
      const totalResults = resp.headers.get('Total-Results');
      if (totalResults == null) {
        throw new Error('Missing Total-Results header');
      }
      total = parseInt(totalResults, 10);
      for (const item of items) {
        if (item.tag?.startsWith('@')) {
          result[item.tag] = item.meta.numItems;
        }
      }
      start += limit;
    }
    return result;
  }

  // Fetch coordinate data
  async function fetchCoordinateData() {
    if (coordinateCache) return coordinateCache;
    
    const resp = await fetch(COORDINATES_URL);
    if (!resp.ok) throw new Error('Failed to load zoteroTagCoordinates.geojson');
    const geoJson = await resp.json();
    
    coordinateCache = geoJson.features;
    return geoJson.features;
  }

  // Main data loading effect
  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      try {
        setLoading(true);
        setError(null);

        console.log('Loading Zotero data for group:', groupId);

        // Get Zotero data (use cache if available)
        let zotData = zoteroCache;
        if (!zotData) {
          zotData = await fetchZoteroTagsFlattened();
          zoteroCache = zotData;
        }
        if (cancelled) return;
        setData(zotData);

        console.log('Loaded', Object.keys(zotData).length, 'Zotero tags');

        // Get coordinate data
        const coordinates = await fetchCoordinateData();
        if (cancelled) return;

        console.log('Loaded', coordinates.length, 'coordinate features');

        // Map coordinates to zotero data
        const ontologyTagSet = new Set<string>();
        const mappedFeatures = coordinates.map((coord: any) => {
          const name = coord.properties?.name || '';
          let candidates = [name];
          const altLabel = coord.properties?.altLabel;
          if (altLabel) {
            const splitCandidates = altLabel
              .split(',')
              .map((t: string) => t.trim())
              .filter(Boolean);
            candidates = candidates.concat(splitCandidates);
          }
          const candidateSet = new Set(candidates);

          // Add all @candidates to ontologyTagSet
          for (const term of candidateSet) {
            ontologyTagSet.add('@' + term);
          }

          // Sum zotero counts for all @candidates
          let zoteroCount = 0;
          for (const term of candidateSet) {
            const zotKey = '@' + term;
            if (zotData[zotKey]) {
              zoteroCount += zotData[zotKey];
            }
          }

          return {
            type: 'Feature',
            properties: {
              name,
              altLabel,
              zoteroCount,
            },
            geometry: coord.geometry
          };
        });

        if (cancelled) return;
        setMapped(mappedFeatures);

        console.log('Mapped', mappedFeatures.length, 'features with coordinates');

        // Create tags array for autocomplete
        const byLabel: Record<string, {label: string; alts: string[]}> = {};
        for (const f of mappedFeatures) {
          const name = f?.properties?.name;
          if (!name || typeof name !== 'string') continue;
          const key = name.toLowerCase();
          let entry = byLabel[key];
          if (!entry) {
            entry = { label: name, alts: [] };
            byLabel[key] = entry;
          }
          const altLabel = f?.properties?.altLabel;
          if (typeof altLabel === 'string' && altLabel.trim()) {
            const phrases = altLabel
              .split(',')
              .map((s: string) => s.trim())
              .filter(Boolean);
            const all = new Set([...entry.alts, ...phrases]);
            entry.alts = Array.from(all);
          }
        }
        const tagsArray = Object.values(byLabel).sort((a: any, b: any) => 
          a.label.toLowerCase().localeCompare(b.label.toLowerCase())
        );
        setTags(tagsArray);

        console.log('Created', tagsArray.length, 'tag entries');

      } catch (err) {
        console.error('ZoteroGeoViewer error:', err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'An error occurred');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (groupId) {
      loadAll();
    } else {
      setError('No group ID provided');
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [groupId]);

  // Expose a per-instance global handler for popup buttons to select a tag
  useEffect(() => {
    const name = handlerName;
    (window as any)[name] = (tag: string, altLabels: string) => {
      try {
        if (typeof tag === 'string' && tag.length) {
          setSearchTerm(tag);
          // Include both the main tag and alt labels in the selected tag data
          setSelectedTag({
            main: tag,
            alternatives: altLabels ? altLabels.split(',').map((s: string) => s.trim()).filter(Boolean) : []
          });
        }
      } catch (e) {
        console.error('Error in popup handler:', e);
      }
    };
    return () => {
      try { 
        delete (window as any)[name]; 
      } catch (e) {
        console.error('Error cleaning up handler:', e);
      }
    };
  }, [handlerName]);

  // Filter suggestions based on search term
  const filteredSuggestions = searchTerm.trim() 
    ? tags.filter(t => {
        const v = searchTerm.toLowerCase();
        const inLabel = t.label.toLowerCase().includes(v);
        const inAlt = t.alts.some((a: string) => a.toLowerCase().includes(v));
        return inLabel || inAlt;
      }).slice(0, 10)
    : showDropdown ? tags.slice(0, 10) : []; // Show first 10 tags when focused but no search term

  // Layout configuration
  const getLayoutClasses = () => {
    switch (layout) {
      case 'vertical':
        return 'd-flex flex-column gap-3';
      case 'horizontal':
        return 'd-flex flex-column flex-md-row gap-3';
      case '6x6':
        return 'row g-3';
      case '8x4':
        return 'row g-3';
      case '4x8':
        return 'row g-3';
      case '12x4':
        return 'd-flex flex-column gap-3';
      default:
        return 'row g-3';
    }
  };

  const getMapColSpan = () => {
    switch (layout) {
      case 'horizontal': return 'col-md-8';
      case '6x6': return 'col-md-6';
      case '8x4': return 'col-md-8';
      case '4x8': return 'col-md-4';
      case '12x4': return 'col-12';
      default: return 'col-md-8';
    }
  };

  const getControlsColSpan = () => {
    switch (layout) {
      case 'horizontal': return 'col-md-4';
      case '6x6': return 'col-md-6';
      case '8x4': return 'col-md-4';
      case '4x8': return 'col-md-8';
      case '12x4': return 'col-12';
      default: return 'col-md-4';
    }
  };

  if (loading) {
    return (
      <div className="d-flex align-items-center justify-content-center p-4">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <span className="ms-2">Loading Zotero library...</span>
        <div className="ms-3 small text-secondary">Group ID: {groupId}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-danger">
        <h3 className="fw-semibold">Error loading Zotero data</h3>
        <p className="small mb-1">{error}</p>
        <p className="small mb-0">Group ID: {groupId}</p>
      </div>
    );
  }

  if (!data || !mapped) {
    return <div className="p-3 text-secondary">No data loaded</div>;
  }

  // Prepare GeoJSON for map
  const featuresWithGeometry = mapped.filter(f => f.geometry);
  const geojson = {
    type: 'FeatureCollection' as const,
    features: featuresWithGeometry,
  };

  // ...existing code...
  const totalItems = Object.values(data).reduce((sum, count) => sum + count, 0);
  const geoItems = featuresWithGeometry.reduce((sum, f) => sum + (f.properties.zoteroCount || 0), 0);

  return (
    <div className="zotero-geo-viewer">
      <div className={getLayoutClasses()}>
        {/* Map */}
        <div className={getMapColSpan()}>
          <Map
            height={mapHeight}
            center={mapCenter}
            baseLayers={['EsriSatellite', 'GoogleTerrain', 'Imperium']}
            vectorLayers={mapCenter && geojson && geojson.features.length > 0 ? [{
              name: 'Zotero Items',
              source: { type: 'geojson', data: geojson },
              style: {
                type: 'circle',
                paint: {
                  'circle-radius': [
                    'interpolate',
                    ['linear'],
                    ['get', 'zoteroCount'],
                    0, 4,
                    1, 6,
                    5, 10,
                    20, 16,
                    50, 24
                  ],
                  'circle-color': [
                    'case',
                    ['>', ['get', 'zoteroCount'], 0],
                    '#3b82f6',
                    '#ef4444'
                  ],
                  'circle-opacity': 0.8,
                  'circle-stroke-width': 2,
                  'circle-stroke-color': '#ffffff'
                }
              },
              popupTemplate: `<h4>\${name}</h4><p>\${altLabel}</p><div class="text-sm mb-2">Items: \${zoteroCount}</div><button style="background-color: #1d4ed8; color: white; padding: 8px 16px; border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; margin-top: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);" onmouseover="this.style.backgroundColor='#1e40af'" onmouseout="this.style.backgroundColor='#1d4ed8'" type="button" data-tag="\${name}" data-alt-labels="\${altLabel}" onclick="window['${handlerName}'] && window['${handlerName}'](this.dataset.tag, this.dataset.altLabels)">📚 Show \${zoteroCount} records</button>`,
              visible: true,
              fitToContent: true
            }] : []}
            navigationControl="top-left"
            scaleControl="bottom-left"
            layerControl="top-right"
          />
        </div>

        {/* Controls and Stats */}
        <div className={getControlsColSpan()}>
          <div className="mb-3">
            {/* Library Statistics */}
            <div className="bg-light rounded p-3 mb-3">
              <h3 className="fw-semibold mb-3">Library Statistics</h3>
              <div className="row g-3 small">
                <div className="col-6 text-center">
                  <div className="h4 fw-bold text-primary">{totalItems}</div>
                  <div className="text-secondary">Total Items</div>
                </div>
                <div className="col-6 text-center">
                  <div className="h4 fw-bold text-success">{geoItems}</div>
                  <div className="text-secondary">Georeferenced</div>
                </div>
              </div>
            </div>

            {/* Tag Search */}
            <div className="bg-white border rounded p-3">
              <h3 className="fw-semibold mb-3">Search Tags</h3>
              <div className="position-relative">
                <input
                  type="text"
                  placeholder="Search for locations..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setShowDropdown(true);
                  }}
                  onFocus={() => setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                  className="form-control form-control-sm"
                />
                
                {/* Simple autocomplete */}
                {showDropdown && filteredSuggestions.length > 0 && (
                  <div className="position-absolute w-100 mt-1 bg-white border rounded shadow" style={{zIndex: 1000, maxHeight: '12rem', overflowY: 'auto'}}>
                    {filteredSuggestions.map((tag, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          setSearchTerm(tag.label);
                          setSelectedTag({
                            main: tag.label,
                            alternatives: tag.alts
                          });
                          setShowDropdown(false);
                        }}
                        className="w-100 px-3 py-2 text-start btn btn-sm"
                      >
                        <div className="fw-medium">{tag.label}</div>
                        {tag.alts.length > 0 && (
                          <div className="small text-secondary">
                            Also: {tag.alts.slice(0, 3).join(', ')}
                            {tag.alts.length > 3 && ` +${tag.alts.length - 3} more`}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              {searchTerm && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedTag(null);
                    setShowDropdown(false);
                  }}
                  className="mt-2 small btn btn-link p-0"
                >
                  Clear search
                </button>
              )}
            </div>

            {/* Selected tag info */}
            {selectedTag && (
              <div className="alert alert-info">
                <h4 className="fw-semibold alert-heading">Selected: {selectedTag.main}</h4>
                {selectedTag.alternatives.length > 0 && (
                  <p className="small mb-1">
                    Also includes: {selectedTag.alternatives.join(', ')}
                  </p>
                )}
                <p className="small mb-0">
                  Use the map markers to explore items at this location.
                </p>
              </div>
            )}

            {/* Zotero Records Preview */}
            {selectedTag && (
              <ZoteroRecordsPreview groupId={groupId} tag={selectedTag} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}