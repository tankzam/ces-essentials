import 'server-only';
import readXlsxFile from 'read-excel-file/node';

/** Minimal CSV parser (quotes, commas, newlines in quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const t = text.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (quoted) {
      if (ch === '"' && t[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c));
}

/** Rows of a CSV or Excel upload, as trimmed strings. */
export async function readSheet(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx')) {
    const rows = await readXlsxFile(Buffer.from(await file.arrayBuffer()));
    return rows.map((r) => r.map((c) => (c == null ? '' : String(c).trim()))).filter((r) => r.some((c) => c));
  }
  if (name.endsWith('.csv') || name.endsWith('.txt') || file.type.includes('csv')) {
    return parseCsv(await file.text());
  }
  throw new Error('Please upload a CSV or Excel (.xlsx) file.');
}

/** Drops a header row if the first row looks like one. */
export function withoutHeader(rows: string[][], word: string): string[][] {
  return rows.length && rows[0].some((c) => c.toLowerCase().includes(word)) ? rows.slice(1) : rows;
}
