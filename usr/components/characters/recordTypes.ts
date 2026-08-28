export interface RecordLocus {
  dictionaryId: string | null;
  dictionaryLabel: string;
  page: number | null;
  line: string | number | null;
}

export interface RecordDefinition {
  typology: string | null;
  html: string;
  count: number;
  loci: RecordLocus[];
}

export interface RecordReading {
  id: string;
  historical: string | null;
  simpleHistorical: string | null;
  modern: string | null;
  tone: string | number | null;
  english: string | null;
  interpreted: boolean;
  occurrenceCount: number;
  locusCount: number;
  definitions: RecordDefinition[];
}

export interface RecordRelationEvidence extends RecordLocus {
  id: string;
  occId: string;
  position: string | number | null;
  internal: boolean | null;
  note: string | null;
}

export type LexicalRelationCategory = 'synonym' | 'antonym' | 'rejected' | 'association';

export interface RecordLexicalRelation {
  id: string;
  localReadingId: string;
  targetReadingId: string;
  targetCharacterId: string;
  targetGlyph: string;
  targetFormalism: boolean;
  targetGlyphLink: string | null;
  targetHistorical: string | null;
  targetModern: string | null;
  targetEnglish: string | null;
  typology: string | null;
  category: LexicalRelationCategory;
  evidenceCount: number;
  evidence: RecordRelationEvidence[];
}

export interface RecordGraphicVariant {
  key: string;
  relationIds: string[];
  targetCharacterId: string;
  targetGlyph: string;
  targetFormalism: boolean;
  targetGlyphLink: string | null;
  typology: string | null;
  evidenceCount: number;
  evidence: RecordLocus[];
}

export interface RecordComponentReading {
  id: string;
  characterId: string;
  glyph: string;
  historical: string | null;
  modern: string | null;
}

export interface RecordCompound {
  id: string;
  word: string | null;
  first: RecordComponentReading;
  second: RecordComponentReading;
  selectedRoles: Array<'first' | 'second'>;
  other: RecordComponentReading | null;
  experimental: true;
}

export interface RecordRelationAtLocus {
  kind: 'lexical' | 'graphic';
  label: string;
  position?: string | number | null;
  internal?: boolean | null;
}

export interface RecordAttestation extends RecordLocus {
  id: string;
  readingId: string;
  historicalReading: string | null;
  modernReading: string | null;
  typology: string | null;
  latinDefinitionHtml: string | null;
  sourceRadical: string | null;
  historicalStrokes: string | number | null;
  strokeBoundary: boolean;
  note: string | null;
  relations: RecordRelationAtLocus[];
}

export interface RecordSourceRadical {
  dictionaryId: string | null;
  dictionaryLabel: string;
  radical: string;
  occurrenceCount: number;
}

export interface RecordNeighbor {
  id: string;
  glyph: string;
}

export interface CharacterRecordDetailPayload {
  generatedAt: string;
  warnings: string[];
  character: {
    id: string;
    rawCharacter: string | null;
    displayCharacter: string;
    simplified: string | null;
    glyphLink: string | null;
    formalism: boolean;
    note: string | null;
    notStandard: boolean;
    modernStrokes: string | number | null;
    strokesNotNumeric: string | null;
    modernRadical: string | null;
    phoneticRadical: string | null;
    dateUpdated: string | null;
  };
  sourceRadicals: RecordSourceRadical[];
  sourceStrokeValues: Array<string | number>;
  readings: RecordReading[];
  attestations: RecordAttestation[];
  lexicalRelations: RecordLexicalRelation[];
  graphicVariants: RecordGraphicVariant[];
  compounds: RecordCompound[];
  neighbors: {
    previous: RecordNeighbor | null;
    next: RecordNeighbor | null;
  };
  stats: {
    readings: number;
    attestations: number;
    loci: number;
    lexicalRelations: number;
    graphicRelations: number;
    compounds: number;
    interpretedReadings: number;
  };
}
