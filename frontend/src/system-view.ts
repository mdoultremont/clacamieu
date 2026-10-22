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
  unavailable: (SystemEntity & { since: string })[];
  batteries: (SystemEntity & { level: number; value: string })[];
  updates: (SystemEntity & { installed: string; latest: string })[];
}

export function buildSystemView(hass: HassLike, now: Date): SystemView {
  const t = messages(hass.language);
  const language = locale(hass.language);
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 0 });
  const relative = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
  const view: SystemView = { unavailable: [], batteries: [], updates: [] };
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
      entry?.entity_category !== "diagnostic"
    ) {
      const elapsed = now.getTime() - Date.parse(entity.last_changed);
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
      view.unavailable.push({ ...base, since });
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
  view.batteries.sort((a, b) => a.level - b.level);
  return view;
}
