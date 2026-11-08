import type { HistoryPoint } from "./climate-trend";
import { numeric, plugReadings } from "./home-view";
import { locale, messages } from "./i18n";
import { displayOptions } from "./room-display";
import { entityArea } from "./room-sensors";
import type { DashboardConfig, HassLike, PlugReading } from "./types";

/**
 * Measured on a washing machine, a dryer, and a dishwasher over ten days:
 * standby stays under 2 W, and the dishwasher pauses for five minutes at a
 * time mid-cycle, so a shorter grace period splits one cycle into several.
 */
export const cycleStartWatts = 5;
export const cycleGraceMs = 10 * 60_000;
export const finishedForMs = 6 * 3_600_000;
/** Long enough to find the start of a cycle that ended six hours ago. */
export const cycleHistoryMs = 12 * 3_600_000;

export interface PowerSample {
  at: number;
  /** Null while the plug is unavailable, which neither starts nor ends a cycle. */
  watts: number | null;
}

export type CycleState =
  | { status: "idle" }
  | ({
      status: "running";
      since: number;
      watts: number | null;
      kwh: number;
    } & Partial<TrackedProgress>)
  | { status: "finished"; startedAt: number; endedAt: number; kwh: number };

/** What a cycle tracker knows about the running program. */
export interface TrackedProgress {
  program: string | null;
  remainingMs: number | null;
  /** From 0 to 100. */
  progress: number | null;
}

/**
 * A WashData device, which recognizes an appliance's programs from its power
 * profile, so it knows when a cycle with long quiet phases really ends.
 */
export interface CycleTracker {
  stateId: string;
  programId: string | null;
  remainingId: string | null;
  progressId: string | null;
}

/** A plug an admin set to the cycle display in a room. */
export interface CycleAppliance {
  entityId: string;
  name: string;
  areaId: string;
  areaName: string;
  plug: PlugReading;
  tracker: CycleTracker | null;
}

const trackerPlatform = "ha_washdata";
const trackerRunning = new Set([
  "starting",
  "running",
  "paused",
  "user_paused",
  "ending",
  "delay_wait",
  "anti_wrinkle",
]);
const plain = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/**
 * The WashData device of an appliance: the only one in its room, or the one
 * whose name the appliance's names contain, as "Lave-vaisselle" in "Prise
 * lave-vaisselle".
 */
export function cycleTracker(
  hass: HassLike,
  areaId: string,
  names: string[],
): CycleTracker | null {
  const registry = Object.values(hass.entities);
  const candidates = registry.filter(
    (entry) =>
      entry.platform === trackerPlatform &&
      entry.translation_key === "washer_state" &&
      !!entry.device_id &&
      !!hass.states[entry.entity_id] &&
      entityArea(hass, entry.entity_id) === areaId,
  );
  const tracker =
    candidates.length === 1
      ? candidates[0]
      : candidates.find((entry) => {
          const device = hass.devices[entry.device_id!];
          const label = device?.name_by_user ?? device?.name;
          return (
            !!label && names.some((name) => plain(name).includes(plain(label)))
          );
        });
  if (!tracker) return null;
  const sibling = (key: string) =>
    registry.find(
      (entry) =>
        entry.device_id === tracker.device_id && entry.translation_key === key,
    )?.entity_id ?? null;
  return {
    stateId: tracker.entity_id,
    programId: sibling("washer_program"),
    remainingId: sibling("time_remaining"),
    progressId: sibling("cycle_progress"),
  };
}

/** The program, time left, and progress a tracker reports right now. */
export function trackedProgress(
  hass: HassLike,
  tracker: CycleTracker,
): TrackedProgress {
  const value = (id: string | null) =>
    id ? numeric(hass.states[id]?.state) : null;
  const program = tracker.programId
    ? hass.states[tracker.programId]?.state
    : undefined;
  const remaining = value(tracker.remainingId);
  const unit = tracker.remainingId
    ? hass.states[tracker.remainingId]?.attributes.unit_of_measurement
    : undefined;
  const unitMs = unit === "min" ? 60_000 : unit === "s" ? 1000 : 3_600_000;
  return {
    program:
      program && !["off", "none", "unknown", "unavailable"].includes(program)
        ? program
        : null,
    remainingMs: remaining === null ? null : remaining * unitMs,
    progress: value(tracker.progressId),
  };
}

/** Energy drawn between two times, holding each reading until the next. */
function energyBetween(samples: PowerSample[], from: number, to: number) {
  let wattMs = 0;
  samples.forEach((sample, index) => {
    if (sample.watts === null) return;
    const start = Math.max(sample.at, from);
    const end = Math.min(samples[index + 1]?.at ?? to, to);
    if (end > start) wattMs += sample.watts * (end - start);
  });
  return wattMs / 3_600_000_000;
}

