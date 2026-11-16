import { roomPerception } from "./comfort-view";
import { areaHealth, buildDeviceHealth, type DeviceHealth } from "./device-health";
import { numeric, plugReadings, resolveDashboardConfig } from "./home-view";
import { locale, messages } from "./i18n";
import { formatEnergy, formatWatts } from "./plug-power-view";
import { airLevel, buildRoomLighting, type RoomLighting } from "./room-lighting";
import {
  areaSensor,
  entityArea,
  isOutdoorArea,
  resolveRoomSensors,
} from "./room-sensors";
import type {
  DashboardConfig,
  HassLike,
  PlugReading,
  RoomCardSize,
  RoomConfig,
} from "./types";

export interface RoomCard {
  id: string;
  name: string;
  icon: string | null;
  lighting: RoomLighting | null;
  size: RoomCardSize;
  temperature: string | null;
  humidity: string | null;
  co2: { value: string; ppm: number; level: "good" | "fair" | "poor" } | null;
  /** Fair or poor air first, otherwise the room's comfort perception. */
  status: { text: string; level: "fair" | "poor" | null } | null;
  pm25: string | null;
  /** Whether the room has any visible light. */
  hasLights: boolean;
  lightsOn: number;
  plugs: PlugReading[];
  /** Devices in the room with no responding entity. */
  offline: number;
  /** The room's lowest battery, only when it runs low. */
  battery: { level: number; value: string } | null;
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

const largeCardFooterKinds: ReadonlySet<RoomFooterKind> = new Set([
  "humidity",
  "pm25",
  "power",
  "lights",
]);

/** The large card's tray line: every reading the card itself does not show, in display order. */
export function buildLargeCardFooter(
  room: RoomCard,
  today: Record<string, number | null> | null,
  language: string,
): RoomFooterItem[] {
  return buildRoomFooter(room, today, language).filter((item) =>
    largeCardFooterKinds.has(item.kind),
  );
}

/** Whether the room's tray line carries an offline or low battery mark. */
export function hasDeviceMarks(room: RoomCard) {
  return room.offline > 0 || room.battery !== null;
}

/**
 * The saved size, or Large for an indoor room with a temperature reading.
 * The default follows the live reading, so a room whose sensor drops out
 * shows as Small until it reports again.
 */
export function roomCardSize(
  hass: HassLike,
  room: RoomConfig,
  temperature = numeric(resolveRoomSensors(hass, room)[0].entity?.state),
): RoomCardSize {
  if (room.size) return room.size;
  const area = hass.areas[room.area_id];
  return temperature !== null && area && !isOutdoorArea(area, hass.floors)
    ? "large"
    : "small";
}

function perceptionStatus(text: string | null): RoomCard["status"] {
  return text === null ? null : { text, level: null };
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
  health: DeviceHealth,
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
  const t = messages(hass.language);
  const { offline, lowestBattery } = areaHealth(health, area.area_id);
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
    size: roomCardSize(hass, room, temperature),
    temperature: format(temperature, 1),
    humidity: format(humidity),
    co2:
      co2 === null || level === null
        ? null
        : { value: format(co2)!, ppm: co2, level },
    status:
      level === "fair" || level === "poor"
        ? { text: t.airQuality[level], level }
        : perceptionStatus(roomPerception(hass, area.area_id, humidity)),
    pm25: format(numeric(areaSensor(hass, area.area_id, "pm25")?.state)),
    hasLights: lights.length > 0,
    // A group whose members sit in other areas is the only sign this room is lit.
    lightsOn: litMembers || lit.length,
    plugs: plugs.filter(
      (plug) => hass.devices[plug.id]?.area_id === area.area_id,
    ),
    offline,
    battery:
      lowestBattery === null
        ? null
        : { level: lowestBattery, value: `${format(lowestBattery)} %` },
  };
}

export function buildRoomCards(
  hass: HassLike,
  config: DashboardConfig,
  controllers: ReadonlySet<string>,
): RoomCard[] {
  const plugs = plugReadings(hass);
  const health = buildDeviceHealth(hass);
  return resolveDashboardConfig(hass, config).rooms.flatMap((room) => {
    const card = buildRoomCard(hass, room, controllers, plugs, health);
    return card ? [card] : [];
  });
}
