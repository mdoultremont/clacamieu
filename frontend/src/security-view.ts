import { locale, messages } from "./i18n";
import { entityArea } from "./room-sensors";
import type { DashboardConfig, HassEntity, HassLike } from "./types";

const alarmModes = [
  { state: "disarmed", service: "alarm_disarm", feature: 0 },
  { state: "armed_home", service: "alarm_arm_home", feature: 1 },
  { state: "armed_away", service: "alarm_arm_away", feature: 2 },
  { state: "armed_night", service: "alarm_arm_night", feature: 4 },
  { state: "armed_vacation", service: "alarm_arm_vacation", feature: 32 },
  {
    state: "armed_custom_bypass",
    service: "alarm_arm_custom_bypass",
    feature: 16,
  },
] as const;

export type AlarmMode = (typeof alarmModes)[number] & {
  label: string;
  confirmation: string;
  needsCode: boolean;
};
export interface SecuritySensor {
  id: string;
  name: string;
  description: string;
  state: string;
  active: boolean;
}
export interface SecuritySensorGroup {
  summary: string;
  alert: boolean;
  sensors: SecuritySensor[];
}
export interface SecurityView {
  alarm: {
    id: string;
    title: string;
    description: string;
    state: string;
    available: boolean;
    modes: AlarmMode[];
  } | null;
  cameras: { id: string; name: string; picture: string | null }[];
  openings: SecuritySensorGroup;
  leaks: SecuritySensorGroup;
  detectors: SecuritySensorGroup;
}

export function buildSecurityView(
  hass: HassLike,
  config: DashboardConfig,
  now: Date,
): SecurityView {
  const t = messages(hass.language);
  const language = locale(hass.language);
  const states = Object.values(hass.states);
  const visible = states.filter((entity) => {
    const entry = hass.entities[entity.entity_id];
    return !entry?.hidden && !entry?.entity_category;
  });
  const configured = config.home_cards?.find((card) => card.type === "alarm");
  const alarm =
    configured?.type === "alarm"
      ? hass.states[configured.entity_id]
      : states.find((entity) =>
          entity.entity_id.startsWith("alarm_control_panel."),
        );
  const name = (entity: HassEntity): string =>
    entity.attributes.friendly_name ??
    hass.entities[entity.entity_id]?.name ??
    entity.entity_id;
  const group = (
    classes: string[],
    activeSummary: (count: number) => string,
    safeSummary: (closed: number, total: number) => string,
    stateLabels: { on: string; off: string },
  ): SecuritySensorGroup => {
    const entities = visible.filter(
      (entity) =>
        entity.entity_id.startsWith("binary_sensor.") &&
        classes.includes(entity.attributes.device_class ?? ""),
    );
    const active = entities.filter((entity) => entity.state === "on").length;
    const closed = entities.filter((entity) => entity.state === "off").length;
    const unavailable = entities.length - active - closed;
    const summary = !entities.length
      ? t.noSafetySensors
      : active
        ? activeSummary(active)
        : safeSummary(closed, entities.length);
    return {
      summary: [summary, unavailable ? t.securityUnavailable(unavailable) : ""]
        .filter(Boolean)
        .join(" · "),
      alert: active > 0,
      sensors: entities
        .sort(
          (a, b) =>
            Number(b.state === "on") - Number(a.state === "on") ||
            name(a).localeCompare(name(b), language),
        )
        .map((entity) => {
          const area = entityArea(hass, entity.entity_id);
          const changed = Date.parse(entity.last_changed);
          return {
            id: entity.entity_id,
            name: name(entity),
            description: [
              area ? hass.areas[area]?.name : null,
              Number.isFinite(changed)
                ? relativeTime(changed, now, language)
                : null,
            ]
              .filter(Boolean)
              .join(" · "),
            active: entity.state === "on",
            state: !["on", "off"].includes(entity.state)
              ? t.unavailable
              : (hass.formatEntityState?.(entity) ??
                stateLabels[entity.state as "on" | "off"]),
          };
        }),
    };
  };
  const changed = alarm ? Date.parse(alarm.last_changed) : NaN;
  const changedBy: unknown = alarm?.attributes.changed_by;
  return {
    alarm: alarm
      ? {
          id: alarm.entity_id,
          title:
            t.alarm[alarm.state as keyof typeof t.alarm] ??
            hass.formatEntityState?.(alarm) ??
            alarm.state,
          description: [
            Number.isFinite(changed)
              ? t.securitySince(
                  new Intl.DateTimeFormat(language, {
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(changed),
                )
              : null,
            typeof changedBy === "string" && changedBy
              ? t.securityChangedBy(changedBy)
              : null,
          ]
            .filter(Boolean)
            .join(" · "),
          state: alarm.state,
          available: !["unknown", "unavailable"].includes(alarm.state),
          modes: alarmModes
            .filter(
              (mode) =>
                !mode.feature ||
                (Number(alarm.attributes.supported_features) & mode.feature) !==
                  0,
            )
            .map((mode) => ({
              ...mode,
              label: t.securityModes[mode.state],
              confirmation:
                mode.state === "disarmed"
                  ? t.securityDisarmConfirm
                  : t.securityArmConfirm(t.securityModes[mode.state]),
              needsCode:
                !!alarm.attributes.code_format ||
                (mode.state !== "disarmed" &&
                  alarm.attributes.code_arm_required === true),
            })),
        }
      : null,
    cameras: visible
      .filter((entity) => entity.entity_id.startsWith("camera."))
      .map((entity) => ({
        id: entity.entity_id,
        name: name(entity),
        picture:
          !["unavailable", "unknown"].includes(entity.state) &&
          typeof entity.attributes.entity_picture === "string"
            ? entity.attributes.entity_picture
            : null,
      })),
    openings: group(
      ["door", "window", "garage_door"],
      t.openingsOpen,
      t.securityClosed,
      { on: t.sensorOpen, off: t.sensorClosed },
    ),
    leaks: group(
      ["moisture"],
      t.securityLeaks,
      (closed, total) => (closed === total ? t.securityNoLeak : ""),
      { on: t.leak, off: t.sensorDry },
    ),
    detectors: group(
      ["smoke", "gas", "carbon_monoxide", "safety"],
      t.securityAlerts,
      (closed, total) => (closed === total ? t.securityNoAlert : ""),
      { on: t.securityDetected, off: t.securityClear },
    ),
  };
}

function relativeTime(changed: number, now: Date, language: string): string {
  const seconds = (changed - now.getTime()) / 1000;
  const [unit, divisor]: [Intl.RelativeTimeFormatUnit, number] =
    Math.abs(seconds) >= 86400
      ? ["day", 86400]
      : Math.abs(seconds) >= 3600
        ? ["hour", 3600]
        : Math.abs(seconds) >= 60
          ? ["minute", 60]
          : ["second", 1];
  return new Intl.RelativeTimeFormat(language, {
    numeric: "auto",
    style: "short",
  }).format(Math.trunc(seconds / divisor), unit);
}
