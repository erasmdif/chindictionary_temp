export type ExportFormat = 'json' | 'csv' | 'xlsx';

export type ExportGloss = {
  field: string | null;
  value: string | null;
};

export type ExportGraphicVariant = {
  character: string | null;
  simplified: string | null;
  status: string | null;
  glyphLink: string | null;
};

export type ExportSynonym = {
  character: string | null;
  simplified: string | null;
  glyphLink: string | null;
  romanisation: string | null;
  assessment: string | null;
  note: string | null;
  position?: string | number | null;
  internal?: boolean | null;
};

export type ExportAntonym = {
  leftCharacter: string | null;
  leftRomanisation: string | null;
  rightCharacter: string | null;
  rightRomanisation: string | null;
};

export type ExportCompound = {
  firstCharacter: string | null;
  firstRomanisation: string | null;
  secondCharacter: string | null;
  secondRomanisation: string | null;
};

export type DictionaryExportRecord = {
  occurrenceId: string | number;
  page: string | number | null;
  line: string | number | null;
  typology: string | null;
  character: string | null;
  simplified: string | null;
  glyphLink: string | null;
  romanisation: string | null;
  modernRomanisation: string | null;
  simpleRomanisation: string | null;
  englishDefinition: string | null;
  latinDefinition: string | null;
  note: string | null;
  historicalRadical: string | null;
  historicalStrokes: string | number | null;
  modernStrokes: string | number | null;
  semanticRadical: string | null;
  phoneticRadical: string | null;
  glosses: ExportGloss[];
  graphicVariants: ExportGraphicVariant[];
  synonyms: ExportSynonym[];
  antonyms: ExportAntonym[];
  compounds: ExportCompound[];
};

export type DictionaryExportPayload = {
  generatedAt: string;
  count: number;
  records: DictionaryExportRecord[];
};

export const DICTIONARY_SOURCE = "Tola, Gabriele. 2026. Basilio Brollo’s Dictionarium sinico-latinum (Chinese-Latin dictionary): A critical edition of the manuscript Rinuccini 22 (Biblioteca Medicea Laurenziana). Studies in the History of the Language Sciences 134. John Benjamins. Open Access (CC BY-NC-ND 4.0). https://doi.org/10.1075/sihols.134 — https://benjamins.com/catalog/sihols.134";

function scalar(value: unknown): string | number | boolean {
  if (value == null) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value);
}

function stripHtml(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeFilePart(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}._-]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'filtered';
}

function hasEditorialGlyphPlaceholder(value: string | null): boolean {
  return Boolean(value?.includes('[.]'));
}

function exportGlyph(
  character: string | null,
  simplified: string | null,
  glyphLink: string | null,
): string {
  const rawCharacter = character?.trim() || '';
  const rawSimplified = simplified?.trim() || '';
  if (hasEditorialGlyphPlaceholder(rawCharacter)) {
    const label = rawSimplified || rawCharacter;
    return `${label}*${glyphLink ? `(${glyphLink})` : ''}`;
  }
  return rawCharacter || rawSimplified;
}

function naturalCompare(a: unknown, b: unknown): number {
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' });
}

function firstGloss(record: DictionaryExportRecord): string {
  const explicit = record.glosses.find(item => String(item.field ?? '').toLocaleLowerCase() === 'gloss_1');
  return explicit?.value || '';
}

function glyphIdentity(character: string | null, simplified: string | null): string {
  const rawCharacter = character?.trim() || '';
  const rawSimplified = simplified?.trim() || '';
  return hasEditorialGlyphPlaceholder(rawCharacter) ? (rawSimplified || rawCharacter) : (rawCharacter || rawSimplified);
}

function glyphExportPriority(character: string | null, glyphLink: string | null): number {
  if (hasEditorialGlyphPlaceholder(character) && glyphLink) return 0;
  if (hasEditorialGlyphPlaceholder(character)) return 1;
  return 2;
}

function joinedGraphicVariants(record: DictionaryExportRecord): string {
  const groups = new Map<string, ExportGraphicVariant>();
  for (const item of record.graphicVariants ?? []) {
    const key = glyphIdentity(item.character, item.simplified);
    if (!key) continue;
    const current = groups.get(key);
    if (!current || glyphExportPriority(item.character, item.glyphLink) < glyphExportPriority(current.character, current.glyphLink)) {
      groups.set(key, item);
    }
  }
  return Array.from(groups.values())
    .map(item => exportGlyph(item.character, item.simplified, item.glyphLink))
    .filter(Boolean)
    .join('; ');
}

function joinedSynonyms(record: DictionaryExportRecord): string {
  const groups = new Map<string, ExportSynonym>();
  for (const item of record.synonyms ?? []) {
    if (item.internal === false) continue;
    const identity = glyphIdentity(item.character, item.simplified);
    if (!identity) continue;
    const position = String(item.position ?? '').trim();
    const key = `${position}|${identity}`;
    const current = groups.get(key);
    if (!current || glyphExportPriority(item.character, item.glyphLink) < glyphExportPriority(current.character, current.glyphLink)) {
      groups.set(key, item);
    }
  }

  return Array.from(groups.values())
    .sort((a, b) => naturalCompare(a.position, b.position) || naturalCompare(glyphIdentity(a.character, a.simplified), glyphIdentity(b.character, b.simplified)))
    .map(item => exportGlyph(item.character, item.simplified, item.glyphLink))
    .filter(Boolean)
    .join('; ');
}

function pageLine(record: DictionaryExportRecord): string {
  const page = String(record.page ?? '').trim();
  const line = String(record.line ?? '').trim();
  if (page && line) return `p. ${page} · l. ${line}`;
  if (page) return `p. ${page}`;
  if (line) return `l. ${line}`;
  return '';
}

