/** Times are stored in UTC and shown in IST (§6). */

export const DISPLAY_TIME_ZONE = "Asia/Kolkata";

const dateTime = new Intl.DateTimeFormat("en-IN", {
  timeZone: DISPLAY_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const dateOnly = new Intl.DateTimeFormat("en-IN", {
  timeZone: DISPLAY_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** "23 Nov 2026, 3:31 pm" in IST. */
export function formatIST(date: Date): string {
  return dateTime.format(date);
}

/** "23 Nov 2026" in IST. */
export function formatDateIST(date: Date): string {
  return dateOnly.format(date);
}
