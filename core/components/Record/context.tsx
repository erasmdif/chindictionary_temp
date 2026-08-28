import React from 'react';

export const RecordContext = React.createContext<any>(null);

export interface RecordProviderProps {
  record: any;
  children?: React.ReactNode;
}

export function RecordProvider({ record, children }: RecordProviderProps) {
  return <RecordContext.Provider value={record}>{children}</RecordContext.Provider>;
}

export default RecordProvider;