/**
 * A cycle from a tracker's state history: it runs from the first running
 * state to the next settled one, such as finished or off. Unavailable and
 * unknown states neither start nor end it.
 */
export function trackedCycle(
  points: HistoryPoint[],
  samples: PowerSample[],
  now: number,
): CycleState {
  let run: { start: number; end: number | null } | null = null;
  for (const point of points) {
    if (["unavailable", "unknown"].includes(point.s)) continue;
    const at = point.lu * 1000;
    if (trackerRunning.has(point.s)) {
      if (!run || run.end !== null) run = { start: at, end: null };
    } else if (run && run.end === null) run.end = at;
  }
  if (!run) return { status: "idle" };
  if (run.end === null)
    return {
      status: "running",
      since: run.start,
      watts: samples.filter((sample) => sample.watts !== null).at(-1)?.watts ?? null,
      kwh: energyBetween(samples, run.start, now),
    };
  return now - run.end < finishedForMs
    ? {
        status: "finished",
        startedAt: run.start,
        endedAt: run.end,
        kwh: energyBetween(samples, run.start, run.end),
      }
    : { status: "idle" };
}

export function powerSamples(
  points: HistoryPoint[],
  unit: unknown,
): PowerSample[] {
  const scale = unit === "kW" ? 1000 : 1;
  return points.map((point) => {
    const value = numeric(point.s);
    return { at: point.lu * 1000, watts: value === null ? null : value * scale };
  });
}

/**
 * A cycle starts when power reaches `cycleStartWatts` and ends where power
 * dropped below it, once it has stayed there for `cycleGraceMs`.
 */
export function detectCycle(samples: PowerSample[], now: number): CycleState {
  let cycle: {
    start: number;
    quietSince: number | null;
    wattMs: number;
    wattMsWhenQuiet: number;
  } | null = null;
  let ended: { start: number; end: number; wattMs: number } | null = null;
  let previous: PowerSample | null = null;
  for (const sample of [...samples, { at: now, watts: null }]) {
    if (cycle && previous?.watts != null)
      cycle.wattMs += previous.watts * Math.max(0, sample.at - previous.at);
    if (
      cycle?.quietSince != null &&
      sample.at - cycle.quietSince >= cycleGraceMs
    ) {
      ended = {
        start: cycle.start,
        end: cycle.quietSince,
        wattMs: cycle.wattMsWhenQuiet,
      };
      cycle = null;
    }
    previous = sample;
    if (sample.watts === null) continue;
    if (sample.watts >= cycleStartWatts) {
      cycle ??= {
        start: sample.at,
        quietSince: null,
        wattMs: 0,
        wattMsWhenQuiet: 0,
      };
      cycle.quietSince = null;
    } else if (cycle && cycle.quietSince === null) {
      cycle.quietSince = sample.at;
      cycle.wattMsWhenQuiet = cycle.wattMs;
    }
  }
  const kwh = (wattMs: number) => wattMs / 3_600_000_000;
  if (cycle) {
    const last = samples.filter((sample) => sample.watts !== null).at(-1);
    return {
      status: "running",
      since: cycle.start,
      watts: last?.watts ?? null,
      kwh: kwh(cycle.wattMs),
    };
  }
  if (ended && now - ended.end < finishedForMs)
    return {
      status: "finished",
      startedAt: ended.start,
      endedAt: ended.end,
      kwh: kwh(ended.wattMs),
    };
  return { status: "idle" };
}

/** Cycle appliances in every room, in room order, then element order. */
export function cycleAppliances(
  hass: HassLike,
  config: DashboardConfig,
): CycleAppliance[] {
  const plugs = new Map(plugReadings(hass).map((plug) => [plug.id, plug]));
  return (config.rooms ?? []).flatMap((room) => {
    const area = hass.areas[room.area_id];
    if (!area) return [];
    return (room.entities ?? []).flatMap((element) => {
      const entity = hass.states[element.entity_id];
      const deviceId = hass.entities[element.entity_id]?.device_id;
      const plug =
        element.entity_id.startsWith("switch.") && deviceId
          ? plugs.get(deviceId)
          : undefined;
      if (
        !entity ||
        !plug ||
        element.display !== "cycle" ||
        !displayOptions({ power: plug }).includes("cycle")
      )
        return [];
      const name =
        entity.attributes.friendly_name ??
        hass.entities[element.entity_id]?.name ??
        element.entity_id;
      return [
        {
          entityId: element.entity_id,
          name: element.name ?? name,
          areaId: area.area_id,
          areaName: area.name,
          plug,
          tracker: cycleTracker(hass, area.area_id, [name, plug.name]),
        },
      ];
    });
  });
}

