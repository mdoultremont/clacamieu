import type { AreaEntry, HassLike, RoomConfig } from "./types";

export const climateSensors = [
  {
    key: "temperature_entity_id",
    deviceClass: "temperature",
    label: "temperature",
  },
  { key: "humidity_entity_id", deviceClass: "humidity", label: "humidity" },
  { key: "co2_entity_id", deviceClass: "carbon_dioxide", label: "co2" },
] as const;

export function entityArea(
  hass: HassLike,
  id: string,
): string | null | undefined {
  const entry = hass.entities[id];
  return (
    entry?.area_id ??
    (entry?.device_id ? hass.devices[entry.device_id]?.area_id : null)
  );
}

// thermal_comfort and similar integrations publish derived values with the
// temperature device class; they are not the room's temperature.
const derivedTemperature =
  /_(dew_?point|frost_?point|frost_?risk|heat_?index|humidex|apparent_temperature|feels_like|simmer|thom|thi)(_|$)/;

export function resolveRoomSensors(hass: HassLike, room: RoomConfig) {
  const area = hass.areas[room.area_id];
  return climateSensors.map(({ key, deviceClass, label }) => {
    const override =
      room[key] ?? (key === "co2_entity_id" ? null : area?.[key]);
    const entity = override
      ? hass.states[override]
      : Object.values(hass.states).find(
          (entity) =>
            entity.entity_id.startsWith("sensor.") &&
            entity.attributes.device_class === deviceClass &&
            !(
              deviceClass === "temperature" &&
              derivedTemperature.test(entity.entity_id)
            ) &&
            entityArea(hass, entity.entity_id) === room.area_id &&
            !hass.entities[entity.entity_id]?.hidden &&
            !hass.entities[entity.entity_id]?.entity_category,
        );
    return { key, deviceClass, label, entity };
  });
}

const outdoorNames = new Set([
  "jardin",
  "terrasse",
  "exterieur",
  "balcon",
  "cour",
  "garden",
  "terrace",
  "outdoor",
  "outside",
  "balcony",
  "yard",
  "patio",
]);

// Only an exact area or floor name counts, so "Jardin d'hiver" or a "Rez-de-jardin" floor stay indoors.
export function isOutdoorArea(
  area: AreaEntry,
  floors: HassLike["floors"],
): boolean {
  const floor = area.floor_id ? floors?.[area.floor_id]?.name : undefined;
  return [area.name, floor].some(
    (name) =>
      name !== undefined &&
      outdoorNames.has(
        name
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim()
          .toLowerCase(),
      ),
  );
}
