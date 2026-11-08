import type { HistoryPoint } from "./climate-trend";
import { numeric } from "./home-view";
import { en, locale, messages, translatedState } from "./i18n";
import {
  vacuumSections,
  type DashboardConfig,
  type HassEntity,
  type HassLike,
  type ServiceAction,
  type Tone,
  type VacuumConfig,
  type VacuumSection,
} from "./types";

export type ServiceCatalog = Record<string, Record<string, unknown>>;

/** What the vacuum is doing. It decides the tone, the controls, and whether a task is underway. */
export type VacuumPhase =
  | "docked"
  | "idle"
  | "cleaning"
  | "paused"
  | "returning"
  | "error"
  | "offline";

type VacuumAction = Extract<ServiceAction, { domain: "vacuum" }>;
type VacuumService = VacuumAction["service"];

const phases: Record<
  VacuumPhase,
  { tone: Tone; underway: boolean; controls: VacuumService[] }
> = {
  docked: { tone: "idle", underway: false, controls: ["locate"] },
  idle: {
    tone: "idle",
    underway: false,
    controls: ["locate", "return_to_base"],
  },
  error: {
    tone: "alert",
    underway: false,
    controls: ["locate", "return_to_base"],
  },
  cleaning: {
    tone: "active",
    underway: true,
    controls: ["pause", "return_to_base"],
  },
  paused: {
    tone: "idle",
    underway: true,
    controls: ["start", "return_to_base"],
  },
  returning: { tone: "active", underway: true, controls: ["pause"] },
  offline: { tone: "idle", underway: false, controls: [] },
};

const featureBits: Record<VacuumService, number> = {
  start: 8192,
  pause: 4,
  return_to_base: 16,
  locate: 512,
};

type PartKey = keyof typeof en.vacuumParts;

// Dreame names each consumable by the key its maintenance sensor lists and
// its reset button uses; some percentage sensors add a qualifier to that key.
const parts: [PartKey, string][] = [
  ["main_brush", "main_brush"],
  ["side_brush", "side_brush"],
  ["filter", "filter"],
  ["tank_filter", "tank_filter"],
  ["sensor", "sensor_dirty"],
  ["mop_pad", "mop_pad"],
  ["silver_ion", "silver_ion"],
  ["detergent", "detergent"],
  ["squeegee", "squeegee"],
  ["onboard_dirty_water_tank", "onboard_dirty_water_tank"],
  ["dirty_water_channel", "dirty_water_channel_dirty"],
  ["deodorizer", "deodorizer"],
  ["wheel", "wheel_dirty"],
  ["scale_inhibitor", "scale_inhibitor"],
  ["fluffing_roller", "fluffing_roller_dirty"],
  ["roller_mop_filter", "roller_mop_filter_dirty"],
  ["water_outlet_filter", "water_outlet_filter_dirty"],
  ["washboard_cleaning", "washboard_cleaning"],
];

const stationParts = [
  ["dust_bag_status", "dust_bag"],
  ["clean_water_tank_status", "clean_water"],
  ["dirty_water_tank_status", "dirty_water"],
  ["detergent_status", "detergent"],
] as const;

/** Days of vacuum and current-room history behind each room's last cleaning. */
export const roomHistoryDays = 10;

// Dreame draws each room's number bubble this far above the room's center.
const pinLift = 44;

export interface VacuumRoom {
  /** Dreame segment id. */
  id: number;
  name: string;
  /** Material Design icon name from the vacuum. */
  icon: string | null;
  /** Position in the robot's own cleaning order, from 1. */
  sequence: number;
}

export interface VacuumTaskRoom extends VacuumRoom {
  rank: number;
  status: "done" | "current" | "next" | "upcoming";
}

export interface VacuumSetting {
  id: string;
  label: string;
  value: string;
  available: boolean;
  options: { value: string; label: string; action: ServiceAction }[];
}

export interface VacuumShortcut {
  id: string;
  name: string;
  summary: string | null;
  available: boolean;
  action: ServiceAction;
}

export interface MaintenanceItem {
  id: string;
  name: string;
  percent: number;
  value: string;
  timeLeft: string | null;
  flagged: boolean;
  reset: ServiceAction | null;
}