function number(value: number, digits: number, language: string) {
  return new Intl.NumberFormat(locale(language), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatCycleEnergy(kwh: number, language: string) {
  return `${number(kwh, 1, language)} kWh`;
}

/** "42 min" or "1 h 35". */
export function formatDuration(ms: number, language: string) {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  return messages(language).cycleDuration(
    Math.floor(minutes / 60),
    minutes % 60,
  );
}

/** A running clock such as "42:08" or "1:02:08". */
export function formatElapsed(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const pad = (value: number) => String(value).padStart(2, "0");
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  return hours
    ? `${hours}:${pad(minutes)}:${pad(seconds % 60)}`
    : `${minutes}:${pad(seconds % 60)}`;
}

/** "Il y a 12 min", capitalized for the start of a line. */
export function formatAgo(at: number, now: number, language: string) {
  const minutes = Math.max(1, Math.floor((now - at) / 60_000));
  const text = new Intl.RelativeTimeFormat(locale(language), {
    style: "short",
  }).format(
    minutes >= 60 ? -Math.floor(minutes / 60) : -minutes,
    minutes >= 60 ? "hour" : "minute",
  );
  return text.charAt(0).toLocaleUpperCase(language) + text.slice(1);
}

/** The cycle tile's line, such as "Depuis 42 min · 1 980 W · 0,6 kWh". */
export function cycleDetail(
  state: CycleState,
  watts: number | null,
  now: number,
  language: string,
): string {
  const t = messages(language);
  switch (state.status) {
    case "running":
      return [
        state.program,
        state.remainingMs != null
          ? t.cycleRemaining(formatDuration(state.remainingMs, language))
          : t.cycleSince(formatDuration(now - state.since, language)),
        watts === null ? null : `${number(watts, 0, language)} W`,
        formatCycleEnergy(state.kwh, language),
      ]
        .filter(Boolean)
        .join(" · ");
    case "finished":
      return [
        formatAgo(state.endedAt, now, language),
        t.cycleLength(formatDuration(state.endedAt - state.startedAt, language)),
        formatCycleEnergy(state.kwh, language),
      ].join(" · ");
    case "idle":
      return t.cycleIdle;
  }
}

export type CycleChip = CycleAppliance &
  (
    | {
        status: "running";
        since: number;
        watts: string | null;
        kwh: string;
        program: string | null;
        /** Such as "encore 1 h 26", from the cycle tracker. */
        remaining: string | null;
        progress: number | null;
      }
    | {
        status: "finished";
        endedAt: number;
        ago: string;
        duration: string;
        kwh: string;
      }
  );

/**
 * Home's chips: running appliances by start, then finished ones by end, most
 * recent first. A finished cycle stays hidden once someone dismissed it.
 */
export function buildCycleChips(
  appliances: CycleAppliance[],
  cycles: Record<string, CycleState>,
  dismissed: Record<string, number>,
  now: number,
  language: string,
): CycleChip[] {
  const chips = appliances.flatMap((appliance): CycleChip[] => {
    const state = cycles[appliance.entityId];
    if (state?.status === "running")
      return [
        {
          ...appliance,
          status: "running",
          since: state.since,
          watts:
            appliance.plug.watts === null
              ? null
              : `${number(appliance.plug.watts, 0, language)} W`,
          kwh: formatCycleEnergy(state.kwh, language),
          program: state.program ?? null,
          remaining:
            state.remainingMs == null
              ? null
              : messages(language).cycleRemaining(
                  formatDuration(state.remainingMs, language),
                ),
          progress: state.progress ?? null,
        },
      ];
    if (
      state?.status === "finished" &&
      !((dismissed[appliance.entityId] ?? -Infinity) >= state.startedAt)
    )
      return [
        {
          ...appliance,
          status: "finished",
          endedAt: state.endedAt,
          ago: formatAgo(state.endedAt, now, language),
          duration: formatDuration(state.endedAt - state.startedAt, language),
          kwh: formatCycleEnergy(state.kwh, language),
        },
      ];
    return [];
  });
  const at = (chip: CycleChip) =>
    chip.status === "running" ? chip.since : chip.endedAt;
  return chips.sort(
    (a, b) =>
      Number(a.status !== "running") - Number(b.status !== "running") ||
      at(b) - at(a),
  );
}

export function parseCycleDismissals(value: unknown): Record<string, number> {
  const dismissed =
    typeof value === "object" && value !== null && "dismissed" in value
      ? value.dismissed
      : null;
  if (typeof dismissed !== "object" || dismissed === null) return {};
  return Object.fromEntries(
    Object.entries(dismissed).flatMap(([entityId, endedAt]) => {
      const at = typeof endedAt === "string" ? Date.parse(endedAt) : NaN;
      return Number.isFinite(at) ? [[entityId, at]] : [];
    }),
  );
}
