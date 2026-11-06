import { locale, messages } from "./i18n";
import { entityArea } from "./room-sensors";
import type { HassEntity, HassLike } from "./types";

/** One state change from Home Assistant's `logbook/get_events` command. */
export interface LogbookEntry {
  entity_id?: string;
  state?: string;
  /** Seconds since the epoch. */
  when: number;
}

export type ActivityTone = "idle" | "active" | "alert";

export interface ActivityEvent {
  id: string;
  entityId: string;
  name: string;
  area: string | null;
  state: string;
  time: string;
  tone: ActivityTone;
}

export interface ActivityDay {
  label: string;
  events: ActivityEvent[];
}

const openings = ["door", "window", "garage_door"];
const alerts = ["moisture", "smoke", "gas", "carbon_monoxide", "safety"];
const presence = ["motion", "occupancy"];
const unavailableStates = ["unavailable", "unknown"];
export const activityWindowHours = 24;
const maxEvents = 30;

/** The visible openings, alert and motion sensors, and alarm panels the Activity section follows. */
export function activityEntityIds(hass: HassLike): string[] {
  return Object.values(hass.states)
    .filter((entity) => {
      const entry = hass.entities[entity.entity_id];
      if (entry?.hidden || entry?.entity_category) return false;
      if (entity.entity_id.startsWith("alarm_control_panel.")) return true;
      const deviceClass = String(entity.attributes.device_class ?? "");
      return (
        entity.entity_id.startsWith("binary_sensor.") &&
        [...openings, ...alerts, ...presence].includes(deviceClass)
      );
    })
    .map((entity) => entity.entity_id)
    .sort();
}

export function buildActivity(
  hass: HassLike,
  entries: LogbookEntry[],
  now: Date,
): ActivityDay[] {
  const t = messages(hass.language);
  const language = locale(hass.language);
  const time = new Intl.DateTimeFormat(language, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const date = new Intl.DateTimeFormat(language, {
    day: "numeric",
    month: "long",
  });
  const dayKey = (value: Date) =>
    `${value.getFullYear()}-${value.getMonth()}-${value.getDate()}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const days = new Map<string, ActivityDay>();
  const events = entries
    .filter(
      (entry): entry is Required<LogbookEntry> =>
        !!entry.entity_id &&
        !!entry.state &&
        !!hass.states[entry.entity_id] &&
        !unavailableStates.includes(entry.state),
    )
    .sort((a, b) => b.when - a.when)
    .slice(0, maxEvents);
  for (const entry of events) {
    const entity = hass.states[entry.entity_id];
    const when = new Date(entry.when * 1000);
    const key = dayKey(when);
    const label =
      key === dayKey(now)
        ? `${t.today} · ${date.format(when)}`
        : key === dayKey(yesterday)
          ? `${t.yesterday} · ${date.format(when)}`
          : date.format(when);
    const area = entityArea(hass, entry.entity_id);
    const day = days.get(key) ?? { label, events: [] };
    day.events.push({
      id: `${entry.entity_id}-${entry.when}`,
      entityId: entry.entity_id,
      name:
        entity.attributes.friendly_name ??
        hass.entities[entry.entity_id]?.name ??
        entry.entity_id,
      area: (area && hass.areas[area]?.name) || null,
      state: stateLabel(hass, entity, entry.state),
      time: time.format(when),
      tone: tone(entity, entry.state),
    });
    days.set(key, day);
  }
  return [...days.values()];
}

function stateLabel(hass: HassLike, entity: HassEntity, state: string) {
  const t = messages(hass.language);
  if (entity.entity_id.startsWith("alarm_control_panel."))
    return (
      t.securityModes[state as keyof typeof t.securityModes] ??
      t.alarm[state as keyof typeof t.alarm] ??
      state
    );
  const formatted = hass.formatEntityState?.({ ...entity, state });
  if (formatted) return formatted;
  const deviceClass = String(entity.attributes.device_class ?? "");
  const labels = openings.includes(deviceClass)
    ? { on: t.sensorOpen, off: t.sensorClosed }
    : deviceClass === "moisture"
      ? { on: t.leakDetected, off: t.sensorDry }
      : { on: t.securityDetected, off: t.securityClear };
  return labels[state as "on" | "off"] ?? state;
}

function tone(entity: HassEntity, state: string): ActivityTone {
  if (entity.entity_id.startsWith("alarm_control_panel."))
    return ["triggered", "pending"].includes(state)
      ? "alert"
      : state === "disarmed"
        ? "idle"
        : "active";
  if (state !== "on") return "idle";
  return alerts.includes(String(entity.attributes.device_class ?? ""))
    ? "alert"
    : "active";
}