export interface VacuumView {
  id: string;
  name: string;
  state: string;
  phase: VacuumPhase;
  tone: Tone;
  underway: boolean;
  available: boolean;
  /** Battery and last cleaning when idle; room, area and time during a task. */
  details: string | null;
  battery: string | null;
  currentRoom: string | null;
  lastCleaned: string | null;
  progress: number | null;
  error: string | null;
  controls: VacuumAction[];
  /** Cleans the whole home. */
  start: VacuumAction | null;
  camera: { id: string; picture: string | null } | null;
  /** Rooms the page can clean, in the robot's order. */
  rooms: VacuumRoom[];
  /** Room pins in map image pixels, when the map can be calibrated. */
  pins: (VacuumRoom & { x: number; y: number })[] | null;
  /** The rooms of the running task, in cleaning order. */
  task: VacuumTaskRoom[] | null;
  roomHistoryId: string | null;
  settings: VacuumSetting[];
  shortcuts: VacuumShortcut[];
  maintenance: {
    items: MaintenanceItem[];
    flagged: number;
    next: string | null;
  };
  station: {
    ready: boolean;
    parts: string;
    alert: string | null;
    info: string | null;
  } | null;
  statistics: { id: string; name: string; value: string }[];
}

export function buildVacuumView(
  hass: HassLike,
  config: DashboardConfig,
  {
    services = {},
    now = new Date(),
  }: { services?: ServiceCatalog; now?: Date } = {},
): VacuumView | null {
  const configured = config.home_cards?.find(
    (card) => card.type === "vacuum" && !card.hidden,
  );
  const vacuum =
    configured && "entity_id" in configured
      ? hass.states[configured.entity_id]
      : Object.values(hass.states).find(
          (entity) =>
            entity.entity_id.startsWith("vacuum.") &&
            !hass.entities[entity.entity_id]?.hidden,
        );
  if (!vacuum) return null;
  const t = messages(hass.language);
  const number = new Intl.NumberFormat(locale(hass.language), {
    maximumFractionDigits: 1,
  });
  const deviceId = hass.entities[vacuum.entity_id]?.device_id;
  const siblings = deviceId
    ? Object.values(hass.states).filter(
        (entity) =>
          hass.entities[entity.entity_id]?.device_id === deviceId &&
          !hass.entities[entity.entity_id]?.hidden,
      )
    : [];
  // A longer match adds a qualifier, such as total_cleaning_time or room_1_cleaning_mode.
  const sibling = (domain: string, key: string) =>
    siblings
      .filter(
        (entity) =>
          entity.entity_id.startsWith(`${domain}.`) &&
          entity.entity_id.endsWith(`_${key}`),
      )
      .sort((a, b) => a.entity_id.length - b.entity_id.length)[0];
  const sensor = (key: string) => sibling("sensor", key);
  const reading = (entity: HassEntity | undefined) => {
    const n = numeric(entity?.state);
    return n === null
      ? null
      : `${number.format(n)}${entity?.attributes.unit_of_measurement ? ` ${entity.attributes.unit_of_measurement}` : ""}`;
  };
  const attributes = vacuum.attributes;
  const phase: VacuumPhase = Object.hasOwn(phases, vacuum.state)
    ? (vacuum.state as VacuumPhase)
    : "offline";
  const { tone, underway } = phases[phase];
  const features = numeric(attributes.supported_features) ?? 0;
  const supports = (service: VacuumService) =>
    (features & featureBits[service]) !== 0;
  const action = (service: VacuumService, label: string): VacuumAction => ({
    domain: "vacuum",
    service,
    label,
    entityId: vacuum.entity_id,
  });
  const controlLabels: Record<VacuumService, string> = {
    start: phase === "paused" ? t.resume : t.start,
    pause: t.pause,
    return_to_base: t.returnToBase,
    locate: t.locate,
  };
  const mapRooms = orderedRooms(attributes);
  const camera = siblings.find(
    (entity) =>
      entity.entity_id.startsWith("camera.") &&
      !hass.entities[entity.entity_id]?.entity_category,
  );
  const rooms = services.dreame_vacuum?.vacuum_clean_segment ? mapRooms : [];
  const battery = numeric(
    attributes.battery ??
      attributes.battery_level ??
      sensor("battery_level")?.state,
  );
  const roomSensor = sensor("current_room");
  const currentRoom =
    roomSensor && !["unknown", "unavailable"].includes(roomSensor.state)
      ? roomSensor.state
      : typeof attributes.current_room === "string"
        ? attributes.current_room
        : (mapRooms.find(({ id }) => id === attributes.current_segment)?.name ??
          null);
  const progress = numeric(sensor("cleaning_progress")?.state);
  const lastCleanedAt = lastCleaned(
    sensor("cleaning_history")?.state,
    hass.language,
  );
  const batteryText =
    battery !== null && battery >= 0 && battery <= 100
      ? t.battery(number.format(battery))
      : null;
  const details = (
    underway
      ? [
          currentRoom,
          reading(sensor("cleaned_area")),
          reading(sensor("cleaning_time")),
        ]
      : [batteryText, lastCleanedAt && t.lastCleaned(lastCleanedAt)]
  )
    .filter(Boolean)
    .join(" · ");
  const errorSensor = sensor("error");
  const error =
    errorSensor &&
    !["no_error", "unknown", "unavailable"].includes(errorSensor.state)
      ? typeof errorSensor.attributes.description === "string"
        ? errorSensor.attributes.description
        : (hass.formatEntityState?.(errorSensor) ?? errorSensor.state)
      : phase === "error"
        ? typeof attributes.error === "string" &&
          normalize(attributes.error) !== "no_error"
          ? attributes.error
          : t.vacuum.error
        : null;
  const transform = calibrationTransform(camera?.attributes.calibration_points);
  const centers: unknown = camera?.attributes.rooms;
  const pins =
    transform && centers && typeof centers === "object"
      ? rooms.flatMap((room) => {
          const center = (centers as Record<string, unknown>)[room.id];
          if (!center || typeof center !== "object") return [];
          const { x, y } = center as Record<string, unknown>;
          if (typeof x !== "number" || typeof y !== "number") return [];
          const [left, top] = transform(x, y);
          return [{ ...room, x: left, y: top - pinLift }];
        })
      : [];
  return {
    id: vacuum.entity_id,
    name:
      attributes.friendly_name ??
      hass.entities[vacuum.entity_id]?.name ??
      t.vacuumLabel,
    state:
      hass.formatEntityState?.(vacuum) ??
      translatedState(t.vacuum, vacuum.state),
    phase,
    tone,
    underway,
    available: phase !== "offline",
    details: details || null,
    battery: batteryText,
    currentRoom,
    lastCleaned: lastCleanedAt,
    progress:
      underway && progress !== null && progress >= 0 && progress <= 100
        ? progress
        : null,
    error,
    controls: phases[phase].controls
      .filter(supports)
      .map((service) => action(service, controlLabels[service])),
    start: supports("start") ? action("start", t.cleanEverything) : null,
    camera: camera
      ? {
          id: camera.entity_id,
          picture:
            typeof camera.attributes.entity_picture === "string"
              ? (hass.hassUrl?.(camera.attributes.entity_picture) ??
                camera.attributes.entity_picture)
              : null,
        }
      : null,
    rooms,
    pins: pins.length ? pins : null,
    task:
      underway && mapRooms.length
        ? taskRooms(mapRooms, attributes, vacuum.state)
        : null,
    roomHistoryId: roomSensor?.entity_id ?? null,
    settings: (
      [
        ["cleaning_mode", t.cleaningMode],
        ["suction_level", t.suctionLevel],
      ] as const
    ).flatMap(([key, label]) => {
      const entity = sibling("select", key);
      const options: unknown = entity?.attributes.options;
      if (!entity || !Array.isArray(options)) return [];
      return [
        {
          id: entity.entity_id,
          label,
          value: entity.state,
          available: !["unknown", "unavailable"].includes(entity.state),
          options: options
            .filter((option): option is string => typeof option === "string")
            .map((option) => {
              const text =
                hass.formatEntityState?.(entity, option) ?? humanize(option);
              return {
                value: option,
                label: text,
                action: {
                  domain: "select",
                  service: "select_option",
                  entityId: entity.entity_id,
                  label: `${label}: ${text}`,
                  data: { option },
                },
              };
            }),
        },
      ];
    }),
    shortcuts: siblings
      .filter(
        (entity) =>
          entity.entity_id.startsWith("button.") &&
          typeof entity.attributes.name === "string" &&
          Array.isArray(entity.attributes.tasks),
      )
      .sort(
        (a, b) =>
          (numeric(a.attributes.index) ?? 0) -
          (numeric(b.attributes.index) ?? 0),
      )
      .map((entity) => ({
        id: entity.entity_id,
        name: entity.attributes.name,
        summary: shortcutSummary(entity.attributes.tasks, mapRooms, t),
        available: entity.state !== "unavailable",
        action: {
          domain: "button",
          service: "press",
          entityId: entity.entity_id,
          label: t.runShortcut(entity.attributes.name),
        },
      })),
    maintenance: maintenance(siblings, sensor, now, t, number),
    station: station(attributes, t),
    statistics: statistics(sensor, t, number),
  };
}

