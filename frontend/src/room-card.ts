import { numeric, plugReadings, resolveDashboardConfig } from "./home-view";
import { locale, messages } from "./i18n";
import { formatEnergy, formatWatts } from "./plug-power-view";
import { airLevel, buildRoomLighting, type RoomLighting } from "./room-lighting";
import { areaSensor, entityArea, resolveRoomSensors } from "./room-sensors";
import type {
  DashboardConfig,
  HassLike,
  PlugReading,
  RoomConfig,
} from "./types";

export interface RoomCard {
  id: string;
  name: string;
  icon: string | null;
  lighting: RoomLighting | null;
  temperature: string | null;
  humidity: string | null;
  co2: { value: string; ppm: number; level: "good" | "fair" | "poor" } | null;
  pm25: string | null;
  /** Whether the room has any visible light. */
  hasLights: boolean;
  lightsOn: number;
  plugs: PlugReading[];
}

export type RoomFooterKind =
  | "humidity"
  | "co2"
  | "pm25"
  | "power"
  | "lights"
  | "lightsOff"
  | "noSensors";

export interface RoomFooterItem {
  kind: RoomFooterKind;
  text: string;
  alert: boolean;
}

/** Whether automatic Home selection shows the room: it has lights or climate. */
export function hasHomeContent(room: RoomCard) {
  return !!room.lighting || room.temperature !== null || room.co2 !== null;
}

/**
 * The tray line under a room tile, in display order. The component drops
 * items from the end when they do not fit, keeping alerts first.
 */
export function buildRoomFooter(
  room: RoomCard,
  today: Record<string, number | null> | null,
  language: string,
): RoomFooterItem[] {
  const t = messages(language);
  const items: RoomFooterItem[] = [];
  const add = (kind: RoomFooterKind, text: string, alert = false) =>
    items.push({ kind, text, alert });
  if (room.humidity !== null) add("humidity", `${room.humidity} %`);
  if (room.co2)
    add("co2", `${room.co2.value} ppm`, room.co2.level === "poor");
  if (room.pm25 !== null) add("pm25", `${room.pm25} µg/m³`);
  if (room.plugs.length) {
    const watts = sum(room.plugs.map((plug) => plug.watts));
    const kwh = sum(
      room.plugs.map((plug) =>
        plug.energyId && today ? (today[plug.energyId] ?? null) : null,
      ),
    );
    const text = [
      watts === null ? null : formatWatts(watts, language),
      kwh === null ? null : formatEnergy(kwh, language),
    ]
      .filter((part) => part !== null)
      .join(" · ");
    if (text) add("power", text);
  }
  if (room.lightsOn) add("lights", t.roomLightsOn(room.lightsOn));
  if (!items.length && room.hasLights) add("lightsOff", t.roomLightsOff);
  if (!items.length && room.temperature === null && !room.hasLights)
    add("noSensors", t.noSensors);
  return items;
}

function sum(values: (number | null)[]) {
  const known = values.filter((value): value is number => value !== null);
  return known.length ? known.reduce((total, value) => total + value) : null;
}

function buildRoomCard(
  hass: HassLike,
  room: RoomConfig,
  controllers: ReadonlySet<string>,
  plugs: PlugReading[],
): RoomCard | null {
  const area = hass.areas[room.area_id];
  if (!area) return null;
  const format = (value: number | null, digits = 0) =>
    value === null
      ? null
      : new Intl.NumberFormat(locale(hass.language), {
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        }).format(value);
  const [temperature, humidity, co2] = resolveRoomSensors(hass, room).map(
    ({ entity }) => numeric(entity?.state),
  );
  const level = airLevel(co2);
  const lights = Object.values(hass.states).filter(
    (entity) =>
      entity.entity_id.startsWith("light.") &&
      !hass.entities[entity.entity_id]?.hidden &&
      !hass.entities[entity.entity_id]?.entity_category &&
      entityArea(hass, entity.entity_id) === area.area_id,
  );
  const lit = lights.filter((entity) => entity.state === "on");
  const litMembers = lit.filter(
    (entity) => !Array.isArray(entity.attributes.entity_id),
  ).length;
  return {
    id: area.area_id,
    name: area.name,
    icon: area.icon,
    lighting: buildRoomLighting(hass, area.area_id, controllers),
    temperature: format(temperature, 1),
    humidity: format(humidity),
    co2:
      co2 === null || level === null
        ? null
        : { value: format(co2)!, ppm: co2, level },
    pm25: format(numeric(areaSensor(hass, area.area_id, "pm25")?.state)),
    hasLights: lights.length > 0,
    // A group whose members sit in other areas is the only sign this room is lit.
    lightsOn: litMembers || lit.length,
    plugs: plugs.filter(
      (plug) => hass.devices[plug.id]?.area_id === area.area_id,
    ),
  };
}

export function buildRoomCards(
  hass: HassLike,
  config: DashboardConfig,
  controllers: ReadonlySet<string>,
): RoomCard[] {
  const plugs = plugReadings(hass);
  return resolveDashboardConfig(hass, config).rooms.flatMap((room) => {
    const card = buildRoomCard(hass, room, controllers, plugs);
    return card ? [card] : [];
  });
}
