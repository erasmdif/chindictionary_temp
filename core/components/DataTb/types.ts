/**
 * DataTb Type Definitions
 * 
 * Core types for the DataTb component system
 */


import type { DirectusShorthand, DirectusSourceConfig } from '../../utils/directus-config';

/**
 * Base data row type - can be extended with specific fields
 */
export type DataRow = Record<string, any>;

/**
 * Column configuration with optional formatting
 */
export interface ColumnConfig {
  /** Column key matching data property */
  key: string;

  /** Display header text */
  header: string;

  /** Enable sorting for this column */
  sortable?: boolean;

  /** Format type for automatic formatting */
  format?: 'date' | 'number' | 'currency' | 'percent';

  /** Custom render function */
  render?: (value: any, row: DataRow) => React.ReactNode;

  /** Value mapping labels (e.g. { "true": "Yes", "false": "No" }) */
  labels?: Record<string, string>;

  /** Column width (CSS value) */
  width?: string;
}

/**
 * Pagination configuration
 */
export interface PaginationConfig {
  /** Number of rows per page */
  pageSize?: number;

  /** Show page size selector */
  showPageSize?: boolean;

  /** Available page size options */
  pageSizeOptions?: number[];
}

/**
 * Source type discriminators
 */
export type SourceType = 'csv' | 'json' | 'directus' | 'api';

/**
 * CSV Source configuration
 */
export interface CsvSourceConfig {
  type: 'csv';
  url: string;
  /** Delimiter (default: ',') */
  delimiter?: string;
  /** Skip first N rows */
  skipRows?: number;
  /** Longitude column name (for map conversion) */
  lng?: string;
  /** Latitude column name (for map conversion) */
  lat?: string;
}

/**
 * JSON Source configuration
 */
export interface JsonSourceConfig {
  type: 'json';
  /** Inline data */
  data?: DataRow[];
  /** URL to fetch JSON from */
  url?: string;
}

// Re-export DirectusSourceConfig from shared utils
export type { DirectusSourceConfig } from '../../utils/directus-config';

/**
 * Generic API Source configuration
 */
export interface ApiSourceConfig {
  type: 'api';
  /** API endpoint URL */
  url: string;
  /** HTTP method */
  method?: 'GET' | 'POST';
  /** Request headers */
  headers?: Record<string, string>;
  /** Request body (for POST) */
  body?: any;
  /** Transform response data */
  transformer?: (data: any) => DataRow[];
}

/**
 * GeoJSON Source configuration
 */
export interface GeoJsonSourceConfig {
  type: 'geojson';
  /** GeoJSON data object */
  data?: any;
  /** URL to fetch GeoJSON from */
  url?: string;
}

/**
 * Vector Tile Source configuration (from MapLibre style JSON)
 */
export interface VectorSourceConfig {
  type: 'vector';
  /** Vector tile URL or template */
  url?: string;
}

/**
 * Union of all source configurations
 */
export type SourceConfig =
  | CsvSourceConfig
  | JsonSourceConfig
  | DirectusSourceConfig
  | ApiSourceConfig
  | GeoJsonSourceConfig
  | VectorSourceConfig;

/**
 * Props for source components
 */
export interface SourceComponentProps {
  /** Callback to provide data to parent */
  onDataLoad: (data: DataRow[]) => void;
  /** Callback for loading state */
  onLoadingChange?: (loading: boolean) => void;
  /** Callback for error state */
  onError?: (error: Error) => void;
}

/**
 * DataTb main component props
 */
export interface DataTbProps {
  /** Column definitions (optional - will auto-detect if not provided) */
  columns?: ColumnConfig[];

  /** Enable global search/filter */
  searchable?: boolean;

  /** Pagination configuration */
  pagination?: boolean | PaginationConfig;

  /** Enable column sorting */
  sortable?: boolean;

  /** Initial sort state */
  initialSort?: {
    columnKey: string;
    direction: 'asc' | 'desc';
  };

  /** Custom CSS classes */
  className?: string;

  /** Data source configuration */
  source?: SourceConfig;

  /** Loading state message */
  loadingMessage?: string;

  /** Empty state message */
  emptyMessage?: string;

  /** Error message */
  errorMessage?: string;

  /** Truncate large cell content by default */
  truncateContent?: boolean;

  /** Max width for truncated cell content (CSS value) */
  truncateMaxWidth?: string;

  /** Table body content size */
  contentSize?: 'sm' | 'md';

  /** Simplified CSV Source URL (MDX friendly) */
  csv?: string;

  /** Simplified JSON Source Data or URL (MDX friendly) */
  json?: any[] | string;

  /** Simplified API Source URL (MDX friendly) */
  api?: string;

  /** Simplified Directus configuration (MDX friendly) - uses same interface as Map component */
  directus?: DirectusShorthand;
}
