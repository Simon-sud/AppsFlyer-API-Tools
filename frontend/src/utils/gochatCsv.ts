export type CsvPayload = {
  filename: string;
  csvBody: string;
};

export type CsvAnswerParts = {
  filename: string;
  /** Prose before the ```csv fence */
  intro: string;
  /** Prose after the fence (and inline notes below the table) */
  outro: string;
  /** Header + data rows only */
  tableCsv: string;
  /** Bytes written to the downloaded file */
  downloadCsv: string;
  rowCount: number;
};

const CSV_FILENAME_LINE =
  /^(?:@file|filename|#?\s*file)\s*[:=]\s*["']?([^"'\n]+\.csv)["']?\s*$/im;

const CSV_FENCE_REGEX = /```(?:csv)?\s*([\s\S]*?)```/i;

function defaultCsvFilename(): string {
  return `gochat-export-${new Date().toISOString().slice(0, 10)}.csv`;
}

export function parseCsvPayload(text: string): CsvPayload {
  let body = (text ?? '').trim();
  let filename = defaultCsvFilename();

  const match = body.match(CSV_FILENAME_LINE);
  if (match?.[1]) {
    filename = match[1].trim();
    body = body.replace(match[0], '').trim();
  }

  return { filename, csvBody: body };
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseCsvTable(
  csvText: string
): { headers: string[]; rows: string[][] } | null {
  const lines = csvText
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return null;

  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map(parseCsvLine);
  const maxCols = Math.max(headers.length, ...rows.map((r) => r.length));

  const normalizedRows = rows.map((row) => {
    const normalized = [...row];
    while (normalized.length < maxCols) normalized.push('');
    return normalized.slice(0, maxCols);
  });

  return { headers: headers.slice(0, maxCols), rows: normalizedRows };
}

export function escapeCsvField(value: string): string {
  const v = value ?? '';
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function serializeCsvTable(parsed: { headers: string[]; rows: string[][] }): string {
  const lines = [
    parsed.headers.map(escapeCsvField).join(','),
    ...parsed.rows.map((row) => row.map(escapeCsvField).join(',')),
  ];
  return lines.join('\n');
}

function looksLikeCsvRow(line: string, expectedCols?: number): boolean {
  const trimmed = line.trim();
  if (!trimmed || CSV_FILENAME_LINE.test(trimmed) || /^```/.test(trimmed)) return false;
  if (!trimmed.includes(',')) return false;

  const cols = parseCsvLine(trimmed).length;
  if (cols < 2) return false;
  if (expectedCols !== undefined) return Math.abs(cols - expectedCols) <= 1;
  return true;
}

/** Pull contiguous header + data rows; trailing non-tabular lines become notes. */
export function extractCleanCsvTable(body: string): { tableCsv: string; trailingNotes: string } {
  const lines = body.split('\n');
  const tableLines: string[] = [];
  const noteLines: string[] = [];
  let headerCols: number | undefined;
  let tableClosed = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (tableLines.length >= 2) tableClosed = true;
      continue;
    }
    if (CSV_FILENAME_LINE.test(trimmed) || /^```/.test(trimmed)) continue;

    if (!tableClosed && looksLikeCsvRow(trimmed, headerCols)) {
      tableLines.push(trimmed);
      if (headerCols === undefined) headerCols = parseCsvLine(trimmed).length;
      continue;
    }

    if (tableLines.length >= 1) {
      tableClosed = true;
      noteLines.push(trimmed);
    }
  }

  if (tableLines.length === 0) {
    return { tableCsv: '', trailingNotes: noteLines.join('\n').trim() };
  }

  const parsed = parseCsvTable(tableLines.join('\n'));
  const tableCsv = parsed ? serializeCsvTable(parsed) : tableLines.join('\n');

  return { tableCsv, trailingNotes: noteLines.join('\n').trim() };
}

export function buildCsvDownloadContent(tableCsv: string, footerNote: string): string {
  const table = tableCsv.trim();
  if (!table) return '';
  const note = footerNote.trim();
  if (!note) return table;

  const footerRows = note
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => escapeCsvField(line))
    .join('\n');

  return `${table}\n\n${footerRows}`;
}

/** Split mixed assistant reply into prose + clean table + download payload. */
export function parseCsvAnswer(raw: string): CsvAnswerParts {
  const trimmed = (raw ?? '').trim();
  let intro = '';
  let outro = '';
  let bodySource = trimmed;

  const fenceMatch = trimmed.match(CSV_FENCE_REGEX);
  if (fenceMatch && fenceMatch.index !== undefined) {
    intro = trimmed.slice(0, fenceMatch.index).trim();
    bodySource = fenceMatch[1].trim();
    outro = trimmed.slice(fenceMatch.index + fenceMatch[0].length).trim();
  }

  const { filename, csvBody } = parseCsvPayload(bodySource);
  const { tableCsv, trailingNotes } = extractCleanCsvTable(csvBody);
  const mergedOutro = [trailingNotes, outro].filter(Boolean).join('\n\n').trim();

  const parsed = tableCsv ? parseCsvTable(tableCsv) : null;
  // File: table rows only; optional inline notes below the table (inside the fence).
  // Prose before/after the fence is shown in the UI only.
  const downloadCsv = buildCsvDownloadContent(tableCsv, trailingNotes);

  return {
    filename,
    intro,
    outro: mergedOutro,
    tableCsv,
    downloadCsv,
    rowCount: parsed?.rows.length ?? 0,
  };
}
