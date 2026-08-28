/**
 * Directus Utility Functions
 * Helper functions for working with Directus API
 */

import type { DirectusSource } from '../types';

/**
 * Build Directus API URL from source configuration
 */
export function buildDirectusUrl(
  source: DirectusSource['directus'],
  filter?: Record<string, any>
): string {
  const endpoint = source.endpoint || import.meta.env.DIRECTUS_URL;
  
  if (!endpoint) {
    throw new Error('Directus endpoint not configured. Set DIRECTUS_URL in .env');
  }

  let url = `${endpoint}/items/${source.table}`;
  
  // Add ID if specified
  if (source.id) {
    url += `/${source.id}`;
  }

  // Build query parameters
  const params = new URLSearchParams();
  
  // Add query string if provided
  if (source.queryString) {
    const existingParams = new URLSearchParams(source.queryString);
    existingParams.forEach((value, key) => params.append(key, value));
  }

  // Add filters
  if (filter) {
    Object.entries(filter).forEach(([key, value]) => {
      params.append(`filter[${key}][_contains]`, String(value));
    });
  }

  const queryString = params.toString();
  if (queryString) {
    url += `?${queryString}`;
  }

  return url;
}

/**
 * Fetch data from Directus API
 */
export async function fetchFromDirectus<T = any>(
  source: DirectusSource['directus'],
  filter?: Record<string, any>
): Promise<T> {
  const url = buildDirectusUrl(source, filter);
  const token = source.token || import.meta.env.DIRECTUS_TOKEN;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`Directus API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data;
}

/**
 * Parse GeoJSON from Directus geometry field
 */
export function parseGeoField(data: any[], geoField: string) {
  return data.map(item => {
    const geometry = item[geoField];
    if (typeof geometry === 'string') {
      try {
        item[geoField] = JSON.parse(geometry);
      } catch (e) {
        console.error('Failed to parse geometry field:', e);
      }
    }
    return item;
  });
}
