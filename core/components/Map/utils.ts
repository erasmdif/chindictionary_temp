/**
 * Map Utilities
 */

import type { DataRow } from '../../utils/data-fetcher';
import type { FeatureCollection, Feature, Geometry } from 'geojson';

/**
 * Tries to identify latitude and longitude fields from a data row
 */
export function getGeoFields(row: DataRow): { latField: string; lngField: string } | null {
  const keys = Object.keys(row);
  
  const latField = keys.find(k => /^(lat|latitude|y)$/i.test(k));
  const lngField = keys.find(k => /^(lng|long|longitude|x)$/i.test(k));
  
  if (latField && lngField) {
    return { latField, lngField };
  }
  
  return null;
}

/**
 * Converts generic data rows to GeoJSON FeatureCollection
 * Handles both coordinate-based data and data already containing geometry
 */
export function dataToGeoJson(
  data: DataRow[],
  customLngField?: string,
  customLatField?: string,
  geoField?: string
): FeatureCollection {
  const features: Feature[] = [];
  
  if (data.length === 0) {
    return { type: 'FeatureCollection', features: [] };
  }
  
  // Check if data already has geometry (from GeoJSON source)
  if (data[0]._geometry) {
    data.forEach((row, index) => {
      features.push({
        type: 'Feature',
        id: row._id || row.id || index,
        geometry: row._geometry,
        properties: { ...row, _geometry: undefined, _id: undefined }
      });
    });
    return { type: 'FeatureCollection', features };
  }
  
  // Check if geoField is provided (from Directus or other sources)
  if (geoField && data[0][geoField]) {
    data.forEach((row, index) => {
      let geometry = row[geoField];
      
      // Parse geometry if it's a string (JSON)
      if (typeof geometry === 'string') {
        try {
          geometry = JSON.parse(geometry);
        } catch (e) {
          console.warn(`Failed to parse geometry field "${geoField}" for row ${index}:`, e);
          return;
        }
      }
      
      // Validate geometry object
      if (geometry && typeof geometry === 'object' && geometry.type && geometry.coordinates) {
        features.push({
          type: 'Feature',
          id: row.id || index,
          geometry: geometry as Geometry,
          properties: { ...row, [geoField]: undefined }
        });
      }
    });
    return { type: 'FeatureCollection', features };
  }
  
  // If custom fields provided, use them
  let latField = customLatField;
  let lngField = customLngField;
  
  // Otherwise, try to detect lat/lng fields
  if (!latField || !lngField) {
    const geoFields = getGeoFields(data[0]);
    if (!geoFields) {
      console.warn('Map: Could not auto-detect simple lat/lng fields in data. GeoJSON conversion failed.');
      return { type: 'FeatureCollection', features: [] };
    }
    latField = latField || geoFields.latField;
    lngField = lngField || geoFields.lngField;
  }
  
  data.forEach((row, index) => {
    const lat = Number(row[latField!]);
    const lng = Number(row[lngField!]);
    
    if (!isNaN(lat) && !isNaN(lng)) {
      features.push({
        type: 'Feature',
        id: row.id || index,
        geometry: {
          type: 'Point',
          coordinates: [lng, lat]
        },
        properties: row
      });
    }
  });
  
  return {
    type: 'FeatureCollection',
    features
  };
}

/**
 * Parses simple string templates with ${variable} syntax
 */
export function parseStringTemplate(template: string, data: Record<string, any>): string {
  return template.replace(/\$\{([^}]+)\}/g, (_, key) => {
    return data[key] !== undefined ? String(data[key]) : '';
  });
}

/**
 * Filter object syntax type (similar to Directus filtering)
 * 
 * Example:
 * { field: { _eq: 'value' } }
 * { field: { _neq: 'value' } }
 * { field: { _in: ['value1', 'value2'] } }
 * { field: { _contains: 'substring' } }
 * { field: { _gt: 100 }, field2: { _eq: 'value' } } // Multiple conditions (AND)
 */
export type FilterObject = {
  [field: string]: {
    _eq?: any;
    _neq?: any;
    _in?: any[];
    _nin?: any[];
    _contains?: string;
    _ncontains?: string;
    _gt?: number;
    _gte?: number;
    _lt?: number;
    _lte?: number;
    _null?: boolean;
    _nnull?: boolean;
  };
};

/**
 * Converts a Directus-like filter object to a JavaScript predicate function
 * Supports both GeoJSON features and CSV rows
 */
export function filterObjectToPredicate(
  filterObj: FilterObject
): (item: Feature | DataRow) => boolean {
  return (item: Feature | DataRow) => {
    // Get properties (for GeoJSON features) or use item directly (for CSV rows)
    const properties = 'properties' in item ? item.properties : item;
    
    // Check all field conditions (AND logic)
    for (const [field, conditions] of Object.entries(filterObj)) {
      const value = properties?.[field];
      
      // Check each operator
      for (const [operator, expected] of Object.entries(conditions)) {
        switch (operator) {
          case '_eq':
            if (value != expected) return false; // Loose equality
            break;
          case '_neq':
            if (value == expected) return false;
            break;
          case '_in':
            if (!Array.isArray(expected) || !expected.includes(value)) return false;
            break;
          case '_nin':
            if (!Array.isArray(expected) || expected.includes(value)) return false;
            break;
          case '_contains':
            if (typeof value !== 'string' || !value.includes(String(expected))) return false;
            break;
          case '_ncontains':
            if (typeof value !== 'string' || value.includes(String(expected))) return false;
            break;
          case '_gt':
            if (Number(value) <= Number(expected)) return false;
            break;
          case '_gte':
            if (Number(value) < Number(expected)) return false;
            break;
          case '_lt':
            if (Number(value) >= Number(expected)) return false;
            break;
          case '_lte':
            if (Number(value) > Number(expected)) return false;
            break;
          case '_null':
            if (expected === true && value != null) return false;
            if (expected === false && value == null) return false;
            break;
          case '_nnull':
            if (expected === true && value == null) return false;
            if (expected === false && value != null) return false;
            break;
        }
      }
    }
    
    return true;
  };
}

