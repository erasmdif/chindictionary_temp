/**
 * DirectusSource Component
 * 
 * Loads data from Directus collections using the Directus SDK
 * Requires directusConfig in user.config.mjs
 */

import { useEffect } from 'react';
import { createDirectus, rest, staticToken, readItems } from '@directus/sdk';
import type { SourceComponentProps } from '../types';

export interface DirectusSourceProps extends SourceComponentProps {
  /** Collection name */
  collection: string;
  
  /** Directus configuration */
  config: {
    url: string;
    token: string;
  };
  
  /** Filter query */
  filter?: Record<string, any>;
  
  /** Fields to select */
  fields?: string[];
  
  /** Sort order (e.g., ['-date_created', 'title']) */
  sort?: string[];
  
  /** Limit results */
  limit?: number;
}

export function DirectusSource({
  collection,
  config,
  filter,
  fields,
  sort,
  limit,
  onDataLoad,
  onLoadingChange,
  onError,
}: DirectusSourceProps) {
  useEffect(() => {
    const loadDirectusData = async () => {
      try {
        if (!config.url || !config.token) {
          throw new Error('Directus configuration (url and token) is required');
        }
        
        onLoadingChange?.(true);
        
        // Create Directus client
        const client = createDirectus(config.url)
          .with(staticToken(config.token))
          .with(rest());
        
        // Build query options
        const queryOptions: any = {};
        
        if (filter) {
          queryOptions.filter = filter;
        }
        
        if (fields) {
          queryOptions.fields = fields;
        }
        
        if (sort) {
          queryOptions.sort = sort;
        }
        
        if (limit) {
          queryOptions.limit = limit;
        }
        
        // Fetch data
        const items = await client.request(
          readItems(collection, queryOptions)
        );
        
        onDataLoad(items as any[]);
        onLoadingChange?.(false);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load Directus data';
        onError?.(new Error(`Directus error: ${message}`));
        onLoadingChange?.(false);
      }
    };
    
    loadDirectusData();
  }, [collection, config.url, config.token, JSON.stringify(filter), JSON.stringify(fields), JSON.stringify(sort), limit]);
  
  // This component doesn't render anything
  return null;
}
