/**
 * Content Utility Functions
 * Helper functions for working with Astro Content Collections
 */

import { getCollection } from 'astro:content';

/**
 * Get all entries from a collection sorted by a field (agnostic to collection name)
 */
export async function getSortedCollection(
  collectionName: string,
  sortField: string = 'date',
  order: 'asc' | 'desc' = 'desc'
) {
  const entries = await getCollection(collectionName as any);
  return entries.sort((a, b) => {
    // Type guard: ensure a and b are objects with a 'data' property
    if (
      typeof a !== 'object' || a === null || !('data' in a) ||
      typeof b !== 'object' || b === null || !('data' in b)
    ) {
      return 0;
    }
    const aData = (a as { data: Record<string, any> }).data;
    const bData = (b as { data: Record<string, any> }).data;
    const aValue = aData[sortField];
    const bValue = bData[sortField];
    if (aValue === undefined || bValue === undefined) return 0;
    // Date comparison
    if (
      Object.prototype.toString.call(aValue) === '[object Date]' &&
      Object.prototype.toString.call(bValue) === '[object Date]'
    ) {
      const aTime = (aValue as unknown as Date).getTime();
      const bTime = (bValue as unknown as Date).getTime();
      return order === 'desc' ? bTime - aTime : aTime - bTime;
    }
    // Number comparison
    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return order === 'desc' ? bValue - aValue : aValue - bValue;
    }
    // String comparison
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return order === 'desc' ? bValue.localeCompare(aValue) : aValue.localeCompare(bValue);
    }
    return 0;
  });
}

// Menu extraction logic should be implemented in user code (usr/), not in core.

/**
 * Parse CSV string to JSON
 */
export async function parseCSV(csvText: string): Promise<any[]> {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const results = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const obj: any = {};
    headers.forEach((header, index) => {
      obj[header] = values[index];
    });
    results.push(obj);
  }

  return results;
}

/**
 * Fetch and parse remote data
 */
export async function fetchRemoteData(url: string): Promise<any> {
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type');
  
  if (contentType?.includes('application/json')) {
    return await response.json();
  }
  
  if (contentType?.includes('text/csv') || url.endsWith('.csv')) {
    const text = await response.text();
    return await parseCSV(text);
  }
  
  return await response.text();
}
