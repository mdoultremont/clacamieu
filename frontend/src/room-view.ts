import { numeric, resolveDashboardConfig } from "./home-view";
import { locale, messages } from "./i18n";
import { entityArea, resolveRoomSensors } from "./room-sensors";
import type {
  DashboardConfig,
  HassEntity,
  HassLike,
  ServiceAction,
} from "./types";

export interface RoomEntity {
  id: string;
  name: string;
  state: string;
  on: boolean;
  available: boolean;
}
export interface RoomLight extends RoomEntity {
  brightness: number | null;
  dimmable: boolean;
  group: boolean;
}
export interface RoomView {
  id: string;
  name: string;
  lightsOn: number;
  climate: {
    label: "temperature" | "humidity" | "co2";
    value: string;
    unit: string;
  }[];
  air: "good" | "fair" | "poor" | null;
  lights: RoomLight[];
  scenes: RoomEntity[];
  devices: (RoomEntity & { actions: ServiceAction[] })[];
  sensors: RoomEntity[];
}

export function buildRoomsView(
  hass: HassLike,
  config: DashboardConfig,
): RoomView[] {
  return resolveDashboardConfig(hass, config).rooms.flatMap(({ area_id }) => {
    const room = buildRoomView(hass, config, area_id);
    return room ? [room] : [];
  });
}

export function buildRoomView(
  hass: HassLike,
  config: DashboardConfig,
  areaId: string,
): RoomView | null {
  const area = hass.areas[areaId];
  if (!area) return null;
  const t = messages(hass.language);
  const language = locale(hass.language);
  const entities = Object.values(hass.states).filter((entity) => {
    const entry = hass.entities[entity.entity_id];
    return (
      !entry?.hidden &&
      !entry?.entity_category &&
      entityArea(hass, entity.entity_id) === areaId
    );
  });
  const entityView = (entity: HassEntity): RoomEntity => ({
    id: entity.entity_id,
    name:
      entity.attributes.friendly_name ??
      hass.entities[entity.entity_id]?.name ??
      entity.entity_id,
    state:
      hass.formatEntityState?.(entity) ?? fallbackState(entity, hass.language),
    on: !["off", "unavailable", "unknown", "standby"].includes(entity.state),
    available: !["unavailable", "unknown"].includes(entity.state),
  });
  const lights = entities.filter((entity) =>
    entity.entity_id.startsWith("light."),
  );
  const orderedLights: HassEntity[] = [];
  const seen = new Set<string>();
  const addLight = (entity: HassEntity) => {
    if (seen.has(entity.entity_id)) return;
    seen.add(entity.entity_id);
    orderedLights.push(entity);
    const members: unknown = entity.attributes.entity_id;
    if (Array.isArray(members)) {
      for (const id of members) {
        const member = lights.find((light) => light.entity_id === id);
        if (member) addLight(member);
      }
    }
  };
  lights
    .filter((entity) => Array.isArray(entity.attributes.entity_id))
    .forEach(addLight);
  lights.forEach(addLight);
  const roomConfig = config.rooms?.find((room) => room.area_id === areaId) ?? {
    area_id: areaId,
  };
  let air: RoomView["air"] = null;
  const climate = resolveRoomSensors(hass, roomConfig).flatMap(
    ({ label, entity }) => {
      const value = numeric(entity?.state);
      if (value === null) return [];
      if (label === "co2")
        air = value < 800 ? "good" : value < 1200 ? "fair" : "poor";
      return [
        {
          label,
          value: new Intl.NumberFormat(language, {
            minimumFractionDigits: label === "temperature" ? 1 : 0,
            maximumFractionDigits: label === "temperature" ? 1 : 0,
          }).format(value),
          unit:
            entity?.attributes.unit_of_measurement ??
            (label === "temperature"
              ? "°C"
              : label === "humidity"
                ? "%"
                : "ppm"),
        },
      ];
    },
  );
  return {
    id: areaId,
    name: area.name,
    lightsOn: lights.filter(
      (entity) =>
        entity.state === "on" && !Array.isArray(entity.attributes.entity_id),
    ).length,
    climate,
    air,
    lights: orderedLights.map((entity) => {
      const brightness = numeric(entity.attributes.brightness);
      return {
        ...entityView(entity),
        on: entity.state === "on",
        brightness:
          brightness === null
            ? null
            : Math.round((Math.min(255, Math.max(0, brightness)) / 255) * 100),
        dimmable:
          Array.isArray(entity.attributes.supported_color_modes) &&
          entity.attributes.supported_color_modes.some(
            (mode: string) => mode !== "onoff",
          ),
        group: Array.isArray(entity.attributes.entity_id),
      };
    }),
    scenes: entities
      .filter((entity) => entity.entity_id.startsWith("scene."))
      .map(entityView),
    devices: entities
      .filter((entity) =>
        ["switch", "fan", "cover", "media_player", "input_boolean"].includes(
          entity.entity_id.split(".")[0],
        ),
      )
      .map((entity) => {
        const view = entityView(entity);
        return {
          ...view,
          actions: entity.entity_id.startsWith("cover.")
            ? [
                {
                  domain: "cover",
                  service: "open_cover",
                  entityId: view.id,
                  label: t.openCover(view.name),
                },
                {
                  domain: "cover",
                  service: "close_cover",
                  entityId: view.id,
                  label: t.closeCover(view.name),
                },
              ]
            : [
                {
                  domain: "homeassistant",
                  service: "toggle",
                  entityId: view.id,
                  label: view.name,
                },
              ],
        };
      }),
    sensors: entities
      .filter(
        (entity) =>
          entity.entity_id.startsWith("binary_sensor.") &&
          [
            "door",
            "window",
            "garage_door",
            "moisture",
            "motion",
            "occupancy",
          ].includes(entity.attributes.device_class ?? ""),
      )
      .map(entityView),
  };
}

function fallbackState(entity: HassEntity, language: string): string {
  const t = messages(language);
  if (["unknown", "unavailable"].includes(entity.state)) return t.unavailable;
  if (["on", "off"].includes(entity.state)) {
    const active = entity.state === "on";
    switch (entity.attributes.device_class) {
      case "door":
      case "window":
      case "garage_door":
        return active ? t.sensorOpen : t.sensorClosed;
      case "moisture":
        return active ? t.sensorWet : t.sensorDry;
      case "motion":
        return active ? t.motionDetected : t.noMotion;
      case "occupancy":
        return active ? t.occupied : t.clear;
    }
    return active ? t.deviceOn : t.deviceOff;
  }
  return entity.state;
}
