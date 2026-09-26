// Display helpers shared by the Drive backup surfaces (B3): the welcome-back
// screen and Settings -> Backup's Drive card.

/** "+919876543210" -> "+9198••• ••210": enough to recognise, not to read out. */
export function maskPhone(e164: string): string {
  return `${e164.slice(0, 5)}••• ••${e164.slice(-3)}`;
}

export function backedUpAgo(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 60) return minutes <= 1 ? "just now" : `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
