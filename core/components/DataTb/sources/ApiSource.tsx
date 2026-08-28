/**
 * ApiSource Component
 * 
 * Loads data from any API endpoint with custom transformation
 */

import { useEffect } from 'react';
import type { DataRow, SourceComponentProps } from '../types';

export interface ApiSourceProps extends SourceComponentProps {
  /** API endpoint URL */
  url: string;
  
  /** HTTP method (default: GET) */
  method?: 'GET' | 'POST';
  
  /** Request headers */
  headers?: Record<string, string>;
  
  /** Request body (for POST) */
  body?: any;
  
  /** Transform response to data rows */
  transformer?: (data: any) => DataRow[];
}

export function ApiSource({
  url,
  method = 'GET',
  headers,
  body,
  transformer,
  onDataLoad,
  onLoadingChange,
  onError,
}: ApiSourceProps) {
  useEffect(() => {
    const loadApiData = async () => {
      try {
        onLoadingChange?.(true);
        
        const options: RequestInit = {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
        };
        
        if (body && method === 'POST') {
          options.body = JSON.stringify(body);
        }
        
        const response = await fetch(url, options);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const responseData = await response.json();
        
        // Apply transformer if provided
        let data: DataRow[];
        if (transformer) {
          data = transformer(responseData);
        } else if (Array.isArray(responseData)) {
          data = responseData;
        } else if (responseData.data && Array.isArray(responseData.data)) {
          // Common API pattern: { data: [...] }
          data = responseData.data;
        } else {
          // Single object response
          data = [responseData];
        }
        
        onDataLoad(data);
        onLoadingChange?.(false);
      } catch (error) {
        onError?.(error instanceof Error ? error : new Error('Failed to load API data'));
        onLoadingChange?.(false);
      }
    };
    
    loadApiData();
  }, [url, method, JSON.stringify(headers), JSON.stringify(body)]);
  
  // This component doesn't render anything
  return null;
}
