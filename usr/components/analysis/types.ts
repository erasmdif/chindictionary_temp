export type LatinToken = {
  id: number;
  form: string;
  raw: string;
  start: number;
  end: number;
  segment: number;
};

export type LatinEntry = {
  id: string;
  page: number | null;
  line: string | null;
  typology: string;
  text: string;
  tokens: LatinToken[];
  segmentCount: number;
  distinctForms: number;
  repetition: number | null;
};

export type CleaningExclusion = {
  entryId: string;
  page: number | null;
  line: string | null;
  raw: string;
  reason: string;
  context: string;
};

export type LatinCorpusPayload = {
  generatedAt: string;
  entries: LatinEntry[];
  typologies: string[];
  pageMin: number | null;
  pageMax: number | null;
  stats: {
    sourceEntries: number;
    analysableEntries: number;
    emptyEntries: number;
    acceptedTokens: number;
    distinctForms: number;
    segments: number;
    excludedCandidates: number;
  };
  cleaningPreview: CleaningExclusion[];
};

export type WordGroup = {
  id: string;
  label: string;
  forms: string[];
};

export type FormStat = {
  form: string;
  count: number;
  entryCount: number;
  normalized: number | null;
  diffusion: number | null;
};