/** The selected rooms in the order the robot cleans them, so ranks match what it does. */
export function roomSelection(
  rooms: VacuumRoom[],
  selected: ReadonlySet<number>,
): VacuumRoom[] {
  return rooms.filter((room) => selected.has(room.id));
}

/** Cleans the chosen rooms, or the whole home when none is chosen. */
export function cleaningAction(
  view: VacuumView,
  chosen: VacuumRoom[],
  language: string,
): ServiceAction | null {
  return chosen.length
    ? {
        domain: "dreame_vacuum",
        service: "vacuum_clean_segment",
        entityId: view.id,
        label: messages(language).cleanRooms(chosen.length),
        data: { segments: chosen.map((room) => room.id) },
      }
    : view.start;
}

/**
 * Maps vacuum coordinates to map image pixels from Dreame's three
 * calibration points, or null when they do not describe a plane.
 */
export function calibrationTransform(
  points: unknown,
): ((x: number, y: number) => [number, number]) | null {
  if (!Array.isArray(points) || points.length < 3) return null;
  const pairs: number[][] = [];
  for (const point of points.slice(0, 3)) {
    const { vacuum, map } = (point ?? {}) as Record<string, unknown>;
    const from = (vacuum ?? {}) as Record<string, unknown>;
    const to = (map ?? {}) as Record<string, unknown>;
    const values = [from.x, from.y, to.x, to.y];
    if (
      !values.every(
        (value): value is number =>
          typeof value === "number" && Number.isFinite(value),
      )
    )
      return null;
    pairs.push(values);
  }
  const [[x0, y0, u0, v0], [x1, y1, u1, v1], [x2, y2, u2, v2]] = pairs;
  const det = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (det === 0) return null;
  const solve = (w0: number, w1: number, w2: number) => {
    const a = ((w1 - w0) * (y2 - y0) - (w2 - w0) * (y1 - y0)) / det;
    const b = ((x1 - x0) * (w2 - w0) - (x2 - x0) * (w1 - w0)) / det;
    return [a, b, w0 - a * x0 - b * y0];
  };
  const [a, b, c] = solve(u0, u1, u2);
  const [d, e, f] = solve(v0, v1, v2);
  return (x, y) => [a * x + b * y + c, d * x + e * y + f];
}