/**
 * Converts a search query to a MapLibre filter expression
 * This provides better performance than client-side filtering for large datasets
 */
export function searchQueryToMapLibreFilter(query: import('./types').SearchQuery): any[] | null {
  if (!query.filters || query.filters.length === 0) {
    return null; // No filter
  }

  const filters = query.filters.map(filter => {
    const { field, operator, value } = filter;
    
    switch (operator) {
      case '_eq':
        return ['==', ['get', field], value];
      case '_neq':
        return ['!=', ['get', field], value];
      case '_gt':
        return ['>', ['get', field], value];
      case '_gte':
        return ['>=', ['get', field], value];
      case '_lt':
        return ['<', ['get', field], value];
      case '_lte':
        return ['<=', ['get', field], value];
      case '_contains':
        return ['in', value, ['get', field]];
      case '_icontains':
        // Case-insensitive contains using downcase for both field value and search value
        return ['in', ['downcase', value], ['downcase', ['get', field]]];
      case '_ncontains':
        return ['!', ['in', value, ['get', field]]];
      case '_starts_with':
        return ['==', ['slice', ['get', field], 0, value.length], value];
      case '_istarts_with':
        // Case-insensitive starts with using downcase
        return ['==', ['slice', ['downcase', ['get', field]], 0, value.length], ['downcase', value]];
      case '_nstarts_with':
        return ['!=', ['slice', ['get', field], 0, value.length], value];
      case '_ends_with':
        return ['==', ['slice', ['get', field], ['-', ['length', ['get', field]], value.length]], value];
      case '_iends_with':
        // Case-insensitive ends with using downcase
        return ['==', ['slice', ['downcase', ['get', field]], ['-', ['length', ['get', field]], value.length]], ['downcase', value]];
      case '_nends_with':
        return ['!=', ['slice', ['get', field], ['-', ['length', ['get', field]], value.length]], value];
      case '_null':
        return ['==', ['get', field], null];
      case '_nnull':
        return ['!=', ['get', field], null];
      default:
        console.warn(`Unsupported search operator for MapLibre filter: ${operator}`);
        return ['==', ['get', field], value];
    }
  });

  // Combine filters with the specified connector
  if (filters.length === 1) {
    return filters[0];
  }

  if (query.connector === '_and') {
    return ['all', ...filters];
  } else {
    return ['any', ...filters];
  }
}

/**
 * Converts a search query to a client-side predicate function
 * Fallback when MapLibre filtering is not suitable or for complex operations
 */
export function searchQueryToPredicate(query: import('./types').SearchQuery): (item: Feature | DataRow) => boolean {
  if (!query.filters || query.filters.length === 0) {
    return () => true; // No filter, match all
  }

  return (item: Feature | DataRow) => {
    const properties = 'properties' in item ? item.properties : item;
    
    const results = query.filters.map(filter => {
      const { field, operator, value } = filter;
      const fieldValue = properties?.[field];
      
      switch (operator) {
        case '_eq':
          return fieldValue == value;
        case '_neq':
          return fieldValue != value;
        case '_gt':
          return Number(fieldValue) > Number(value);
        case '_gte':
          return Number(fieldValue) >= Number(value);
        case '_lt':
          return Number(fieldValue) < Number(value);
        case '_lte':
          return Number(fieldValue) <= Number(value);
        case '_contains':
          return typeof fieldValue === 'string' && fieldValue.includes(String(value));
        case '_icontains':
          return typeof fieldValue === 'string' && fieldValue.toLowerCase().includes(String(value).toLowerCase());
        case '_ncontains':
          return typeof fieldValue === 'string' && !fieldValue.includes(String(value));
        case '_starts_with':
          return typeof fieldValue === 'string' && fieldValue.startsWith(String(value));
        case '_istarts_with':
          return typeof fieldValue === 'string' && fieldValue.toLowerCase().startsWith(String(value).toLowerCase());
        case '_nstarts_with':
          return typeof fieldValue === 'string' && !fieldValue.startsWith(String(value));
        case '_ends_with':
          return typeof fieldValue === 'string' && fieldValue.endsWith(String(value));
        case '_iends_with':
          return typeof fieldValue === 'string' && fieldValue.toLowerCase().endsWith(String(value).toLowerCase());
        case '_nends_with':
          return typeof fieldValue === 'string' && !fieldValue.endsWith(String(value));
        case '_null':
          return fieldValue == null;
        case '_nnull':
          return fieldValue != null;
        default:
          console.warn(`Unsupported search operator: ${operator}`);
          return true;
      }
    });
    
    // Apply connector logic
    return query.connector === '_and' 
      ? results.every(Boolean)
      : results.some(Boolean);
  };
}
