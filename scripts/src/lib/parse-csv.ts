export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 2;
        continue;
      }
      if (c === '"') {
        inQuotes = false;
        i++;
        continue;
      }
      if (c === "\r") {
        i++;
        continue;
      }
      if (c === "\n") {
        field += "\n";
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

export type CsvTable = {
  header: string[];
  rows: string[][];
  index: Record<string, number>;
};

export function parseCsvTable(text: string): CsvTable {
  const normalized = text.replace(/^\uFEFF/, "");
  const parsed = parseCsv(normalized);
  const header = parsed[0] ?? [];
  const index = Object.fromEntries(header.map((name, i) => [name.trim(), i]));
  const rows = parsed.slice(1).filter((row) => row.some((cell) => cell.trim()));
  return { header, rows, index };
}

export function cell(row: string[], index: Record<string, number>, key: string): string {
  const i = index[key];
  if (i === undefined) return "";
  return (row[i] ?? "").trim();
}