/** State history of the vacuum and its `sensor.*_current_room`. */
export interface CleaningHistory {
  vacuum: HistoryPoint[];
  room: HistoryPoint[];
}

interface Stint {
  state: string;
  start: number;
  end: number;
}

// Passing through a room or flickering at a doorway takes seconds; cleaning even a small room takes minutes.
const minimumCleaningMs = 90_000;

/**
 * Labels each room by the last day the robot spent at least 90 seconds in
 * it while cleaning. Within a cleaning session, time before the room sensor
 * first changes is ignored: the robot has not left its starting spot, which
 * also drops mop washing at the dock.
 */
export function roomLastCleaned(
  history: CleaningHistory,
  now: Date,
  timeZone: string,
  language: string,
): (room: string) => string {
  const t = messages(language);
  const cleaned = cleanedAt(history, now.getTime());
  const day = (time: number) => {
    const [year, month, date] = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    })
      .formatToParts(time)
      .filter((part) => part.type !== "literal")
      .map((part) => Number(part.value));
    return Date.UTC(year, month - 1, date) / 86_400_000;
  };
  const today = day(now.getTime());
  return (room) => {
    const time = cleaned.get(room);
    if (time === undefined) return t.notCleanedRecently(roomHistoryDays);
    const days = today - day(time);
    return days <= 0 ? t.today : days === 1 ? t.yesterday : t.daysAgo(days);
  };
}

