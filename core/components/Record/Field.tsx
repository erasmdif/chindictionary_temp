import React, { useContext } from 'react';
import { RecordContext } from './context';
import { getValueByDotPath } from './utils';

export interface FieldProps {
  name: string;
  transformer?: (value: any) => React.ReactNode;
  fallback?: React.ReactNode;
  record?: any;
}

export function Field({ name, transformer, fallback = null, record }: FieldProps) {
  const contextRecord = useContext(RecordContext);
  const sourceRecord = record ?? contextRecord;

  if (!sourceRecord) return <>{fallback}</>;

  const value = getValueByDotPath(sourceRecord, name);

  if (value === undefined || value === null || value === '') {
    return <>{fallback}</>;
  }

  if (transformer) {
    return <>{transformer(value)}</>;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return <>{String(value)}</>;
  }

  return <>{JSON.stringify(value, null, 2)}</>;
}

export default Field;
