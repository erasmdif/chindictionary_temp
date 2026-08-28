export interface DictionaryOccurrence {
  id: string | number;
  dictionaryId: string | number | null;
  page: string | number | null;
  line: string | number | null;
  typology: string | null;
  latinDefinition: string | null;
  historicalStrokes: string | number | null;
  strokeBoundary: boolean;

  wordId: string | number | null;
  englishDefinition: string | null;
  interpreted: boolean;

  characterId: string | number | null;
  character: string | null;
  simplified: string | null;
  modernStrokes: string | number | null;
  semanticRadical: string | null;
  phoneticRadical: string | null;
  glyphLink: string | null;

  romanizationId: string | number | null;
  romanization: string | null;
  modernRomanization: string | null;
  simpleRomanization: string | null;
  tone: string | number | null;
}

export interface DictionaryIndexPayload {
  generatedAt: string;
  count?: number;
  warning?: string;
  data: DictionaryOccurrence[];
}
