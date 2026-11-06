import { numeric, resolveDashboardConfig } from "./home-view";
import { locale } from "./i18n";
import { airLevel, buildRoomLighting, type RoomLighting } from "./room-lighting";
import { resolveRoomSensors } from "./room-sensors";
import type { DashboardConfig, HassLike, RoomConfig } from "./types";

export interface RoomCard {
  id: string;
  name: string;
  icon: string | null;
  lighting: RoomLighting | null;
  temperature: string | null;
  humidity: string | null;
  co2: { value: string; ppm: number; level: "good" | "fair" | "poor" } | null;
}

/** Whether automatic Home selection shows the room: it has lights or climate. */
export function hasHomeContent(room: RoomCard) {
  return !!room.lighting || room.temperature !== null || room.co2 !== null;
}

export function buildRoomCard(
  hass: HassLike,
  room: RoomConfig,
  controllers: ReadonlySet<string>,
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
  };
}

export function buildRoomCards(
  hass: HassLike,
  config: DashboardConfig,
  controllers: ReadonlySet<string>,
): RoomCard[] {
  return resolveDashboardConfig(hass, config).rooms.flatMap((room) => {
    const card = buildRoomCard(hass, room, controllers);
    return card ? [card] : [];
  });
}
