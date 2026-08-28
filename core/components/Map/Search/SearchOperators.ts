/**
 * Search Operators Configuration
 * Default search operators with their UI labels
 */

import type { SearchOperators } from '../types';

export const DEFAULT_OPERATORS: SearchOperators = {
  _eq: "Equals",
  _neq: "Doesn't equal",
  _lt: "Less than",
  _lte: "Less than or equal to",
  _gt: "Greater than",
  _gte: "Greater than or equal to",
  _null: "Is null",
  _nnull: "Isn't null",
  _contains: "Contains",
  _icontains: "Contains (case-insensitive)",
  _ncontains: "Doesn't contain",
  _starts_with: "Starts with",
  _istarts_with: "Starts with (case-insensitive)",
  _nstarts_with: "Doesn't start with",
  _ends_with: "Ends with",
  _iends_with: "Ends with (case-insensitive)",
  _nends_with: "Doesn't end with"
};

export const DEFAULT_CONNECTORS = {
  _and: "AND",
  _or: "OR"
};