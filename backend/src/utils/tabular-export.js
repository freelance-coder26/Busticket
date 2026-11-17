function normalizeText(value) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function csvCell(value) {
  const raw = normalizeText(value);
  const safe = typeof value === "string" && /^[\s]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

function xmlCell(value) {
  const isNumber = typeof value === "number" && Number.isFinite(value);
  const text = normalizeText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
  return `<Cell><Data ss:Type="${isNumber ? "Number" : "String"}">${text}</Data></Cell>`;
}

export function toCsv(headers, rows) {
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n")}\r\n`;
}

export function toExcelXml(headers, rows) {
  const content = [headers, ...rows]
    .map((row) => `<Row>${row.map(xmlCell).join("")}</Row>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Ventes"><Table>${content}</Table></Worksheet></Workbook>`;
}
