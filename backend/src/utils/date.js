// ISO date -> Monday of that week (YYYY-MM-DD)
export function weekStartMonday(isoDate) {
  const d = new Date(isoDate);
  if (Number.isNaN(+d)) throw new Error('Invalid date');
  const day = d.getUTCDay(); // 0..6 (Sun..Sat)
  const delta = (day === 0 ? -6 : 1 - day); // shift to Monday
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + delta));
  return m.toISOString().slice(0, 10);
}