export function flattenDictionaryRecords(
  records: DictionaryExportRecord[],
  downloadedFrom: string,
): Array<Record<string, string | number | boolean>> {
  return records.map(record => ({
    character: exportGlyph(record.character, record.simplified, record.glyphLink),
    romanisation: scalar(record.romanisation),
    definition: stripHtml(record.latinDefinition),
    source_radical: scalar(record.historicalRadical),
    source_n_strokes: scalar(record.historicalStrokes),
    gloss: firstGloss(record),
    page_line: pageLine(record),
    graphic_variants: joinedGraphicVariants(record),
    synonyms: joinedSynonyms(record),
    source: DICTIONARY_SOURCE,
    downloaded_from: downloadedFrom,
  }));
}

function headerOrder(rows: Array<Record<string, string | number | boolean>>): string[] {
  const seen = new Set<string>();
  const headers: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (seen.has(key)) continue;
      seen.add(key);
      headers.push(key);
    }
  }
  return headers;
}

function csvCell(value: unknown): string {
  const raw = value == null ? '' : String(value);
  if (/[",\r\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

function xmlEscape(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function columnName(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const remainder = (n - 1) % 26;
    out = String.fromCharCode(65 + remainder) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function worksheetXml(rows: Array<Record<string, string | number | boolean>>): string {
  const headers = headerOrder(rows);
  const sheetRows = [headers.reduce<Record<string, string>>((acc, header) => {
    acc[header] = header;
    return acc;
  }, {}), ...rows];

  const body = sheetRows.map((row, rowIndex) => {
    const cells = headers.map((header, columnIndex) => {
      const value = row[header] ?? '';
      const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
      if (typeof value === 'number' && Number.isFinite(value)) {
        return `<c r="${ref}"${rowIndex === 0 ? ' s="1"' : ''}><v>${value}</v></c>`;
      }
      if (typeof value === 'boolean') {
        return `<c r="${ref}" t="b"${rowIndex === 0 ? ' s="1"' : ''}><v>${value ? 1 : 0}</v></c>`;
      }
      return `<c r="${ref}" t="inlineStr"${rowIndex === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');

  const lastRef = `${columnName(Math.max(0, headers.length - 1))}${Math.max(1, sheetRows.length)}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastRef}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData>${body}</sheetData><autoFilter ref="A1:${columnName(Math.max(0, headers.length - 1))}1"/></worksheet>`;
}

function stylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="11"/><name val="Aptos"/></font></fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function uint16(value: number): Uint8Array {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function uint32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
  return bytes;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

let crcTable: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  crcTable = table;
  return table;
}

function crc32(bytes: Uint8Array): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()): { date: number; time: number } {
  const year = Math.max(1980, date.getFullYear());
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  return { date: dosDate, time: dosTime };
}

function zipStore(files: Array<{ name: string; content: string }>): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  const stamp = dosDateTime();

  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const crc = crc32(data);

    const localHeader = concatBytes([
      uint32(0x04034b50), uint16(20), uint16(0), uint16(0), uint16(stamp.time), uint16(stamp.date),
      uint32(crc), uint32(data.length), uint32(data.length), uint16(name.length), uint16(0), name,
    ]);
    localParts.push(localHeader, data);

    const centralHeader = concatBytes([
      uint32(0x02014b50), uint16(20), uint16(20), uint16(0), uint16(0), uint16(stamp.time), uint16(stamp.date),
      uint32(crc), uint32(data.length), uint32(data.length), uint16(name.length), uint16(0), uint16(0),
      uint16(0), uint16(0), uint32(0), uint32(offset), name,
    ]);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const locals = concatBytes(localParts);
  const central = concatBytes(centralParts);
  const end = concatBytes([
    uint32(0x06054b50), uint16(0), uint16(0), uint16(files.length), uint16(files.length),
    uint32(central.length), uint32(locals.length), uint16(0),
  ]);
  return concatBytes([locals, central, end]);
}

function xlsxBlob(rows: Array<Record<string, string | number | boolean>>): Blob {
  const files = [
    {
      name: '[Content_Types].xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    },
    {
      name: '_rels/.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Dictionary export" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    { name: 'xl/styles.xml', content: stylesXml() },
    { name: 'xl/worksheets/sheet1.xml', content: worksheetXml(rows) },
  ];
  const zipBytes = zipStore(files);
  const blobBytes = new Uint8Array(zipBytes.byteLength);
  blobBytes.set(zipBytes);
  return new Blob(
    [blobBytes.buffer],
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  );
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadDictionaryExport(
  records: DictionaryExportRecord[],
  format: ExportFormat,
  downloadedFrom: string,
  label: string,
) {
  const flat = flattenDictionaryRecords(records, downloadedFrom);
  const stamp = new Date().toISOString().slice(0, 10);
  const baseName = `chind_dictionary_${safeFilePart(label)}_${stamp}`;

  if (format === 'json') {
    const payload = {
      generated_at: new Date().toISOString(),
      source: DICTIONARY_SOURCE,
      downloaded_from: downloadedFrom,
      count: records.length,
      records,
    };
    triggerDownload(
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }),
      `${baseName}.json`,
    );
    return;
  }

  if (format === 'csv') {
    const headers = headerOrder(flat);
    const lines = [
      headers.map(csvCell).join(','),
      ...flat.map(row => headers.map(header => csvCell(row[header])).join(',')),
    ];
    triggerDownload(
      new Blob([`\ufeff${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' }),
      `${baseName}.csv`,
    );
    return;
  }

  triggerDownload(xlsxBlob(flat), `${baseName}.xlsx`);
}
