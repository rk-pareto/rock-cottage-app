/**
 * The one stay this app runs during — a fixed week, not a booking system.
 * Info (spec §13.2) already states arrival and departure as plain text on
 * "/info/getting-there"; these are the same two facts, kept here so the home
 * feed can put a tile up on the day itself without parsing Markdown for it.
 */

import { formatClock, fromCottageInputValue } from "@/lib/time";

export const ARRIVAL_DATE = "2026-08-31";
export const ARRIVAL_TIME = "16:00";
export const DEPARTURE_DATE = "2026-09-06";
export const DEPARTURE_TIME = "10:00";

export type StayEvent = {
  kind: "arrival" | "departure";
  date: string;
  time: string;
};

/**
 * Today's stay tiles, if any. At most one of each, and in practice never
 * both — a same-day turnover isn't how this trip is shaped.
 */
export function stayEventsFor(today: string): StayEvent[] {
  const events: StayEvent[] = [];
  if (today === ARRIVAL_DATE)
    events.push({ kind: "arrival", date: ARRIVAL_DATE, time: ARRIVAL_TIME });
  if (today === DEPARTURE_DATE)
    events.push({
      kind: "departure",
      date: DEPARTURE_DATE,
      time: DEPARTURE_TIME,
    });
  return events;
}

/** "After 4:00 PM" / "Before 10:00 AM" — the same phrasing as the Info page. */
export function formatStayTime(event: StayEvent): string {
  const clock = formatClock(
    fromCottageInputValue(`${event.date}T${event.time}`),
  );
  return event.kind === "arrival" ? `After ${clock}` : `Before ${clock}`;
}
