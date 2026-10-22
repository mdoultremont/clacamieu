import { numeric, resolveDashboardConfig } from "./home-view";
import { locale, messages } from "./i18n";
import { entityArea, isOutdoorArea, resolveRoomSensors } from "./room-sensors";
import type { DashboardConfig, HassLike } from "./types";

export type ComfortFilter = "all" | "co2" | "humidity" | "dewPoint";
export interface ComfortRoom {
  id: string;
  name: string;
  temperature: number | null;
  temperatureUnit: string;
  humidity: number | null;
  co2: number | null;
  dewPoint: number | null;
  dewPointUnit: string;
  perception: string | null;
  problems: string[];
}
export interface ComfortView {
  temperature: string | null;
  humidity: string | null;
  rooms: ComfortRoom[];
}

export function formatClimate(
  value: number | null,
  language: string,
  unit: string,
): string | null {
  if (value === null) return null;
  const temperature = unit === "°C" || unit === "°F";
  return `${new Intl.NumberFormat(locale(language), { maximumFractionDigits: temperature ? 1 : 0 }).format(value)}${temperature ? "" : " "}${unit}`;
}

export function buildComfortView(
  hass: HassLike,
  config: DashboardConfig,
): ComfortView {
  const t = messages(hass.language);
  const states = Object.values(hass.states);
  const rooms = resolveDashboardConfig(hass, config).rooms.flatMap(
    (room): ComfortRoom[] => {
      const area = hass.areas[room.area_id];
      if (!area || isOutdoorArea(area, hass.floors)) return [];
      const resolved = resolveRoomSensors(hass, room);
      const [temperature, humidity, co2] = resolved.map(({ entity }) =>
        numeric(entity?.state),
      );
      if (resolved.every(({ entity }) => !entity)) return [];
      const sensors = states.filter(
        (entity) =>
          entity.entity_id.startsWith("sensor.") &&
          entityArea(hass, entity.entity_id) === room.area_id &&
          !hass.entities[entity.entity_id]?.hidden &&
          !hass.entities[entity.entity_id]?.entity_category,
      );
      const dewPoint = sensors.find((entity) =>
        /_dew_?point$/.test(entity.entity_id),
      );
      const perception = sensors.find(
        (entity) =>
          /_(?:thermal_|dew_?point_)?perception$/.test(entity.entity_id) &&
          !["unknown", "unavailable"].includes(entity.state),
      );
      const humidityLabel =
        humidity === null
          ? null
          : humidity < 40
            ? t.comfortPerception.dry
            : humidity <= 60
              ? t.comfortPerception.comfortable
              : humidity <= 70
                ? t.comfortPerception.humid
                : t.comfortPerception.veryHumid;
      return [
        {
          id: room.area_id,
          name: area.name,
          temperature,
          humidity,
          co2,
          temperatureUnit:
            resolved[0].entity?.attributes.unit_of_measurement ?? "°C",
          dewPoint: numeric(dewPoint?.state),
          dewPointUnit: dewPoint?.attributes.unit_of_measurement ?? "°C",
          perception: perception
            ? (hass.formatEntityState?.(perception) ??
              t.comfortPerception[
                perception.state as keyof typeof t.comfortPerception
              ] ??
              humidityLabel)
            : humidityLabel,
          problems: [
            ...(humidity !== null && humidity > 70 ? [t.highHumidity] : []),
            ...(co2 !== null && co2 > 1200 ? [t.highCo2] : []),
          ],
        },
      ];
    },
  );
  const average = (key: "temperature" | "humidity") => {
    const values = rooms.flatMap((room) =>
      room[key] === null ? [] : [room[key]],
    );
    return values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
  };
  const temperatureUnit =
    rooms.find((room) => room.temperature !== null)?.temperatureUnit ?? "°C";
  return {
    temperature: formatClimate(
      average("temperature"),
      hass.language,
      temperatureUnit,
    ),
    humidity: formatClimate(average("humidity"), hass.language, "%"),
    rooms,
  };
}

export function sortComfortRooms(
  rooms: ComfortRoom[],
  filter: ComfortFilter,
): ComfortRoom[] {
  const score = (room: ComfortRoom) => {
    if (filter === "all")
      return Math.max((room.humidity ?? 0) / 70, (room.co2 ?? 0) / 1200);
    return room[filter] ?? -Infinity;
  };
  return [...rooms].sort((a, b) => score(b) - score(a));
}
