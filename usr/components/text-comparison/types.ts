export type ComparisonStatus = 'source' | 'historical' | 'variant' | 'missing' | 'compound' | 'neutral';

export interface ComparisonReadingSummary {
  id: string;
  historical: string | null;
  modern: string | null;
  english: string | null;
  occurrenceCount: number;
}

export interface ComparisonCharacter {
  id: string;
  rawCharacter: string | null;
  displayCharacter: string;
  simplified: string | null;
  glyphLink: string | null;
  formalism: boolean;
  attested: boolean;
  attestationCount: number;
  readings: ComparisonReadingSummary[];
}

export interface ComparisonVariant {
  relationId: string;
  sourceCharacterId: string;
  sourceGlyph: string;
  sourceMatchGlyph: string | null;
  variantCharacterId: string;
  variantGlyph: string;
  variantMatchGlyph: string | null;
  variantFormalism: boolean;
  variantGlyphLink: string | null;
  typology: string | null;
  evidenceCount: number;
}

export interface ComparisonCompoundComponent {
  readingId: string;
  characterId: string;
  glyph: string;
  matchGlyph: string | null;
  historical: string | null;
  modern: string | null;
}

export interface ComparisonCompound {
  id: string;
  word: string | null;
  matchForms: string[];
  displayWord: string;
  historicalRomanisation: string;
  first: ComparisonCompoundComponent;
  second: ComparisonCompoundComponent;
}

export interface TextComparisonIndexPayload {
  generatedAt: string;
  warnings: string[];
  characters: ComparisonCharacter[];
  variants: ComparisonVariant[];
  compounds: ComparisonCompound[];
  stats: {
    attestedCharacters: number;
    historicalForms: number;
    occurrenceBackedVariants: number;
    compounds: number;
  };
}
