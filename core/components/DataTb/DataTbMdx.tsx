/**
 * MDX-safe wrapper for DataTb component
 * 
 * This wrapper ensures that object props are properly memoized
 * to prevent infinite re-renders in MDX context
 */

import { useMemo } from 'react';
import { DataTb as DataTbCore } from './DataTb';
import type { DataTbProps, SourceConfig } from './types';
import { directusShorthandToConfig } from '../../utils/directus-config';

export function DataTb(props: DataTbProps) {
  // Resolve source from simplified props or original source prop
  const resolvedSource = useMemo<SourceConfig | undefined>(() => {
    // If explicit source object is provided, use it (memoized later)
    if (props.source) return props.source;

    // Handle simplified CSV prop
    if (props.csv) {
      return { type: 'csv', url: props.csv } as const;
    }

    // Handle simplified JSON prop
    if (props.json) {
      if (Array.isArray(props.json)) {
        return { type: 'json', data: props.json } as const;
      }
      return { type: 'json', url: props.json as string } as const;
    }

    // Handle simplified API prop
    if (props.api) {
      return { type: 'api', url: props.api } as const;
    }

    // Handle simplified Directus prop (same interface as Map component)
    if (props.directus) {
      const directusSource = directusShorthandToConfig(props.directus);
      return directusSource ?? undefined;
    }

    return undefined;
  }, [props.source, props.csv, props.json, props.api, JSON.stringify(props.directus)]);

  // Memoize the source object to prevent re-creation on every render
  // This is critical for MDX which might recreate objects on every pass
  const stableSource = useMemo(() => resolvedSource, [JSON.stringify(resolvedSource)]);

  // Memoize columns if provided
  const stableColumns = useMemo(() => props.columns, [JSON.stringify(props.columns)]);

  // Memoize pagination config if it's an object
  const stablePagination = useMemo(() => {
    if (typeof props.pagination === 'object') {
      return props.pagination;
    }
    return props.pagination;
  }, [JSON.stringify(props.pagination)]);

  // Memoize initialSort if provided
  const stableInitialSort = useMemo(() => props.initialSort, [JSON.stringify(props.initialSort)]);

  return (
    <DataTbCore
      {...props}
      source={stableSource}
      columns={stableColumns}
      pagination={stablePagination}
      initialSort={stableInitialSort}
    />
  );
}

export default DataTb;