function cleanedAt(history: CleaningHistory, now: number): Map<string, number> {
  const rooms = stints(history.room, now);
  const sessions: Stint[] = [];
  for (const stint of stints(history.vacuum, now)) {
    if (stint.state !== "cleaning") continue;
    const last = sessions[sessions.length - 1];
    if (last?.end === stint.start) last.end = stint.end;
    else sessions.push({ ...stint });
  }
  const cleaned = new Map<string, number>();
  for (const session of sessions) {
    const moved = rooms.find(
      (stint, index) =>
        index > 0 &&
        stint.start > session.start &&
        stint.start < session.end &&
        stint.state !== rooms[index - 1].state,
    );
    if (!moved) continue;
    const dwell = new Map<string, { time: number; end: number }>();
    for (const stint of rooms) {
      const start = Math.max(stint.start, moved.start);
      const end = Math.min(stint.end, session.end);
      if (end <= start || ["unknown", "unavailable"].includes(stint.state))
        continue;
      const room = dwell.get(stint.state);
      dwell.set(stint.state, {
        time: (room?.time ?? 0) + end - start,
        end: Math.max(room?.end ?? 0, end),
      });
    }
    for (const [room, { time, end }] of dwell)
      if (time >= minimumCleaningMs)
        cleaned.set(room, Math.max(cleaned.get(room) ?? 0, end));
  }
  return cleaned;
}

function stints(points: HistoryPoint[], now: number): Stint[] {
  return points.map((point, index) => ({
    state: point.s,
    start: point.lu * 1000,
    end: index + 1 < points.length ? points[index + 1].lu * 1000 : now,
  }));
}

function orderedRooms(attributes: HassEntity["attributes"]): VacuumRoom[] {
  const raw: unknown = attributes.rooms;
  const list: unknown =
    raw &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    typeof attributes.selected_map === "string"
      ? (raw as Record<string, unknown>)[attributes.selected_map]
      : raw;
  const rooms = Array.isArray(list)
    ? list.flatMap((room: unknown) => {
        if (!room || typeof room !== "object") return [];
        const { id, name, icon } = room as Record<string, unknown>;
        return typeof id === "number" &&
          Number.isInteger(id) &&
          id > 0 &&
          typeof name === "string"
          ? [{ id, name, icon: typeof icon === "string" ? icon : null }]
          : [];
      })
    : [];
  const sequence: unknown[] = Array.isArray(attributes.cleaning_sequence)
    ? attributes.cleaning_sequence
    : [];
  const position = (id: number) => {
    const index = sequence.indexOf(id);
    return index < 0 ? sequence.length : index;
  };
  return rooms
    .map((room, index) => ({ room, index }))
    .sort(
      (a, b) => position(a.room.id) - position(b.room.id) || a.index - b.index,
    )
    .map(({ room }, index) => ({ ...room, sequence: index + 1 }));
}

function taskRooms(
  rooms: VacuumRoom[],
  attributes: HassEntity["attributes"],
  state: string,
): VacuumTaskRoom[] | null {
  const ids = (value: unknown) =>
    Array.isArray(value)
      ? value.filter((id): id is number => typeof id === "number")
      : [];
  const active = ids(attributes.active_segments);
  const completed = ids(attributes.completed_segments);
  // Without active segments, only a whole-home clean still covers every room;
  // zone and spot cleans and the trip home have no room list to follow.
  if (
    !active.length &&
    (state === "returning" || attributes.zone_cleaning || attributes.spot_cleaning)
  )
    return null;
  const inTask = active.length
    ? rooms.filter((room) => active.includes(room.id))
    : rooms;
  const status = (room: VacuumRoom) =>
    completed.includes(room.id)
      ? "done"
      : room.id === attributes.current_segment
        ? "current"
        : "upcoming";
  // Rooms before the current one that are not done were skipped, not next.
  const current = inTask.findIndex((room) => status(room) === "current");
  const next = inTask.findIndex(
    (room, index) => index > current && status(room) === "upcoming",
  );
  return inTask.map((room, index) => ({
    ...room,
    rank: index + 1,
    status: index === next ? "next" : status(room),
  }));
}

