// Core package exports
export { default as GalleryAstro } from './components/Gallery/Gallery.astro';
export { Gallery, GalleryMdx, processGalleryImages } from './components/Gallery';
export { default as TableOfContents } from './components/TableOfContents/TableOfContents.astro';

// DataTb (recommended table component)
export { DataTb, CsvSource, JsonSource, DirectusSource, ApiSource } from './components/DataTb';

// Map components
export { Map as MapComponent } from './components/Map';
export { SearchUI, SearchUISimple, SearchUIAdvanced } from './components/Map/Search';

// ZoteroGeoViewer component
export { ZoteroGeoViewer } from './components/ZoteroGeoViewer';
export type { ZoteroGeoViewerProps, ZoteroItem, CoordinateData, LayoutType } from './components/ZoteroGeoViewer';

// Record helpers
export { RecordProvider, Field, Image, RecordFetcher, useRecordFetcher, getValueByDotPath } from './components/Record';
export type { RecordProviderProps, FieldProps, ImageProps, RecordFetcherProps, UseRecordFetcherOptions, UseRecordFetcherResult } from './components/Record';

// Utils
export * from './utils/directus';
export * from './utils/record-fetcher';
export { getRecordFromParams } from './utils/record-fetcher';
// Note: content utils not exported to prevent astro:content in client components
export * from './utils/directus-config';

// Types
export type * from './types';
export type * from './components/Map/types';
