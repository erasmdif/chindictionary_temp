export type Id = string | number;

export interface CharacterReading {
  id: string;
  historical: string | null;
  simpleHistorical: string | null;
  modern: string | null;
  english: string | null;
  interpreted: boolean;
  occurrenceCount: number;
}

export interface CharacterLocus {
  readingId: string;
  dictionaryId: string | null;
  page: number | null;
  line: string | number | null;
  count: number;
  typologies: string[];
  historicalStrokes: string | number | null;
  sourceRadical: string | null;
}

export interface CharacterVariant {
  id: string;
  rawCharacter: string | null;
  displayCharacter: string | null;
  simplified: string | null;
  glyphLink: string | null;
  formalism: boolean;
  typology: string | null;
}

export interface CharacterRecord {
  id: string;
  rawCharacter: string | null;
  displayCharacter: string | null;
  simplified: string | null;
  glyphLink: string | null;
  formalism: boolean;
  note: string | null;
  notStandard: boolean;
  modernStrokes: string | number | null;
  strokesNotNumeric: string | null;
  semanticRadical: string | null;
  phoneticRadical: string | null;
  occurrenceCount: number;
  locusCount: number;
  readings: CharacterReading[];
  loci: CharacterLocus[];
  variants: CharacterVariant[];
}

export interface CharactersPayload {
  generatedAt: string;
  historicalRadicalField: string | null;
  sourceModeAvailable: boolean;
  warnings: string[];
  totals: {
    characters: number;
    readings: number;
    occurrences: number;
    loci: number;
    minPage: number | null;
    maxPage: number | null;
  };
  data: CharacterRecord[];
}

export interface LatinDefinitionRecord {
  readingId: string;
  typology: string | null;
  html: string;
  occurrenceCount: number;
}

export interface CharactersLatinPayload {
  generatedAt: string;
  warnings: string[];
  data: LatinDefinitionRecord[];
}
