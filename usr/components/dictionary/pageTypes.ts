export interface DynamicFieldValue {
  field: string;
  value: string;
}

export interface GraphicVariant {
  junctionId: string | number | null;
  relationId: string | number | null;
  sourceOccurrenceId: string | number;
  sourceCharacterId: string | number | null;
  sourceCharacter: string | null;
  relatedCharacterId: string | number | null;
  relatedCharacter: string | null;
  relatedSimplified: string | null;
  relatedGlyphLink: string | null;
  evidentialStatus: string | null;
}

export interface SynonymRelation {
  junctionId: string | number | null;
  relationId: string | number | null;
  sourceOccurrenceId: string | number;
  sourceWordId: string | number | null;
  relatedWordId: string | number | null;
  sourceCharacter: string | null;
  sourceRomanization: string | null;
  relatedCharacterId: string | number | null;
  relatedCharacter: string | null;
  relatedSimplified: string | null;
  relatedGlyphLink: string | null;
  relatedRomanization: string | null;
  relatedEnglishDefinition: string | null;
  position: string | number | null;
  internal: boolean | null;
  note: string | null;
  assessment: string | null;
}

export interface DictionaryPageOccurrence {
  id: string | number;
  dictionaryId: string | number | null;
  page: string | number | null;
  line: string | number | null;
  typology: string | null;
  latinDefinition: string | null;
  note: string | null;
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

  glosses: DynamicFieldValue[];
  historicalRadical: DynamicFieldValue | null;
  earthlyBranch: DynamicFieldValue | null;
  graphicVariants: GraphicVariant[];
  synonyms: SynonymRelation[];
}

export interface DictionaryPagePayload {
  generatedAt: string;
  page: number;
  maxPage: number;
  count: number;
  lineCount: number;
  warnings?: string[];
  data: DictionaryPageOccurrence[];
}
