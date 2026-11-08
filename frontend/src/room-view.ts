import { formatClimate, roomPerception } from "./comfort-view";
import { numeric, plugReadings } from "./home-view";
import { cycleTracker, type CycleTracker } from "./cycle-view";
import { locale, messages } from "./i18n";
import { displayOptions, type EntityDisplay } from "./room-display";
import { airLevel } from "./room-lighting";
import { areaSensor, entityArea, resolveRoomSensors } from "./room-sensors";
import type {
  DashboardConfig,
  HassEntity,
  HassLike,
  PlugReading,
  ServiceAction,
} from "./types";

export interface RoomEntity {
  id: string;
  name: string;
  /** Home Assistant's name, which a saved Maison name replaces. */
  defaultName: string;
  state: string;
  on: boolean;
  available: boolean;
}
/** An element whose order and display an admin chooses per room. */
export interface RoomElement extends RoomEntity {
  display: EntityDisplay;
}
export interface RoomLight extends RoomElement {
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
export interface RoomDevice extends RoomElement {
  domain: DeviceDomain;
  /** The smart plug reading of a switch whose device measures power. */
  power: PlugReading | null;
  /** The device that recognizes the plugged appliance's cycles. */
  tracker: CycleTracker | null;
  /** Cover position from 0 (closed) to 100 (open). */
  position: number | null;
  actions: ServiceAction[];
}

/** Whether an "on" state is worth surfacing, by binary sensor class. */
const activeWhenOn = {
  door: true,
  window: true,
  garage_door: true,
  moisture: true,
  motion: false,
  occupancy: false,
} as const;
export type SensorClass = keyof typeof activeWhenOn;
export interface RoomSensor extends RoomElement {
  deviceClass: SensorClass;
  active: boolean;
  /** A leak: active and a problem. */
  alert: boolean;
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
  /** The room's comfort in words, such as "Comfortable". */
  comfort: string | null;
  /** The weather entity's temperature, such as "8,2°C". */
  outdoor: string | null;
  /** Lights, devices, and sensors list every element in saved order, hidden ones included. */
  lights: RoomLight[];
  scenes: RoomEntity[];
  devices: RoomDevice[];
  sensors: RoomSensor[];
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
  const roomConfig = config.rooms?.find((room) => room.area_id === areaId) ?? {
    area_id: areaId,
  };
  const saved = roomConfig.entities ?? [];
  const savedNames = new Map(
    saved.flatMap((entry) => (entry.name ? [[entry.entity_id, entry.name]] : [])),
  );
  const entityView = (entity: HassEntity): RoomEntity => {
    const defaultName =
      entity.attributes.friendly_name ??
      hass.entities[entity.entity_id]?.name ??
      entity.entity_id;
    return {
    id: entity.entity_id,
    name: savedNames.get(entity.entity_id) ?? defaultName,
    defaultName,
    state:
      hass.formatEntityState?.(entity) ?? fallbackState(entity, hass.language),
    on: !["off", "unavailable", "unknown", "standby"].includes(entity.state),
    available: !["unavailable", "unknown"].includes(entity.state),
    };
  };
  const position = new Map(saved.map((entry, index) => [entry.entity_id, index]));
  const savedDisplay = new Map(
    saved.map((entry) => [entry.entity_id, entry.display]),
  );
  const inSavedOrder = <T extends RoomElement>(elements: T[]) =>
    elements.sort(
      (a, b) =>
        (position.get(a.id) ?? saved.length) -
        (position.get(b.id) ?? saved.length),
    );
  const display = (id: string, power?: PlugReading | null) => {
    const chosen = savedDisplay.get(id);
    return chosen && displayOptions({ power }).includes(chosen)
      ? chosen
      : "control";
  };
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
  const plugs = entities.some((entity) => entity.entity_id.startsWith("switch."))
    ? new Map(plugReadings(hass).map((plug) => [plug.id, plug]))
    : new Map<string, PlugReading>();
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
  const weather = Object.values(hass.states).find((entity) =>
    entity.entity_id.startsWith("weather."),
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
    comfort: climate.length
      ? roomPerception(
          hass,
          areaId,
          climate.find((sensor) => sensor.label === "humidity")?.raw ?? null,
        )
      : null,
    outdoor: formatClimate(
      numeric(weather?.attributes.temperature),
      hass.language,
      weather?.attributes.temperature_unit ?? "°C",
    ),
    lights: inSavedOrder(
      orderedLights.map((entity) => {
        const brightness = numeric(entity.attributes.brightness);
        return {
          ...entityView(entity),
          display: display(entity.entity_id),
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
    ),
    scenes: entities
      .filter((entity) => entity.entity_id.startsWith("scene."))
      .map(entityView),
    devices: inSavedOrder(
      entities.flatMap((entity): RoomDevice[] => {
        const domain = entity.entity_id.split(".")[0] as DeviceDomain;
        if (!deviceDomains.includes(domain)) return [];
        const view = entityView(entity);
        const cover = domain === "cover";
        const deviceId = hass.entities[entity.entity_id]?.device_id;
        const power =
          (domain === "switch" && deviceId && plugs.get(deviceId)) || null;
        const shown = display(view.id, power);
        return [
          {
            ...view,
            display: shown,
            domain,
            power,
            tracker:
              power && shown === "cycle"
                ? cycleTracker(hass, areaId, [view.defaultName, power.name])
                : null,
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
    ),
    sensors: inSavedOrder(
      entities.flatMap((entity): RoomSensor[] => {
        const deviceClass = entity.attributes.device_class as SensorClass;
        if (
          !entity.entity_id.startsWith("binary_sensor.") ||
          !Object.hasOwn(activeWhenOn, deviceClass)
        )
          return [];
        const active = activeWhenOn[deviceClass] && entity.state === "on";
        return [
          {
            ...entityView(entity),
            display: display(entity.entity_id),
            deviceClass,
            active,
            alert: active && deviceClass === "moisture",
          },
        ];
      }),
    ),
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
