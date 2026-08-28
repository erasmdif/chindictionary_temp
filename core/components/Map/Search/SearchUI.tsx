import { useState } from 'react';
import type { SearchInFields, SearchQuery, SearchOperators } from '../types';
import { SearchUISimple } from './SearchUISimple';
import { SearchUIAdvanced } from './SearchUIAdvanced';

export interface SearchUIProps {
  fieldList: SearchInFields;
  onSearch: (query: SearchQuery) => void;
  operators?: Partial<SearchOperators>;
  isLoading?: boolean;
  limitTo?: 'simple' | 'advanced';
  currentQuery?: SearchQuery;
}

/**
 * Main search UI component
 * Handles switching between simple and advanced search modes
 */
export function SearchUI({ 
  fieldList, 
  onSearch, 
  operators,
  isLoading = false,
  limitTo,
  currentQuery 
}: SearchUIProps) {
  const [isAdvanced, setIsAdvanced] = useState(limitTo === 'advanced');

  const toggleMode = () => {
    if (limitTo) return; // Don't allow toggling if limited to one mode
    setIsAdvanced(!isAdvanced);
  };

  if (!fieldList || Object.keys(fieldList).length === 0) {
    return (
      <div className="text-danger small">
        No searchable fields configured for this layer.
      </div>
    );
  }

  // Show advanced by default if limitTo is 'advanced', simple if limitTo is 'simple'
  const showAdvanced = limitTo === 'advanced' || (limitTo !== 'simple' && isAdvanced);

  return (
    <div className="search-ui">
      {isLoading && (
        <div className="text-center mb-3">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      )}
      
      {showAdvanced ? (
        <SearchUIAdvanced
          fieldList={fieldList}
          onSearch={onSearch}
          operators={operators}
          isLoading={isLoading}
          onToggleSimple={limitTo ? undefined : toggleMode}
          currentQuery={currentQuery}
        />
      ) : (
        <SearchUISimple
          fieldList={fieldList}
          onSearch={onSearch}
          isLoading={isLoading}
          onToggleAdvanced={limitTo ? undefined : toggleMode}
          currentQuery={currentQuery}
        />
      )}
    </div>
  );
}