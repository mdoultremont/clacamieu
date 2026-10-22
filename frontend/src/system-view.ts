import { numeric } from "./home-view";
import { locale, messages } from "./i18n";
import { entityArea } from "./room-sensors";
import type { HassLike } from "./types";

export interface SystemEntity {
  id: string;
  name: string;
  area: string | null;
}
export interface SystemView {
  unavailable: (SystemEntity & { since: string; entities: number })[];
  batteries: (SystemEntity & { level: number; value: string })[];
  updates: (SystemEntity & { installed: string; latest: string })[];
}

export function buildSystemView(hass: HassLike, now: Date): SystemView {
  const t = messages(hass.language);
  const language = locale(hass.language);
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 0 });
  const relative = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
  const view: SystemView = { unavailable: [], batteries: [], updates: [] };
  // A device is offline only when none of its entities responds. Many online devices
  // keep feature-gated entities unavailable, which is not a problem to report.
  const responding = new Set(
    Object.values(hass.states).flatMap((entity) => {
      const entry = hass.entities[entity.entity_id];
      return entry?.device_id && !entry.hidden && entity.state !== "unavailable"
        ? [entry.device_id]
        : [];
    }),
  );
  const offline = new Map<
    string,
    { entity: SystemEntity; changed: number[]; count: number }
  >();
  for (const entity of Object.values(hass.states)) {
    const entry = hass.entities[entity.entity_id];
    if (entry?.hidden) continue;
    const areaId = entityArea(hass, entity.entity_id);
    const base: SystemEntity = {
      id: entity.entity_id,
      name: entity.attributes.friendly_name ?? entry?.name ?? entity.entity_id,
      area: areaId ? (hass.areas[areaId]?.name ?? null) : null,
    };
    if (
      entity.state === "unavailable" &&
      entry?.entity_category !== "diagnostic" &&
      !(entry?.device_id && responding.has(entry.device_id))
    ) {
      const deviceId = entry?.device_id;
      const device = deviceId ? hass.devices[deviceId] : undefined;
      const key = device ? `device:${device.id}` : entity.entity_id;
      const group = offline.get(key) ?? {
        entity: {
          ...base,
          name: device?.name_by_user ?? device?.name ?? base.name,
          area: device?.area_id
            ? (hass.areas[device.area_id]?.name ?? base.area)
            : base.area,
        },
        changed: [],
        count: 0,
      };
      group.count += 1;
      group.changed.push(Date.parse(entity.last_changed));
      offline.set(key, group);
    }
    const level = numeric(entity.state);
    if (
      entity.entity_id.startsWith("sensor.") &&
      entity.attributes.device_class === "battery" &&
      entity.attributes.unit_of_measurement === "%" &&
      level !== null &&
      level >= 0 &&
      level < 40
    ) {
      view.batteries.push({
        ...base,
        level,
        value: `${number.format(level)} %`,
      });
    }
    if (entity.entity_id.startsWith("update.") && entity.state === "on") {
      view.updates.push({
        ...base,
        installed: entity.attributes.installed_version ?? t.unknownVersion,
        latest: entity.attributes.latest_version ?? t.unknownVersion,
      });
    }
  }
  for (const { entity, changed, count } of offline.values()) {
    const latest = Math.max(...changed.filter(Number.isFinite));
    const elapsed = now.getTime() - latest;
    const minutes = Math.max(0, Math.floor(elapsed / 60_000));
    const since = !Number.isFinite(elapsed)
      ? t.unknownTime
      : minutes < 1
        ? t.justNow
        : minutes < 60
          ? relative.format(-minutes, "minute")
          : minutes < 1440
            ? relative.format(-Math.floor(minutes / 60), "hour")
            : relative.format(-Math.floor(minutes / 1440), "day");
    view.unavailable.push({ ...entity, since, entities: count });
  }
  view.unavailable.sort(
    (a, b) => b.entities - a.entities || a.name.localeCompare(b.name, language),
  );
  view.batteries.sort((a, b) => a.level - b.level);
  return view;
}
