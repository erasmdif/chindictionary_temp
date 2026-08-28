import { useState, type SyntheticEvent } from 'react';
import { Search, X, TextSearch } from 'lucide-react';
import type { SearchInFields, SearchQuery, SearchFilter } from '../types';

export interface SearchUISimpleProps {
  fieldList: SearchInFields;
  onSearch: (query: SearchQuery) => void;
  isLoading?: boolean;
  onToggleAdvanced?: () => void;
  currentQuery?: SearchQuery;
}

/**
 * Simple search UI component
 * Provides a single text input that searches across all configured fields using OR logic
 */
export function SearchUISimple({ 
  fieldList, 
  onSearch, 
  isLoading = false,
  onToggleAdvanced,
  currentQuery 
}: SearchUISimpleProps) {
  // Extract search text from currentQuery if it exists and is a simple search (all filters have same value)
  const getInitialSearchText = () => {
    if (!currentQuery?.filters?.length) return '';
    const firstFilter = currentQuery.filters[0];
    if (currentQuery.filters.every(f => f.value === firstFilter.value && f.operator === '_icontains')) {
      return firstFilter.value;
    }
    return '';
  };

  const [searchText, setSearchText] = useState(getInitialSearchText());

  const handleSubmit = (e: SyntheticEvent) => {
    e.preventDefault();
    
    if (!searchText.trim()) {
      // Clear search
      onSearch({ connector: '_or', filters: [] });
      return;
    }

    // Create filters for all searchable fields using case-insensitive contains
    const filters: SearchFilter[] = Object.keys(fieldList).map(field => ({
      field,
      operator: '_icontains',
      value: searchText.trim()
    }));

    onSearch({
      connector: '_or',
      filters
    });
  };

  const handleClear = () => {
    setSearchText('');
    onSearch({ connector: '_or', filters: [] });
  };

  return (
    <div className="search-ui-simple">
      <form onSubmit={handleSubmit} className="mb-3">
        <div className="d-flex gap-2">
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder="Search..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            disabled={isLoading}
          />
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
            disabled={isLoading || !searchText}
          >
            <X className="scms-icon scms-icon-sm" />
            Clear
          </button>
        </div>
      </form>
      
      {onToggleAdvanced && (
        <div className="text-center">
          <button 
            type="button"
            className="btn btn-sm btn-link"
            onClick={onToggleAdvanced}
          >
            <TextSearch className="scms-icon scms-icon-sm" />
            Advanced Search
          </button>
        </div>
      )}
    </div>
  );
}