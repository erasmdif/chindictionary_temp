/**
 * DataTb Component
 * 
 * Main data table component using TanStack Table
 * Supports sorting, filtering, and pagination
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type SortingState,
  type ColumnFiltersState,
} from '@tanstack/react-table';
import { fetchData } from '../../utils/data-fetcher';
import type { DataRow, DataTbProps } from './types';
import {
  autoDetectColumns,
  mergeColumns,
  columnConfigToColumnDef,
  globalFilterFn,
} from './utils';

export function DataTb({
  columns: userColumns,
  searchable = false,
  pagination = true,
  sortable = true,
  initialSort,
  className = '',
  source,
  loadingMessage = 'Loading data...',
  emptyMessage = 'No data available',
  errorMessage = 'Error loading data',
  truncateContent = true,
  truncateMaxWidth = '20rem',
  contentSize = 'sm',
}: DataTbProps) {
  const [data, setData] = useState<DataRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [sorting, setSorting] = useState<SortingState>(
    initialSort ? [{ id: initialSort.columnKey, desc: initialSort.direction === 'desc' }] : []
  );
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  // Use a ref to track source changes more reliably
  const sourceRef = useRef<string>('');
  const currentSourceKey = JSON.stringify(source);

  // Pagination config
  const paginationConfig = typeof pagination === 'object' ? pagination : {};
  const pageSize = paginationConfig.pageSize || 10;
  const pageSizeOptions = paginationConfig.pageSizeOptions || [10, 20, 50, 100];
  const contentSizeClass = contentSize === 'sm' ? 'small' : '';

  // Fetch data based on source configuration
  useEffect(() => {
    // Check if source has actually changed
    if (currentSourceKey === sourceRef.current) {
      return;
    }

    sourceRef.current = currentSourceKey;

    if (!source) {
      setError(new Error('No data source provided'));
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const fetchedData = await fetchData(source);
        
        setData(fetchedData);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load data'));
        setLoading(false);
      }
    };

    loadData();
  }, [currentSourceKey]); // Use stringified source as dependency

  // Auto-detect or merge columns
  const finalColumns = useMemo(() => {
    if (data.length === 0) {
      return [];
    }

    const autoColumns = autoDetectColumns(data);
    const merged = mergeColumns(autoColumns, userColumns);
    return merged;
  }, [data, userColumns]);

  // Convert to TanStack column definitions
  const columnDefs = useMemo(
    () => finalColumns.map(columnConfigToColumnDef),
    [finalColumns]
  );

  // Initialize table
  const table = useReactTable({
    data,
    columns: columnDefs,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: sortable ? getSortedRowModel() : undefined,
    getFilteredRowModel: searchable ? getFilteredRowModel() : undefined,
    getPaginationRowModel: pagination ? getPaginationRowModel() : undefined,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: globalFilterFn,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    initialState: {
      pagination: {
        pageSize,
      },
    },
  });

  // Render loading state
  if (loading) {
    return (
      <div className="datatb-container">
        <div className="datatb-loading p-4 text-center text-secondary">
          {loadingMessage}
        </div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="datatb-container">
        <div className="datatb-error p-4 text-center text-danger">
          {errorMessage}: {error.message}
        </div>
      </div>
    );
  }

  // Render empty state
  if (data.length === 0) {
    return (
      <div className="datatb-container">
        <div className="datatb-empty p-4 text-center text-secondary">
          {emptyMessage}
        </div>
      </div>
    );
  }

  return (
    <div className={`datatb-container ${className}`}>

      {/* Search input */}
      {searchable && (
        <div className="datatb-search mb-3">
          <input
            type="text"
            value={globalFilter ?? ''}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search..."
            className="form-control form-control-sm"
            style={{ maxWidth: '24rem' }}
          />
        </div>
      )}

      {/* Table */}
      <div className="datatb-table-wrapper table-responsive border rounded shadow-sm">
        <table className="datatb-table table table-sm table-hover mb-0">
          <thead className="table-light">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header, index) => (
                  <th
                    key={header.id}
                    className={`py-2 text-start small fw-semibold text-uppercase ${
                      index === 0 ? 'ps-3 pe-3' : 'px-3'
                    }`}
                    style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                  >
                    {header.isPlaceholder ? null : (
                      <div
                        className={
                          header.column.getCanSort()
                            ? 'd-flex align-items-center gap-2 user-select-none'
                            : 'd-flex align-items-center gap-2'
                        }
                        onClick={header.column.getToggleSortingHandler()}
                        style={header.column.getCanSort() ? { cursor: 'pointer' } : undefined}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        {header.column.getCanSort() && (
                          <span className="text-secondary">
                            {{
                              asc: '↑',
                              desc: '↓',
                            }[header.column.getIsSorted() as string] ?? '↕'}
                          </span>
                        )}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell, index) => (
                  <td
                    key={cell.id}
                    className={`py-2 ${contentSizeClass} ${
                      index === 0 ? 'ps-3 pe-3' : 'px-3'
                    }`}
                  >
                    {(() => {
                      const cellContent = flexRender(cell.column.columnDef.cell, cell.getContext());
                      const isSimpleText =
                        typeof cellContent === 'string' || typeof cellContent === 'number';

                      if (!truncateContent) {
                        return cellContent;
                      }

                      return (
                        <div
                          className="text-truncate"
                          style={{ maxWidth: truncateMaxWidth }}
                          title={isSimpleText ? String(cellContent) : undefined}
                        >
                          {cellContent}
                        </div>
                      );
                    })()}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && (
        <div className="datatb-pagination mt-3 d-flex flex-row align-items-center justify-content-between gap-2">
          <div className="btn-group" role="group">
            <button
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
              className="btn btn-outline-secondary btn-sm"
            >
              {'<<'}
            </button>
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="btn btn-outline-secondary btn-sm"
            >
              {'<'}
            </button>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="btn btn-outline-secondary btn-sm"
            >
              {'>'}
            </button>
            <button
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
              className="btn btn-outline-secondary btn-sm"
            >
              {'>>'}
            </button>
          </div>

          <div className="d-flex align-items-center gap-2 flex-nowrap">
            <span className="small text-secondary text-nowrap">
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            </span>

            {paginationConfig.showPageSize !== false && (
              <select
                value={table.getState().pagination.pageSize}
                onChange={(e) => {
                  table.setPageSize(Number(e.target.value));
                }}
                className="form-select form-select-sm"
                style={{ width: 'auto' }}
              >
                {pageSizeOptions.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            )}

            <span className="small text-secondary text-nowrap">
              ({data.length} total)
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
