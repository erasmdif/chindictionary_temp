import { useState, type SyntheticEvent } from 'react';
import { Search, X, Plus, Minus, ArrowLeft } from 'lucide-react';
import type { SearchInFields, SearchQuery, SearchFilter, SearchOperators } from '../types';
import { DEFAULT_OPERATORS, DEFAULT_CONNECTORS } from './SearchOperators';

export interface SearchUIAdvancedProps {
  fieldList: SearchInFields;
  onSearch: (query: SearchQuery) => void;
  operators?: Partial<SearchOperators>;
  isLoading?: boolean;
  onToggleSimple?: () => void;
  currentQuery?: SearchQuery;
}

/**
 * Advanced search UI component
 * Provides multiple field-operator-value triplets with AND/OR logic
 */
export function SearchUIAdvanced({ 
  fieldList, 
  onSearch, 
  operators = {},
  isLoading = false,
  onToggleSimple,
  currentQuery 
}: SearchUIAdvancedProps) {
  const mergedOperators = { ...DEFAULT_OPERATORS, ...operators };
  
  // Initialize state from currentQuery if provided
  const getInitialConnector = (): '_and' | '_or' => {
    return currentQuery?.connector || '_and';
  };

  const getInitialFilters = (): SearchFilter[] => {
    if (currentQuery?.filters?.length) {
      return currentQuery.filters;
    }
    return [{
      field: Object.keys(fieldList)[0] || '',
      operator: Object.keys(mergedOperators)[0] || '_eq',
      value: ''
    }];
  };

  const [connector, setConnector] = useState<'_and' | '_or'>(getInitialConnector());
  const [filters, setFilters] = useState<SearchFilter[]>(getInitialFilters());

  // Get the first field's default value if it has predefined values
  const getDefaultValue = (fieldName: string) => {
    const fieldConfig = fieldList[fieldName];
    if (typeof fieldConfig === 'object' && fieldConfig.values && fieldConfig.values.length > 0) {
      return fieldConfig.values[0];
    }
    return '';
  };

  const addFilter = () => {
    const firstField = Object.keys(fieldList)[0] || '';
    setFilters([...filters, {
      field: firstField,
      operator: Object.keys(mergedOperators)[0] || '_eq',
      value: getDefaultValue(firstField)
    }]);
  };

  const removeFilter = (index: number) => {
    if (filters.length > 1) {
      setFilters(filters.filter((_, i) => i !== index));
    }
  };

  const updateFilter = (index: number, field: keyof SearchFilter, value: any) => {
    const newFilters = [...filters];
    newFilters[index] = { ...newFilters[index], [field]: value };
    
    // If field changed, update default value
    if (field === 'field') {
      newFilters[index].value = getDefaultValue(value);
    }
    
    setFilters(newFilters);
  };

  const handleSubmit = (e: SyntheticEvent) => {
    e.preventDefault();
    
    // Filter out empty values
    const validFilters = filters.filter(f => f.field && f.value !== '');
    
    onSearch({
      connector,
      filters: validFilters
    });
  };

  const handleClear = () => {
    setFilters([{
      field: Object.keys(fieldList)[0] || '',
      operator: Object.keys(mergedOperators)[0] || '_eq',
      value: ''
    }]);
    onSearch({ connector: '_or', filters: [] });
  };

  const hasFilters = () => {
    return filters.some(f => f.field && f.value !== '');
  };

  const getFieldLabel = (fieldName: string): string => {
    const fieldConfig = fieldList[fieldName];
    return typeof fieldConfig === 'string' ? fieldConfig : fieldConfig?.label || fieldName;
  };

  const hasFieldValues = (fieldName: string): boolean => {
    const fieldConfig = fieldList[fieldName];
    return typeof fieldConfig === 'object' && Array.isArray(fieldConfig.values) && fieldConfig.values.length > 0;
  };

  const getFieldValues = (fieldName: string): string[] => {
    const fieldConfig = fieldList[fieldName];
    if (typeof fieldConfig === 'object' && fieldConfig.values) {
      return fieldConfig.values;
    }
    return [];
  };

  return (
    <div className="search-ui-advanced">
      <form onSubmit={handleSubmit}>
        {/* Connector selection (only show if more than one filter) */}
        {filters.length > 1 && (
          <div className="mb-3">
            <div className="d-flex gap-3">
              <label className="d-flex align-items-center gap-2">
                <input
                  type="radio"
                  name="connector"
                  value="_and"
                  checked={connector === '_and'}
                  onChange={(e) => setConnector(e.target.value as '_and' | '_or')}
                  className="form-check-input"
                />
                <span className="small">{DEFAULT_CONNECTORS._and}</span>
              </label>
              
              <label className="d-flex align-items-center gap-2">
                <input
                  type="radio"
                  name="connector"
                  value="_or"
                  checked={connector === '_or'}
                  onChange={(e) => setConnector(e.target.value as '_and' | '_or')}
                  className="form-check-input"
                />
                <span className="small">{DEFAULT_CONNECTORS._or}</span>
              </label>
            </div>
          </div>
        )}

        {/* Filter rows */}
        {filters.map((filter, index) => (
          <div key={index} className="row g-2 mb-2 align-items-center">
            {/* Field selection */}
            <div className="col-3">
              <select
                className="form-select form-select-sm"
                value={filter.field}
                onChange={(e) => updateFilter(index, 'field', e.target.value)}
                disabled={isLoading}
              >
                {Object.entries(fieldList).map(([fieldName, _config]) => (
                  <option key={fieldName} value={fieldName}>
                    {getFieldLabel(fieldName)}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Operator selection */}
            <div className="col-3">
              <select
                className="form-select form-select-sm"
                value={filter.operator}
                onChange={(e) => updateFilter(index, 'operator', e.target.value)}
                disabled={isLoading}
              >
                {Object.entries(mergedOperators).map(([op, label]) => (
                  <option key={op} value={op}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Value input */}
            <div className="col-4">
              {hasFieldValues(filter.field) ? (
                <select
                  className="form-select form-select-sm"
                  value={filter.value}
                  onChange={(e) => updateFilter(index, 'value', e.target.value)}
                  disabled={isLoading}
                >
                  {getFieldValues(filter.field).map(value => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  className="form-control form-control-sm"
                  value={filter.value}
                  onChange={(e) => updateFilter(index, 'value', e.target.value)}
                  disabled={isLoading}
                />
              )}
            </div>
            
            {/* Actions */}
            <div className="col-2 d-flex gap-1">
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => removeFilter(index)}
                disabled={isLoading || filters.length === 1}
                title={filters.length === 1 ? "Cannot remove the last filter" : "Remove filter"}
              >
                <Minus className="scms-icon scms-icon-sm" />
              </button>
            </div>
          </div>
        ))}

        {/* Add Filter Button */}
        <div className="mb-3">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={addFilter}
            disabled={isLoading}
          >
            <Plus className="scms-icon scms-icon-sm" />
            Add Filter
          </button>
        </div>

        {/* Actions */}
        <div className="d-flex gap-2 mt-3">
          <button 
            type="submit" 
            className="btn btn-primary btn-sm"
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="spinner-border spinner-border-sm" role="status">
                <span className="visually-hidden">Loading...</span>
              </span>
            ) : (
              <Search className="scms-icon scms-icon-sm" />
            )}
            Search
          </button>
          <button 
            type="button" 
            className="btn btn-secondary btn-sm"
            onClick={handleClear}
            disabled={isLoading || !hasFilters()}
          >
            <X className="scms-icon scms-icon-sm" />
            Clear
          </button>
          {onToggleSimple && (
            <button 
              type="button"
              className="btn btn-sm btn-link"
              onClick={onToggleSimple}
            >
              <ArrowLeft className="scms-icon scms-icon-sm" />
              Simple Search
            </button>
          )}
        </div>
      </form>
    </div>
  );
}