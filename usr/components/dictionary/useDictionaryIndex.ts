import { useEffect, useState } from 'react';
import type { DictionaryIndexPayload, DictionaryOccurrence } from './types';

let cachedPromise: Promise<DictionaryIndexPayload> | null = null;

function indexUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.replace(/\/?$/, '/')}data/dictionary-index.json`;
}

async function loadIndex(): Promise<DictionaryIndexPayload> {
  const response = await fetch(indexUrl());
  if (!response.ok) {
    throw new Error(`Dictionary index request failed with HTTP ${response.status}`);
  }
  return response.json();
}

export function useDictionaryIndex() {
  const [data, setData] = useState<DictionaryOccurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!cachedPromise) cachedPromise = loadIndex();

    cachedPromise
      .then(payload => {
        setData(payload.data ?? []);
        setGeneratedAt(payload.generatedAt ?? null);
        setWarning(payload.warning ?? null);
        setLoading(false);
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
  }, []);

  return { data, loading, error, generatedAt, warning };
}
