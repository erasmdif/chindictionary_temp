/**
 * Directus Content Loader for Astro Content Collections
 * 
 * This loader fetches data from a Directus API and makes it available
 * as an Astro Content Collection.
 */

import type { Loader } from 'astro/loaders';

export interface DirectusLoaderOptions {
  endpoint?: string;
  token?: string;
  table: string;
  fields?: string[];
  filter?: Record<string, any>;
  sort?: string[];
  limit?: number;
}

export function directusLoader(options: DirectusLoaderOptions): Loader {
  return {
    name: 'directus-loader',
    load: async ({ store, logger }) => {
      const endpoint = options.endpoint || process.env.DIRECTUS_URL;
      const token = options.token || process.env.DIRECTUS_TOKEN;

      if (!endpoint) {
        throw new Error(
          'Directus endpoint not configured. Set DIRECTUS_URL in .env or provide endpoint option.'
        );
      }

      // Build URL
      let url = `${endpoint}/items/${options.table}`;
      const params = new URLSearchParams();

      if (options.fields) {
        params.append('fields', options.fields.join(','));
      }

      if (options.filter) {
        Object.entries(options.filter).forEach(([key, value]) => {
          params.append(`filter[${key}]`, String(value));
        });
      }

      if (options.sort) {
        params.append('sort', options.sort.join(','));
      }

      if (options.limit) {
        params.append('limit', String(options.limit));
      }

      const queryString = params.toString();
      if (queryString) {
        url += `?${queryString}`;
      }

      logger.info(`Fetching from Directus: ${url}`);

      // Fetch data
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      try {
        const response = await fetch(url, { headers });

        if (!response.ok) {
          throw new Error(`Directus API error: ${response.statusText}`);
        }

        const result = await response.json();
        const items = Array.isArray(result.data) ? result.data : [result.data];

        logger.info(`Loaded ${items.length} items from Directus table: ${options.table}`);

        // Store items in the collection
        store.clear();
        
        for (const item of items) {
          store.set({
            id: String(item.id),
            data: item,
          });
        }
      } catch (error) {
        logger.error(`Failed to load from Directus: ${error}`);
        throw error;
      }
    },
  };
}
