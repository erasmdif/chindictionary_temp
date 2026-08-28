import Papa from 'papaparse';
import { createDirectus, rest, staticToken, readItems, readItem } from '@directus/sdk';
import type { SourceConfig } from '../components/DataTb/types';

export type { SourceConfig } from '../components/DataTb/types';
export type DataRow = Record<string, any>;

/**
 * Fetches data from a configured source
 */
export async function fetchData(source: SourceConfig): Promise<DataRow[]> {
  let fetchedData: DataRow[] = [];

  switch (source.type) {
    case 'csv':
      await new Promise<void>((resolve, reject) => {
        Papa.parse(source.url, {
          download: true,
          header: true,
          delimiter: source.delimiter || ',',
          skipEmptyLines: true,
          dynamicTyping: true,
          complete: (results) => {
            fetchedData = source.skipRows && source.skipRows > 0
              ? (results.data as DataRow[]).slice(source.skipRows)
              : (results.data as DataRow[]);
            resolve();
          },
          error: (error) => {
            reject(error);
          },
        });
      });
      break;

    case 'json':
      if (source.data) {
        fetchedData = source.data;
      } else if (source.url) {
        const response = await fetch(source.url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const jsonData = await response.json();
        fetchedData = Array.isArray(jsonData) ? jsonData : [jsonData];
      }
      break;

    case 'directus':
      if (!source.config) throw new Error('Directus configuration required');
      const client = createDirectus(source.config.url)
        .with(staticToken(source.config.token))
        .with(rest());

      // Handle single item request vs collection query
      if (source.itemId !== undefined) {
        // Fetch single item by ID (more efficient)
        const queryOptions: any = {};
        if (source.fields) queryOptions.fields = source.fields;
        
        const item = await client.request(readItem(source.collection, source.itemId, queryOptions));
        fetchedData = item ? [item] : [];
      } else {
        // Query collection with filters
        const queryOptions: any = {};
        if (source.filter) queryOptions.filter = source.filter;
        if (source.fields) queryOptions.fields = source.fields;
        if (source.sort) queryOptions.sort = source.sort;
        if (source.limit) queryOptions.limit = source.limit;

        const items = await client.request(readItems(source.collection, queryOptions));
        fetchedData = items as any[];
      }
      break;

    case 'geojson':
      if (source.data) {
        // Direct GeoJSON object - extract features as data rows
        const geojsonData = source.data;
        fetchedData = geojsonData.features ? geojsonData.features.map((f: any) => ({
          ...f.properties,
          _geometry: f.geometry,
          _id: f.id
        })) : [];
      } else if (source.url) {
        const geoResponse = await fetch(source.url);
        if (!geoResponse.ok) throw new Error(`HTTP error! status: ${geoResponse.status}`);
        const geojsonData = await geoResponse.json();
        fetchedData = geojsonData.features ? geojsonData.features.map((f: any) => ({
          ...f.properties,
          _geometry: f.geometry,
          _id: f.id
        })) : [];
      }
      break;

    case 'api':
      const apiOptions: RequestInit = {
        method: source.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...source.headers,
        },
      };
      if (source.body && source.method === 'POST') {
        apiOptions.body = JSON.stringify(source.body);
      }
      const apiResponse = await fetch(source.url, apiOptions);
      if (!apiResponse.ok) throw new Error(`HTTP error! status: ${apiResponse.status}`);
      const apiData = await apiResponse.json();

      if (source.transformer) {
        fetchedData = source.transformer(apiData);
      } else if (Array.isArray(apiData)) {
        fetchedData = apiData;
      } else if (apiData.data && Array.isArray(apiData.data)) {
        fetchedData = apiData.data;
      } else {
        fetchedData = [apiData];
      }
      break;
  }

  return fetchedData;
}
