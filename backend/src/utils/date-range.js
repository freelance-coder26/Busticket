// Les bornes UTC correspondent à Africa/Conakry, sans décalage saisonnier, et incluent la date de fin.
const MAX_RANGE_DAYS = 366;

export function parseDateRange(query, { defaultToToday = false } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const from = query.du ?? (defaultToToday ? today : undefined);
  const to = query.au ?? from;
  if (from === undefined && to === undefined) return null;

  const validDate = (value) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };
  if (!validDate(from) || !validDate(to) || from > to) return null;

  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);

  // Une période non bornée forcerait le serveur à charger un volume de ventes illimité.
  const spanDays = (end.getTime() - start.getTime()) / 86_400_000;
  if (spanDays > MAX_RANGE_DAYS) return null;

  return { from, to, start, end };
}
