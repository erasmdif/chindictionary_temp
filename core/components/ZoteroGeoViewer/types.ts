/**
 * ZoteroGeoViewer Component Types
 */

export interface ZoteroItem {
  key: string;
  version: number;
  library: {
    type: string;
    id: number;
    name: string;
    links: {
      alternate: {
        href: string;
        type: string;
      };
    };
  };
  links: {
    self: {
      href: string;
      type: string;
    };
    alternate: {
      href: string;
      type: string;
    };
  };
  meta: {
    parsedDate: string;
    numChildren: number;
  };
  data: {
    key: string;
    version: number;
    itemType: string;
    title: string;
    creators: Array<{
      creatorType: string;
      firstName: string;
      lastName: string;
    }>;
    abstractNote: string;
    publicationTitle: string;
    volume: string;
    issue: string;
    pages: string;
    date: string;
    series: string;
    seriesTitle: string;
    seriesText: string;
    journalAbbreviation: string;
    language: string;
    DOI: string;
    ISSN: string;
    shortTitle: string;
    url: string;
    accessDate: string;
    archive: string;
    archiveLocation: string;
    libraryCatalog: string;
    callNumber: string;
    rights: string;
    extra: string;
    tags: Array<{
      tag: string;
      type?: number;
    }>;
    collections: string[];
    relations: Record<string, any>;
    dateAdded: string;
    dateModified: string;
  };
}

export interface CoordinateData {
  name: string;
  altLabel?: string | null;
  id: number;
  source?: string | null;
  coordinates: [number, number]; // [longitude, latitude]
}

export interface ZoteroGeoData extends GeoJSON.FeatureCollection {
  features: Array<GeoJSON.Feature & {
    properties: CoordinateData & {
      zoteroItems?: ZoteroItem[];
    };
  }>;
}

export type LayoutType = 
  | 'vertical' 
  | '6x6' 
  | '8x4' 
  | '4x8' 
  | '12x4' 
  | 'horizontal';

export interface ZoteroGeoViewerProps {
  /** Zotero group ID (required) */
  groupId: number;
  
  /** Layout configuration for the display */
  layout?: LayoutType;
  
  /** Custom map height */
  mapHeight?: string;
  
  /** Custom map center (lng,lat,zoom) */
  mapCenter?: string;
  
  /** Enable/disable tag autocomplete */
  tagAutocomplete?: boolean;
  
  /** Maximum number of items to display */
  maxItems?: number;
}

export interface ZoteroApiResponse {
  items: ZoteroItem[];
  totalResults: number;
}