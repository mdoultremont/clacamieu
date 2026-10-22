import { numeric } from "./home-view";
import { locale, messages, translatedState } from "./i18n";
import type {
  DashboardConfig,
  HassEntity,
  HassLike,
  ServiceAction,
} from "./types";

export type ServiceCatalog = Record<string, Record<string, unknown>>;
export interface VacuumView {
  id: string;
  name: string;
  state: string;
  battery: string | null;
  currentRoom: string | null;
  available: boolean;
  actions: Extract<ServiceAction, { domain: "vacuum" }>[];
  camera: { id: string; picture: string | null } | null;
  rooms: { id: number; name: string; action: ServiceAction }[];
  consumables: { id: string; name: string; value: string; low: boolean }[];
  statistics: { id: string; name: string; value: string }[];
}

export function buildVacuumView(
  hass: HassLike,
  config: DashboardConfig,
  services: ServiceCatalog = {},
): VacuumView | null {
  const configured = config.home_cards?.find(
    (card) => card.type === "vacuum" && !card.hidden,
  );
  const vacuum =
    configured && "entity_id" in configured
      ? hass.states[configured.entity_id]
      : Object.values(hass.states).find(
          (entity) =>
            entity.entity_id.startsWith("vacuum.") &&
            !hass.entities[entity.entity_id]?.hidden,
        );
  if (!vacuum) return null;
  const t = messages(hass.language);
  const number = new Intl.NumberFormat(locale(hass.language), {
    maximumFractionDigits: 1,
  });
  const deviceId = hass.entities[vacuum.entity_id]?.device_id;
  const siblings = deviceId
    ? Object.values(hass.states).filter(
        (entity) =>
          hass.entities[entity.entity_id]?.device_id === deviceId &&
          !hass.entities[entity.entity_id]?.hidden,
      )
    : [];
  const sensors = siblings.filter((entity) =>
    entity.entity_id.startsWith("sensor."),
  );
  const sensor = (key: string) =>
    sensors.find((entity) => entity.entity_id.endsWith(`_${key}`));
  const value = (entity: HassEntity) => {
    const n = numeric(entity.state);
    return n === null
      ? null
      : `${number.format(n)}${entity.attributes.unit_of_measurement ? ` ${entity.attributes.unit_of_measurement}` : ""}`;
  };
  const attributes = vacuum.attributes;
  const features = numeric(attributes.supported_features) ?? 0;
  const controls = [
    { bit: 8192, service: "start", label: t.start },
    { bit: 4, service: "pause", label: t.pause },
    { bit: 16, service: "return_to_base", label: t.returnToBase },
    { bit: 512, service: "locate", label: t.locate },
  ] as const;
  const actions: VacuumView["actions"] = controls
    .filter(({ bit }) => (features & bit) !== 0)
    .map(({ service, label }) => ({
      domain: "vacuum",
      service,
      label,
      entityId: vacuum.entity_id,
    }));
  const rawRooms: unknown = attributes.rooms;
  const mapRooms: unknown =
    rawRooms &&
    typeof rawRooms === "object" &&
    !Array.isArray(rawRooms) &&
    typeof attributes.selected_map === "string"
      ? (rawRooms as Record<string, unknown>)[attributes.selected_map]
      : Array.isArray(rawRooms)
        ? rawRooms
        : [];
  const rooms: { id: number; name: string }[] = Array.isArray(mapRooms)
    ? mapRooms.flatMap((room: unknown) => {
        if (!room || typeof room !== "object") return [];
        const { id, name } = room as Record<string, unknown>;
        return typeof id === "number" &&
          Number.isInteger(id) &&
          id > 0 &&
          typeof name === "string"
          ? [{ id, name }]
          : [];
      })
    : [];
  const camera = siblings.find((entity) =>
    entity.entity_id.startsWith("camera."),
  );
  const battery = numeric(
    attributes.battery ??
      attributes.battery_level ??
      sensor("battery_level")?.state,
  );
  const room = sensor("current_room");
  const currentRoom =
    room && !["unknown", "unavailable"].includes(room.state)
      ? room.state
      : typeof attributes.current_room === "string"
        ? attributes.current_room
        : (rooms.find(({ id }) => id === attributes.current_segment)?.name ??
          null);
  const vacuumName =
    attributes.friendly_name ??
    hass.entities[vacuum.entity_id]?.name ??
    t.vacuumLabel;
  // The page title already names the vacuum, so its sensors drop that prefix.
  const partName = (entity: HassEntity) => {
    const name: string = entity.attributes.friendly_name ?? entity.entity_id;
    const rest = name.startsWith(`${vacuumName} `)
      ? name.slice(vacuumName.length + 1)
      : name;
    return rest.charAt(0).toLocaleUpperCase(locale(hass.language)) + rest.slice(1);
  };
  return {
    id: vacuum.entity_id,
    name: vacuumName,
    state:
      hass.formatEntityState?.(vacuum) ??
      translatedState(t.vacuum, vacuum.state),
    battery:
      battery !== null && battery >= 0 && battery <= 100
        ? t.battery(number.format(battery))
        : null,
    currentRoom,
    available: !["unknown", "unavailable"].includes(vacuum.state),
    actions,
    camera: camera
      ? {
          id: camera.entity_id,
          picture:
            typeof camera.attributes.entity_picture === "string"
              ? (hass.hassUrl?.(camera.attributes.entity_picture) ??
                camera.attributes.entity_picture)
              : null,
        }
      : null,
    rooms: services.dreame_vacuum?.vacuum_clean_segment
      ? rooms.map((room) => ({
          ...room,
          action: {
            entityId: vacuum.entity_id,
            label: t.cleanRoom(room.name),
            domain: "dreame_vacuum",
            service: "vacuum_clean_segment",
            data: { segments: [room.id] },
          },
        }))
      : [],
    consumables: sensors.flatMap((entity) => {
      const percent = numeric(entity.state);
      if (
        entity.attributes.unit_of_measurement !== "%" ||
        !/_(?:main_brush|side_brush|filter|mop_pad|mop|sensor_dirty|wheel_dirty|scale_inhibitor)_left$/.test(
          entity.entity_id,
        ) ||
        percent === null ||
        percent < 0 ||
        percent > 100
      )
        return [];
      return [
        {
          id: entity.entity_id,
          name: partName(entity),
          value: `${number.format(percent)} %`,
          low: percent < 10,
        },
      ];
    }),
    statistics: [
      "total_cleaned_area",
      "cleaning_count",
      "total_cleaning_time",
    ].flatMap((key) => {
      const entity = sensor(key);
      const formatted = entity ? value(entity) : null;
      return entity && formatted !== null
        ? [
            {
              id: entity.entity_id,
              name: partName(entity),
              value: formatted,
            },
          ]
        : [];
    }),
  };
}
