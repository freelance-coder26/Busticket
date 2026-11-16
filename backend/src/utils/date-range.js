// Les bornes UTC correspondent à Africa/Conakry, sans décalage saisonnier, et incluent la date de fin.
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
  return { from, to, start, end };
}
