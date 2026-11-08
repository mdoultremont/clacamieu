import { numeric } from "./home-view";
import { locale, messages } from "./i18n";
import { airLevel } from "./room-lighting";
import { areaSensor, entityArea, resolveRoomSensors } from "./room-sensors";
import { relativeTime } from "./security-view";
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
export type ClimateLabel = "temperature" | "humidity" | "co2" | "pm25";

const deviceDomains = [
  "switch",
  "fan",
  "cover",
  "media_player",
  "input_boolean",
] as const;
export type DeviceDomain = (typeof deviceDomains)[number];
export interface RoomDevice extends RoomEntity {
  domain: DeviceDomain;
  /** Cover position from 0 (closed) to 100 (open). */
  position: number | null;
  actions: ServiceAction[];
}

/** Whether an "on" state is worth surfacing, by binary sensor class. */
const alertWhenOn = {
  door: true,
  window: true,
  garage_door: true,
  moisture: true,
  motion: false,
  occupancy: false,
} as const;
export type SensorClass = keyof typeof alertWhenOn;
export interface RoomSensor extends RoomEntity {
  deviceClass: SensorClass;
  alert: boolean;
  /** When the state last changed, relative to now. */
  changed: string | null;
}

export interface RoomView {
  id: string;
  name: string;
  lightsOn: number;
  climate: {
    label: ClimateLabel;
    entityId: string;
    value: string;
    raw: number;
    unit: string;
  }[];
  air: "good" | "fair" | "poor" | null;
  lights: RoomLight[];
  scenes: RoomEntity[];
  devices: RoomDevice[];
  sensors: RoomSensor[];
}

export function buildRoomView(
  hass: HassLike,
  config: DashboardConfig,
  areaId: string,
  now: Date,
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
  const [temperature, humidity, co2] = resolveRoomSensors(hass, roomConfig);
  const climate = [
    temperature,
    humidity,
    { label: "pm25" as const, entity: areaSensor(hass, areaId, "pm25") },
    co2,
  ].flatMap(
    ({ label, entity }) => {
      const value = numeric(entity?.state);
      if (value === null || !entity) return [];
      if (label === "co2") air = airLevel(value);
      return [
        {
          label,
          entityId: entity.entity_id,
          raw: value,
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
                : label === "pm25"
                  ? "µg/m³"
                  : "ppm"),
        },
      ];
    },
  );
  const lit = lights.filter((entity) => entity.state === "on");
  const litMembers = lit.filter(
    (entity) => !Array.isArray(entity.attributes.entity_id),
  ).length;
  return {
    id: areaId,
    name: area.name,
    // A group whose members sit in other areas is the only sign this room is lit.
    lightsOn: litMembers || lit.length,
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
    devices: entities.flatMap((entity): RoomDevice[] => {
      const domain = entity.entity_id.split(".")[0] as DeviceDomain;
      if (!deviceDomains.includes(domain)) return [];
      const view = entityView(entity);
      const cover = domain === "cover";
      return [
        {
          ...view,
          domain,
          position: cover ? numeric(entity.attributes.current_position) : null,
          actions: cover
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
        },
      ];
    }),
    sensors: entities.flatMap((entity): RoomSensor[] => {
      const deviceClass = entity.attributes.device_class as SensorClass;
      if (
        !entity.entity_id.startsWith("binary_sensor.") ||
        !Object.hasOwn(alertWhenOn, deviceClass)
      )
        return [];
      const changed = Date.parse(entity.last_changed);
      return [
        {
          ...entityView(entity),
          deviceClass,
          alert: alertWhenOn[deviceClass] && entity.state === "on",
          changed: Number.isFinite(changed)
            ? relativeTime(changed, now, language)
            : null,
        },
      ];
    }),
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
