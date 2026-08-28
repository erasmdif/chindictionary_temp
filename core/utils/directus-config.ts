/**
 * Shared Directus Configuration Utilities
 * 
 * Provides consistent Directus connection handling across components
 */

/**
 * Simple Directus configuration interface
 * Used by Map and DataTb components for a consistent API
 */
export interface DirectusShorthand {
  /** Table/collection name in Directus */
  table: string;
  
  /** Directus query string (e.g., "filter[status][_eq]=published&limit=10") */
  queryString?: string;
  
  /** Optional: Override Directus URL (defaults to PUBLIC_DIRECTUS_URL env var) */
  url?: string;
  
  /** Optional: Override Directus token (defaults to PUBLIC_DIRECTUS_TOKEN env var) */
  token?: string;
}

/**
 * Full Directus source configuration (internal format used by data-fetcher)
 */
export interface DirectusSourceConfig {
  type: 'directus';
  collection: string;
  config: {
    url: string;
    token: string;
  };
  /** Optional: Fetch single item by ID instead of querying collection */
  itemId?: string | number;
  filter?: Record<string, any>;
  fields?: string[];
  sort?: string[];
  limit?: number;
  offset?: number;
  /** GeoJSON field name (for map conversion) - Directus stores GeoJSON as JSON field */
  geoField?: string;
}

/**
 * Parse Directus query string into filter object and other parameters
 * Supports Directus API query syntax: filter[field][operator]=value
 */
export function parseDirectusQueryString(queryString: string): {
  filter?: Record<string, any>;
  fields?: string[];
  sort?: string[];
  limit?: number;
  offset?: number;
} {
  const params = new URLSearchParams(queryString);
  const filter: any = {};
  const fields: string[] = [];
  const sort: string[] = [];
  let limit: number | undefined;
  let offset: number | undefined;
  
  params.forEach((value, key) => {
    // Parse filter syntax: filter[field][operator]=value
    const filterMatch = key.match(/^filter\[([^\]]+)\]\[([^\]]+)\]$/);
    if (filterMatch) {
      const [, field, operator] = filterMatch;
      if (!filter[field]) filter[field] = {};
      // Convert string booleans to actual booleans
      filter[field][operator] = value === 'true' ? true : value === 'false' ? false : value;
    } 
    // Parse fields: fields[]=field1&fields[]=field2 or fields=field1,field2
    else if (key === 'fields[]' || key === 'fields') {
      if (value.includes(',')) {
        fields.push(...value.split(',').map(f => f.trim()));
      } else {
        fields.push(value);
      }
    }
    // Parse sort: sort[]=field1&sort[]=-field2 or sort=field1,-field2
    else if (key === 'sort[]' || key === 'sort') {
      if (value.includes(',')) {
        sort.push(...value.split(',').map(s => s.trim()));
      } else {
        sort.push(value);
      }
    }
    // Parse limit and offset
    else if (key === 'limit') {
      limit = parseInt(value, 10);
    } else if (key === 'offset') {
      offset = parseInt(value, 10);
    }
  });
  
  const result: any = {};
  if (Object.keys(filter).length > 0) result.filter = filter;
  if (fields.length > 0) result.fields = fields;
  if (sort.length > 0) result.sort = sort;
  if (limit !== undefined) result.limit = limit;
  if (offset !== undefined) result.offset = offset;
  
  return result;
}

/**
 * Convert simplified Directus shorthand to full source config
 * Handles environment variables and query string parsing
 */
export function directusShorthandToConfig(directus: DirectusShorthand): DirectusSourceConfig | null {
  const directusUrl = directus.url || import.meta.env.PUBLIC_DIRECTUS_URL;
  const directusToken = directus.token || import.meta.env.PUBLIC_DIRECTUS_TOKEN;
  
  if (!directusUrl) {
    console.error('Directus URL is not configured. Please provide it via the directus.url prop or set PUBLIC_DIRECTUS_URL environment variable.');
    return null;
  }
  
  const sourceConfig: DirectusSourceConfig = {
    type: 'directus',
    collection: directus.table,
    config: {
      url: directusUrl,
      token: directusToken || ''
    }
  };
  
  // Parse query string if provided
  if (directus.queryString) {
    const parsed = parseDirectusQueryString(directus.queryString);
    Object.assign(sourceConfig, parsed);
  }
  
  // Default to no limit if not specified
  if (sourceConfig.limit === undefined) {
    sourceConfig.limit = -1;
  }
  
  return sourceConfig;
}

/**
 * Get Directus connection config from environment or props
 * Returns null if configuration is incomplete
 */
export function getDirectusConfig(url?: string, token?: string): { url: string; token: string } | null {
  const directusUrl = url || import.meta.env.PUBLIC_DIRECTUS_URL;
  const directusToken = token || import.meta.env.PUBLIC_DIRECTUS_TOKEN;
  
  if (!directusUrl) {
    console.error('Directus URL is not configured. Set PUBLIC_DIRECTUS_URL environment variable or pass url prop.');
    return null;
  }
  
  return {
    url: directusUrl,
    token: directusToken || ''
  };
}
