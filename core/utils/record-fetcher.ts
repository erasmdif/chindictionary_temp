/**
 * Simplified record fetching utility for Directus records
 */

import { fetchData } from './data-fetcher.js';
import { directusShorthandToConfig } from './directus-config.js';

export interface GetRecordOptions {
  table: string;
  id: string;
  fields?: string[];
  url?: string;
  token?: string;
}

/**
 * Fetch a single record from Directus with simplified API
 * 
 * @param options - Record fetching options
 * @returns Promise resolving to the record object or null if not found
 * 
 * @example
 * ```js
 * // Basic usage
 * const record = await getRecord({ table: 'articles', id: '123' });
 * 
 * // With specific fields
 * const record = await getRecord({ 
 *   table: 'articles', 
 *   id: '123',
 *   fields: ['title', 'content', 'author.*']
 * });
 * 
 * // With custom credentials
 * const record = await getRecord({ 
 *   table: 'articles', 
 *   id: '123',
 *   url: 'https://custom.directus.app',
 *   token: 'custom-token'
 * });
 * ```
 */
export async function getRecord(options: GetRecordOptions): Promise<any | null> {
  const {
    table,
    id,
    fields = ['*.*.*'],
    url = import.meta.env.PUBLIC_DIRECTUS_URL,
    token = import.meta.env.PUBLIC_DIRECTUS_TOKEN
  } = options;

  try {
    // Configure Directus connection
    const config = directusShorthandToConfig({
      table,
      url,
      token
    });

    if (!config) {
      console.error('Failed to configure Directus connection');
      return null;
    }

    // Normalize ID: convert to number if it looks numeric, otherwise keep as string
    const normalizedId = /^\d+$/.test(id) ? Number(id) : id;

    // Fetch the record
    const recordData = await fetchData({
      type: 'directus',
      collection: table,
      config: config.config,
      itemId: normalizedId,
      fields
    });
    
    // Return the first (and should be only) record
    return recordData && recordData.length > 0 ? recordData[0] : null;
    
  } catch (err) {
    console.error(`Error fetching record ${id} from ${table}:`, err);
    return null;
  }
}

/**
 * Simplified function for the most common use case
 * 
 * @param table - Directus table/collection name
 * @param id - Record ID
 * @returns Promise resolving to the record object or null
 * 
 * @example
 * ```js
 * const record = await getRecordById('articles', '123');
 * ```
 */
export async function getRecordById(table: string, id: string): Promise<any | null> {
  return getRecord({ table, id });
}

/**
 * Ultra-simplified function for Astro dynamic routes
 * Automatically extracts table and id from Astro.params
 * 
 * @param astro - The Astro global object
 * @returns Promise resolving to the record object or null
 * 
 * @example
 * ```astro
 * ---
 * const record = await getRecordFromParams(Astro);
 * ---
 * ```
 */
export async function getRecordFromParams(astro: any): Promise<any | null> {
  const { table, id } = astro.params;

  if (!table || !id) {
    return null;
  }

  const fieldsParam = astro?.url?.searchParams?.get('fields');
  const fields = fieldsParam
    ? fieldsParam
        .split(',')
        .map((field: string) => field.trim())
        .filter(Boolean)
    : undefined;

  return getRecord({ table, id, fields });
}