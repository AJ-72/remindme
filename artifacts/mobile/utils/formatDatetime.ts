// Compares calendar days by their date parts only, so two datetimes on the
// same day are equal regardless of time.
function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear()
  );
}

// Some locales/ICU implementations render toLocaleTimeString's hour12 marker
// as lowercase "am"/"pm" instead of "AM"/"PM". Force uppercase so display is
// consistent regardless of device locale.
export function formatTime12h(d: Date): string {
  return d
    .toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true })
    .replace(/am|pm/i, (m) => m.toUpperCase());
}

export function formatDatetime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();

  // Build tomorrow by adding a day to a real Date rather than comparing
  // against `now.getDate() + 1`. On the last day of a month that arithmetic
  // asks for date 32 and never matches, so every "tomorrow" on the 28th-31st
  // silently rendered as a date instead — and year-end was wrong too.
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const time = formatTime12h(d);
  if (isSameDay(d, now)) return `Today · ${time}`;
  if (isSameDay(d, tomorrow)) return `Tomorrow · ${time}`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + ` · ${time}`;
}
