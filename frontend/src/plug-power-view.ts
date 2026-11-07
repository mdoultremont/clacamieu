import { locale } from "./i18n";
import type { PlugReading } from "./types";

/** Plugs drawing less than this are idle. */
const runningWatts = 1;
/** Idle plugs that used less than this today stay out of the list. */
const notableKwh = 0.01;
const shownRows = 3;

export interface PlugPowerRow {
  name: string;
  running: boolean;
  /** Formatted current draw, or null when idle or unreadable. */
  watts: string | null;
  /** Formatted energy used today, or null when unknown. */
  today: string | null;
}

export interface PlugPowerView {
  /** Formatted total draw, or null when no plug reports a reading. */
  watts: string | null;
  running: number;
  /** Formatted total energy today, or null while loading or unknown. */
  today: string | null;
  /** Whether any plug has an energy sensor, so a today column makes sense. */
  tracksEnergy: boolean;
  rows: PlugPowerRow[];
  others: { count: number; watts: string | null; today: string | null } | null;
}

function format(value: number, digits: number, language: string) {
  return new Intl.NumberFormat(locale(language), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatWatts(watts: number, language: string) {
  return `${format(watts, 0, language)} W`;
}

export function formatEnergy(kwh: number, language: string) {
  return kwh < 1
    ? `${format(kwh * 1000, 0, language)} Wh`
    : `${format(kwh, kwh < 10 ? 1 : 0, language)} kWh`;
}

/**
 * Lists running plugs by current draw, then idle plugs by energy used today,
 * so an appliance that ran this morning stays visible after it stops.
 */
export function buildPlugPowerView(
  plugs: PlugReading[],
  today: Record<string, number | null> | null,
  language: string,
): PlugPowerView {
  const sum = (values: (number | null)[]) => {
    const known = values.filter((value): value is number => value !== null);
    return known.length ? known.reduce((total, value) => total + value) : null;
  };
  const entries = plugs.map((plug) => ({
    name: plug.name,
    watts: plug.watts,
    running: (plug.watts ?? 0) >= runningWatts,
    kwh: plug.energyId && today ? (today[plug.energyId] ?? null) : null,
  }));
  const listed = entries
    .filter((entry) => entry.running || (entry.kwh ?? 0) >= notableKwh)
    .sort((a, b) =>
      a.running !== b.running
        ? Number(b.running) - Number(a.running)
        : a.running
          ? b.watts! - a.watts!
          : b.kwh! - a.kwh!,
    );
  const row = (entry: (typeof entries)[number]): PlugPowerRow => ({
    name: entry.name,
    running: entry.running,
    watts: entry.running ? formatWatts(entry.watts!, language) : null,
    today: entry.kwh === null ? null : formatEnergy(entry.kwh, language),
  });
  const rest = listed.slice(shownRows);
  const restWatts = sum(
    rest.map((entry) => (entry.running ? entry.watts : null)),
  );
  const restKwh = sum(rest.map((entry) => entry.kwh));
  const totalWatts = sum(entries.map((entry) => entry.watts));
  const totalKwh = sum(entries.map((entry) => entry.kwh));
  return {
    watts: totalWatts === null ? null : formatWatts(totalWatts, language),
    running: entries.filter((entry) => entry.running).length,
    today: totalKwh === null ? null : formatEnergy(totalKwh, language),
    tracksEnergy: plugs.some((plug) => plug.energyId !== null),
    rows: listed.slice(0, shownRows).map(row),
    others: rest.length
      ? {
          count: rest.length,
          watts: restWatts === null ? null : formatWatts(restWatts, language),
          today: restKwh === null ? null : formatEnergy(restKwh, language),
        }
      : null,
  };
}