function shortcutSummary(
  tasks: unknown[],
  rooms: VacuumRoom[],
  t: ReturnType<typeof messages>,
): string | null {
  const passes = new Map<string, number>();
  for (const task of tasks)
    for (const item of Array.isArray(task) ? task : []) {
      if (!item || typeof item !== "object") continue;
      const { segment_id, cleaning_times, task_type } = item as Record<
        string,
        unknown
      >;
      const name =
        typeof segment_id === "number"
          ? rooms.find((room) => room.id === segment_id)?.name
          : task_type === 0
            ? t.shortcutAll
            : task_type === 2
              ? t.shortcutZone
              : task_type === 3
                ? t.shortcutCustom
                : undefined;
      if (name)
        passes.set(
          name,
          (passes.get(name) ?? 0) + Math.max(1, numeric(cleaning_times) ?? 1),
        );
    }
  return passes.size
    ? [...passes]
        .map(([name, count]) =>
          count > 1 ? `${name} · ${t.shortcutPasses(count)}` : name,
        )
        .join(", ")
    : null;
}

function maintenance(
  siblings: HassEntity[],
  sensor: (key: string) => HassEntity | undefined,
  now: Date,
  t: ReturnType<typeof messages>,
  number: Intl.NumberFormat,
): VacuumView["maintenance"] {
  const states = new Map(siblings.map((entity) => [entity.entity_id, entity]));
  const flags: unknown = siblings.find(
    (entity) =>
      entity.entity_id.startsWith("binary_sensor.") &&
      entity.entity_id.endsWith("_maintenance"),
  )?.attributes.items;
  const days = new Map<PartKey, number>();
  const usage = cleaningHoursPerDay(sensor, now);
  const items = siblings.flatMap((entity): MaintenanceItem[] => {
    const percent = numeric(entity.state);
    const part = parts
      .filter(([, key]) => entity.entity_id.endsWith(`_${key}_left`))
      .sort((a, b) => b[1].length - a[1].length)[0];
    if (
      !part ||
      !entity.entity_id.startsWith("sensor.") ||
      entity.attributes.unit_of_measurement !== "%" ||
      percent === null ||
      percent < 0 ||
      percent > 100
    )
      return [];
    const [item, key] = part;
    const prefix = entity.entity_id.slice(
      "sensor.".length,
      -`_${key}_left`.length,
    );
    const time = states.get(`sensor.${prefix}_${key}_time_left`);
    const left = numeric(time?.state);
    const unit = time?.attributes.unit_of_measurement;
    const hours =
      left === null
        ? null
        : unit === "h"
          ? left
          : unit === "d"
            ? left * 24
            : null;
    if (left !== null && unit === "d") days.set(item, left);
    else if (hours !== null && usage) days.set(item, hours / usage);
    const reset = states.get(`button.${prefix}_reset_${item}`);
    const name = t.vacuumParts[item];
    return [
      {
        id: entity.entity_id,
        name,
        percent,
        value: `${number.format(percent)} %`,
        timeLeft:
          hours === null
            ? null
            : unit === "d" && hours >= 24
              ? t.daysLeft(Math.round(hours / 24))
              : t.hoursLeft(Math.round(hours)),
        flagged: Array.isArray(flags) ? flags.includes(item) : percent < 10,
        reset:
          reset && reset.state !== "unavailable"
            ? {
                domain: "button",
                service: "press",
                entityId: reset.entity_id,
                label: t.maintenanceDoneFor(name),
              }
            : null,
      },
    ];
  });
  items.sort((a, b) => a.percent - b.percent);
  const flagged = items.filter((item) => item.flagged).length;
  const soonest = [...days].sort((a, b) => a[1] - b[1])[0];
  return {
    items,
    flagged,
    next:
      !flagged && soonest
        ? nextMaintenance(soonest[1], t.vacuumParts[soonest[0]], t)
        : null,
  };
}

function cleaningHoursPerDay(
  sensor: (key: string) => HassEntity | undefined,
  now: Date,
): number | null {
  const first = Date.parse(sensor("first_cleaning_date")?.state ?? "");
  const total = sensor("total_cleaning_time");
  const value = numeric(total?.state);
  const hours =
    value === null
      ? null
      : total?.attributes.unit_of_measurement === "min"
        ? value / 60
        : total?.attributes.unit_of_measurement === "h"
          ? value
          : null;
  const elapsed = (now.getTime() - first) / 86_400_000;
  return hours && Number.isFinite(elapsed) && elapsed >= 1
    ? hours / elapsed
    : null;
}

