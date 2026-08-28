/**
 * CsvSource Component
 * 
 * Loads data from CSV files (local or remote)
 * Uses PapaParse for parsing
 */

import { useEffect } from 'react';
import Papa from 'papaparse';
import type { SourceComponentProps } from '../types';

export interface CsvSourceProps extends SourceComponentProps {
  /** CSV file URL (local or remote) */
  url: string;
  
  /** Delimiter character (default: ',') */
  delimiter?: string;
  
  /** Skip first N rows */
  skipRows?: number;
}

export function CsvSource({
  url,
  delimiter = ',',
  skipRows = 0,
  onDataLoad,
  onLoadingChange,
  onError,
}: CsvSourceProps) {
  useEffect(() => {
    const loadCsv = async () => {
      try {
        onLoadingChange?.(true);
        
        Papa.parse(url, {
          download: true,
          header: true,
          delimiter,
          skipEmptyLines: true,
          dynamicTyping: true, // Convert numbers and booleans
          complete: (results) => {
            let data = results.data;
            
            // Skip rows if specified
            if (skipRows > 0) {
              data = data.slice(skipRows);
            }
            
            onDataLoad(data as import('../types').DataRow[]);
            onLoadingChange?.(false);
          },
          error: (error) => {
            onError?.(new Error(`Failed to parse CSV: ${error.message}`));
            onLoadingChange?.(false);
          },
        });
      } catch (error) {
        onError?.(error instanceof Error ? error : new Error('Failed to load CSV'));
        onLoadingChange?.(false);
      }
    };
    
    loadCsv();
  }, [url, delimiter, skipRows]);
  
  // This component doesn't render anything
  return null;
}
