/**
 * Core Types for s:CMS
 */

export interface DirectusSource {
  directus: {
    table: string;
    endpoint?: string;
    token?: string;
    queryString?: string;
    id?: number;
    geoField?: string;
  };
}

export interface Path2DataSource {
  path2data: {
    path: string;
  };
}

export interface CustomApiSource {
  customApi: {
    url: string;
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
  };
}

export type DataSource = DirectusSource | Path2DataSource | CustomApiSource;

export interface UIFilter {
  [key: string]: any;
}

export interface SiteConfig {
  site: string;
  title: string;
  description: string;
  author: string;
  integrations?: any[];
  vite?: any;
  markdown?: any;
}
