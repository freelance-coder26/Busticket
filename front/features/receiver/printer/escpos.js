const PAPER_COLUMNS = Object.freeze({ 58: 32, 80: 48 });
const PC858 = new Map([
  ["à", 0x85], ["â", 0x83], ["ä", 0x84], ["ç", 0x87],
  ["é", 0x82], ["è", 0x8a], ["ê", 0x88], ["ë", 0x89],
  ["î", 0x8c], ["ï", 0x8b], ["ô", 0x93], ["ö", 0x94],
  ["ù", 0x97], ["û", 0x96], ["ü", 0x81], ["ÿ", 0x98],
  ["À", 0xb7], ["Â", 0xb6], ["Ä", 0x8e], ["Ç", 0x80],
  ["É", 0x90], ["È", 0xd4], ["Ê", 0xd2], ["Ë", 0xd3],
  ["Î", 0xd7], ["Ï", 0xd8], ["Ô", 0xe2], ["Ö", 0x99],
  ["Ù", 0xeb], ["Û", 0xea], ["Ü", 0x9a],
]);

export function encodePc858(text) {
  const normalized = String(text).normalize("NFC");
  return Uint8Array.from(Array.from(normalized, (character) => {
    const accentByte = PC858.get(character);
    if (accentByte !== undefined) return accentByte;
    const code = character.codePointAt(0);
    return code >= 0x20 && code <= 0x7e ? code : 0x3f;
  }));
}

function wrapText(text, columns) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";

  for (const word of words) {
    let remaining = word;
    while (remaining.length > columns) {
      if (line) {
        lines.push(line);
        line = "";
      }
      lines.push(remaining.slice(0, columns));
      remaining = remaining.slice(columns);
    }

    if (line && line.length + remaining.length + 1 > columns) {
      lines.push(line);
      line = remaining;
    } else {
      line = line ? `${line} ${remaining}` : remaining;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function formatGnf(amount) {
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 })
    .format(amount).replace(/[\u00a0\u202f]/g, " ")} GNF`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Africa/Conakry",
  }).format(new Date(value));
}

export function formatTicketLines(ticket, { widthMm = 58, duplicate = false } = {}) {
  const columns = PAPER_COLUMNS[widthMm];
  if (!columns) throw new Error("Largeur de papier non prise en charge : choisissez 58 ou 80 mm.");

  const details = [
    "GOROHITECH BILLETTERIE",
    ...(duplicate ? ["*** DUPLICATA ***"] : []),
    "--------------------------------",
    `Transporteur : ${ticket.carrierName}`,
    `Ticket : ${ticket.ticketNumber}`,
    `Ligne : ${ticket.lineName}`,
    `Sens : ${ticket.direction === "RETOUR" ? "RETOUR" : "ALLER"}`,
    `Date : ${formatDate(ticket.soldAt)}`,
    `Montée : ${ticket.boardingStop}`,
    `Descente : ${ticket.destinationStop}`,
    `Tronçons : ${ticket.segments}`,
    `Prix unitaire : ${formatGnf(ticket.unitFareGnf)}`,
    `TOTAL : ${formatGnf(ticket.amountGnf)}`,
    `Bus : ${ticket.busCode}`,
    `Receveur : ${ticket.receiverLogin} (${ticket.receiverName})`,
    "Merci",
  ];

  return details.flatMap((line) => wrapText(line, columns));
}

function assembleEscPos(lines) {
  const bytes = [0x1b, 0x40, 0x1b, 0x74, 19, 0x1b, 0x61, 1, 0x1b, 0x45, 1];
  const title = lines[0] ?? "";
  bytes.push(...encodePc858(title), 0x0a, 0x1b, 0x45, 0, 0x1b, 0x61, 0);
  for (const line of lines.slice(1)) bytes.push(...encodePc858(line), 0x0a);
  bytes.push(0x1b, 0x64, 3);
  return Uint8Array.from(bytes);
}

export function buildTicketBytes(ticket, options = {}) {
  return assembleEscPos(formatTicketLines(ticket, options));
}

export function buildTestPrintBytes(widthMm = 58) {
  const columns = PAPER_COLUMNS[widthMm];
  if (!columns) throw new Error("Largeur de papier non prise en charge : choisissez 58 ou 80 mm.");
  const lines = [
    "TEST D'IMPRESSION",
    "Bluetooth ESC/POS",
    `Papier : ${widthMm} mm`,
    "Accents : Éé, à, ç, ô, ü",
    "--------------------------------",
    "Fin du test",
  ].flatMap((line) => wrapText(line, columns));
  return assembleEscPos(lines);
}
