/**
 * DataTb Component Exports
 * 
 * Exports the MDX-safe wrapper by default for better compatibility
 * with Astro MDX files
 */

export { DataTb } from './DataTbMdx';

// Source components
export {
  CsvSource,
  JsonSource,
  DirectusSource,
  ApiSource,
} from './sources';

// Types
export type {
  DataRow,
  ColumnConfig,
  PaginationConfig,
  DataTbProps,
  CsvSourceConfig,
  JsonSourceConfig,
  DirectusSourceConfig,
  ApiSourceConfig,
  SourceConfig,
} from './types';

export type {
  CsvSourceProps,
  JsonSourceProps,
  DirectusSourceProps,
  ApiSourceProps,
} from './sources';
