import { buildDeviceHealth } from "./device-health";
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
  const areaName = (areaId: string | null) =>
    areaId ? (hass.areas[areaId]?.name ?? null) : null;
  const health = buildDeviceHealth(hass);
  for (const battery of health.batteries) {
    if (battery.level >= 40) continue;
    view.batteries.push({
      id: battery.entityId,
      name: battery.name,
      area: areaName(battery.areaId),
      level: battery.level,
      value: `${number.format(battery.level)} %`,
    });
  }
  for (const entity of Object.values(hass.states)) {
    const entry = hass.entities[entity.entity_id];
    if (entry?.hidden || !entity.entity_id.startsWith("update.")) continue;
    if (entity.state !== "on") continue;
    view.updates.push({
      id: entity.entity_id,
      name: entity.attributes.friendly_name ?? entry?.name ?? entity.entity_id,
      area: areaName(entityArea(hass, entity.entity_id) ?? null),
      installed: entity.attributes.installed_version ?? t.unknownVersion,
      latest: entity.attributes.latest_version ?? t.unknownVersion,
    });
  }
  for (const device of health.offline) {
    const { changed } = device;
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
    view.unavailable.push({
      id: device.entityId,
      name: device.name,
      area: areaName(device.areaId),
      since,
      entities: device.entities,
    });
  }
  view.unavailable.sort(
    (a, b) => b.entities - a.entities || a.name.localeCompare(b.name, language),
  );
  view.batteries.sort((a, b) => a.level - b.level);
  return view;
}