function nextMaintenance(
  days: number,
  name: string,
  t: ReturnType<typeof messages>,
) {
  const rounded = Math.max(1, Math.round(days));
  const [count, unit] =
    rounded < 14
      ? [rounded, "day" as const]
      : rounded < 60
        ? [Math.round(rounded / 7), "week" as const]
        : [Math.round(rounded / 30.44), "month" as const];
  return t.nextMaintenance(name.toLocaleLowerCase(), count, unit);
}

function station(
  attributes: HassEntity["attributes"],
  t: ReturnType<typeof messages>,
): VacuumView["station"] {
  const present = stationParts.filter(
    ([attribute]) => typeof attributes[attribute] === "string",
  );
  if (!present.length) return null;
  const problems = [
    ...present
      .filter(
        ([attribute]) =>
          !["installed", "disabled", "checking", "unknown"].includes(
            normalize(attributes[attribute]),
          ),
      )
      .map(([, part]) => t.stationParts[part]),
    ...(typeof attributes.low_water_warning === "string" &&
    normalize(attributes.low_water_warning) !== "no_warning"
      ? [t.stationLowWater]
      : []),
  ];
  const autoEmpty =
    typeof attributes.auto_empty_mode === "string"
      ? normalize(attributes.auto_empty_mode)
      : null;
  const hotWater =
    typeof attributes.hot_water_status === "string"
      ? normalize(attributes.hot_water_status)
      : null;
  const info = [
    autoEmpty &&
      (t.autoEmptyModes[autoEmpty as keyof typeof t.autoEmptyModes] ??
        humanize(autoEmpty)),
    hotWater === "enabled" || hotWater === "disabled"
      ? t.hotWater[hotWater]
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    ready: !problems.length,
    parts: present.map(([, part]) => t.stationParts[part]).join(" · "),
    alert: problems.length ? problems.join(" · ") : null,
    info: info || null,
  };
}

function statistics(
  sensor: (key: string) => HassEntity | undefined,
  t: ReturnType<typeof messages>,
  number: Intl.NumberFormat,
): VacuumView["statistics"] {
  const rows: [
    string,
    string,
    (entity: HassEntity, value: number) => string | null,
  ][] = [
    [
      "total_cleaned_area",
      t.cleanedAreaTotal,
      (entity, value) =>
        `${number.format(value)}${entity.attributes.unit_of_measurement ? ` ${entity.attributes.unit_of_measurement}` : ""}`,
    ],
    ["cleaning_count", t.cleaningCount, (_, value) => number.format(value)],
    [
      "total_cleaning_time",
      t.cleaningTimeTotal,
      (entity, value) => {
        const unit = entity.attributes.unit_of_measurement;
        const minutes = Math.round(
          unit === "h" ? value * 60 : unit === "min" ? value : Number.NaN,
        );
        return Number.isFinite(minutes)
          ? `${number.format(Math.floor(minutes / 60))} h ${String(minutes % 60).padStart(2, "0")}`
          : null;
      },
    ],
  ];
  return rows.flatMap(([key, name, format]) => {
    const entity = sensor(key);
    const value = numeric(entity?.state);
    const text = entity && value !== null ? format(entity, value) : null;
    return entity && text ? [{ id: entity.entity_id, name, value: text }] : [];
  });
}

/** Dreame attributes carry display names such as "Not installed". */
function normalize(value: unknown) {
  return String(value).trim().toLowerCase().replaceAll(" ", "_");
}

function humanize(value: string) {
  const text = value.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function lastCleaned(state: string | undefined, language: string) {
  const time = state ? Date.parse(state) : Number.NaN;
  return Number.isFinite(time)
    ? new Intl.DateTimeFormat(locale(language), {
        weekday: "short",
        day: "numeric",
        month: "short",
      }).format(time)
    : null;
}

/** The vacuum page's sections: the saved order, then any it lacks. */
export function vacuumSectionOrder(
  config: VacuumConfig | null | undefined,
): VacuumSection[] {
  return [...new Set([...(config?.sections ?? []), ...vacuumSections])];
}
