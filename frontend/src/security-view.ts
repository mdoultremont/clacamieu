import type { SensorRow } from "./components/sensor-rows";
import { locale, messages } from "./i18n";
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
export interface SecuritySensorGroup {
  summary: string;
  alert: boolean;
  sensors: SensorRow[];
  /** Sensors an admin left out of Security. */
  hidden: { id: string; name: string }[];
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
): SecurityView {
  const t = messages(hass.language);
  const language = locale(hass.language);
  const states = Object.values(hass.states);
  const visible = states.filter((entity) => {
    const entry = hass.entities[entity.entity_id];
    return !entry?.hidden && !entry?.entity_category;
  });
  const configured = config.home_cards?.find((card) => card.type === "alarm");
  const vacuumDevices = new Set(
    states.flatMap((entity) => {
      const device = hass.entities[entity.entity_id]?.device_id;
      return entity.entity_id.startsWith("vacuum.") && device ? [device] : [];
    }),
  );
  const cameraDevices = new Set<string>();
  const alarm =
    (configured?.type === "alarm"
      ? hass.states[configured.entity_id]
      : undefined) ??
    states.find((entity) => entity.entity_id.startsWith("alarm_control_panel."));
  const name = (entity: HassEntity): string =>
    entity.attributes.friendly_name ??
    hass.entities[entity.entity_id]?.name ??
    entity.entity_id;
  const hiddenIds = new Set(config.security?.hidden_entity_ids);
  const group = (
    classes: string[],
    activeSummary: (count: number) => string,
    safeSummary: (closed: number, total: number) => string,
    stateLabels: { on: string; off: string },
    alertWhenOn: boolean,
  ): SecuritySensorGroup => {
    const all = visible.filter(
      (entity) =>
        entity.entity_id.startsWith("binary_sensor.") &&
        classes.includes(entity.attributes.device_class ?? ""),
    );
    const entities = all.filter((entity) => !hiddenIds.has(entity.entity_id));
    const active = entities.filter((entity) => entity.state === "on").length;
    const closed = entities.filter((entity) => entity.state === "off").length;
    const unavailable = entities.length - active - closed;
    const summary = !entities.length
      ? t.noSensors
      : active
        ? activeSummary(active)
        : safeSummary(closed, active + closed);
    return {
      summary: [summary, unavailable ? t.securityUnavailable(unavailable) : ""]
        .filter(Boolean)
        .join(" · "),
      alert: active > 0,
      hidden: all
        .filter((entity) => hiddenIds.has(entity.entity_id))
        .map((entity) => ({ id: entity.entity_id, name: name(entity) })),
      sensors: entities
        .sort(
          (a, b) =>
            Number(b.state === "on") - Number(a.state === "on") ||
            Number(b.state === "off") - Number(a.state === "off") ||
            name(a).localeCompare(name(b), language),
        )
        .map((entity) => ({
          id: entity.entity_id,
          name: name(entity),
          deviceClass: entity.attributes.device_class ?? "",
          active: entity.state === "on",
          alert: alertWhenOn && entity.state === "on",
          available: ["on", "off"].includes(entity.state),
          state: !["on", "off"].includes(entity.state)
            ? t.unavailable
            : (hass.formatEntityState?.(entity) ??
              stateLabels[entity.state as "on" | "off"]),
        })),
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
                !!alarm.attributes.code_format &&
                (mode.state === "disarmed" ||
                  alarm.attributes.code_arm_required === true),
            })),
        }
      : null,
    cameras: visible
      .filter((entity) => entity.entity_id.startsWith("camera."))
      .sort(
        (a, b) =>
          Number(["unavailable", "unknown"].includes(a.state)) -
          Number(["unavailable", "unknown"].includes(b.state)),
      )
      // A device exposes one camera entity per stream, and a vacuum exposes its map as one.
      .filter((entity) => {
        const device = hass.entities[entity.entity_id]?.device_id;
        if (!device) return true;
        if (vacuumDevices.has(device) || cameraDevices.has(device)) return false;
        cameraDevices.add(device);
        return true;
      })
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
      false,
    ),
    leaks: group(
      ["moisture"],
      t.securityLeaks,
      (closed) => (closed > 0 ? t.securityNoLeak : ""),
      { on: t.leak, off: t.sensorDry },
      true,
    ),
    detectors: group(
      ["smoke", "gas", "carbon_monoxide", "safety"],
      t.securityAlerts,
      (closed) => (closed > 0 ? t.securityNoAlert : ""),
      { on: t.securityDetected, off: t.securityClear },
      true,
    ),
  };
}

/** How long ago a change happened, as a short duration such as "54 min". */
export function elapsed(changed: number, now: Date, language: string): string {
  const seconds = Math.max(0, (now.getTime() - changed) / 1000);
  const [unit, divisor] =
    seconds >= 86400
      ? ["day", 86400]
      : seconds >= 3600
        ? ["hour", 3600]
        : seconds >= 60
          ? ["minute", 60]
          : ["second", 1];
  return new Intl.NumberFormat(language, {
    style: "unit",
    unit,
    unitDisplay: "short",
  }).format(Math.trunc(seconds / divisor));
}
