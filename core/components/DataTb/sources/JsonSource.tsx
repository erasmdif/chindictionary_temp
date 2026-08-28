/**
 * JsonSource Component
 * 
 * Loads data from JSON (inline or remote)
 */

import { useEffect } from 'react';
import type { DataRow, SourceComponentProps } from '../types';

export interface JsonSourceProps extends SourceComponentProps {
  /** Inline JSON data */
  data?: DataRow[];
  
  /** URL to fetch JSON from */
  url?: string;
}

export function JsonSource({
  data,
  url,
  onDataLoad,
  onLoadingChange,
  onError,
}: JsonSourceProps) {
  useEffect(() => {
    const loadJson = async () => {
      try {
        // Use inline data if provided
        if (data) {
          onDataLoad(data);
          return;
        }
        
        // Fetch from URL
        if (!url) {
          onError?.(new Error('JsonSource requires either data or url prop'));
          return;
        }
        
        onLoadingChange?.(true);
        
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const jsonData = await response.json();
        
        // Handle both array and object responses
        const arrayData = Array.isArray(jsonData) ? jsonData : [jsonData];
        
        onDataLoad(arrayData);
        onLoadingChange?.(false);
      } catch (error) {
        onError?.(error instanceof Error ? error : new Error('Failed to load JSON'));
        onLoadingChange?.(false);
      }
    };
    
    loadJson();
  }, [data, url]);
  
  // This component doesn't render anything
  return null;
}
