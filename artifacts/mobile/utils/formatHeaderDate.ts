const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Formats a date for the home screen header, e.g. "08, August 2026".
 *
 * Spelled out rather than using toLocaleDateString: this exact shape (padded
 * day, comma, full month, year) isn't reachable from a single locale format,
 * and Intl month names vary by device locale, which would silently change the
 * header on a non-English phone.
 */
export function formatHeaderDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  return `${day}, ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}
