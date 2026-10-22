import { numeric } from "./home-view";
import { formatClimate } from "./comfort-view";
import { locale, messages, translatedState } from "./i18n";
import { entityArea, isOutdoorArea, resolveRoomSensors } from "./room-sensors";
import type {
  HassEntity,
  HassLike,
  ServiceAction,
} from "./types";

export interface GardenView {
  weather: {
    id: string;
    temperature: string | null;
    humidity: string | null;
    condition: string;
    state: string;
    unit: string;
    daily: boolean;
  } | null;
  areas: { id: string; name: string; climate: string[] }[];
  valves: {
    id: string;
    name: string;
    state: string;
    available: boolean;
    actions: ServiceAction[];
  }[];
}

export function buildGardenView(hass: HassLike): GardenView {
  const t = messages(hass.language);
  const states = Object.values(hass.states);
  const weather = states.find(
    (entity) =>
      entity.entity_id.startsWith("weather.") &&
      !hass.entities[entity.entity_id]?.hidden,
  );
  const unit = weather?.attributes.temperature_unit ?? "°C";
  return {
    weather: weather
      ? {
          id: weather.entity_id,
          temperature: formatClimate(
            numeric(weather.attributes.temperature),
            hass.language,
            unit,
          ),
          humidity: formatClimate(
            numeric(weather.attributes.humidity),
            hass.language,
            "%",
          ),
          condition: translatedState(t.weather, weather.state),
          state: weather.state,
          unit,
          daily: Boolean(
            (numeric(weather.attributes.supported_features) ?? 0) & 1,
          ),
        }
      : null,
    areas: Object.values(hass.areas)
      .filter((area) => isOutdoorArea(area, hass.floors))
      .flatMap((area) => {
        const climate = resolveRoomSensors(hass, {
          area_id: area.area_id,
        }).flatMap(({ label, entity }) => {
          const value = formatClimate(
            numeric(entity?.state),
            hass.language,
            entity?.attributes.unit_of_measurement ??
              (label === "temperature"
                ? "°C"
                : label === "humidity"
                  ? "%"
                  : "ppm"),
          );
          return value ? [`${t[label]} ${value}`] : [];
        });
        return climate.length
          ? [{ id: area.area_id, name: area.name, climate }]
          : [];
      }),
    valves: [
      ...states
      .filter(
        (entity) =>
          entity.entity_id.startsWith("valve.") &&
          !hass.entities[entity.entity_id]?.hidden,
      )
      .map((entity) => {
        const name =
          entity.attributes.friendly_name ??
          hass.entities[entity.entity_id]?.name ??
          entity.entity_id;
        const features = numeric(entity.attributes.supported_features) ?? 0;
        const area = hass.areas[entityArea(hass, entity.entity_id) ?? ""]?.name;
        return {
          id: entity.entity_id,
          name,
          state: [
            hass.formatEntityState?.(entity) ??
              t.valveStates[entity.state as keyof typeof t.valveStates] ??
              t.unavailable,
            area,
          ]
            .filter(Boolean)
            .join(" · "),
          available: !["unknown", "unavailable"].includes(entity.state),
          actions: [
            ...(features & 1
              ? [
                  {
                    domain: "valve" as const,
                    service: "open_valve" as const,
                    entityId: entity.entity_id,
                    label: t.openCover(name),
                  },
                ]
              : []),
            ...(features & 2
              ? [
                  {
                    domain: "valve" as const,
                    service: "close_valve" as const,
                    entityId: entity.entity_id,
                    label: t.closeCover(name),
                  },
                ]
              : []),
          ],
        };
      }),
      ...irrigationOutlets(hass, states, t),
    ],
  };
}

// Irrigation controllers such as Zigbee water valves expose each outlet as a switch,
// and close it themselves after the duration set on the device.
function irrigationOutlets(
  hass: HassLike,
  states: HassEntity[],
  t: ReturnType<typeof messages>,
): GardenView["valves"] {
  const durations = new Map<string, HassEntity>();
  for (const entity of states) {
    const device = hass.entities[entity.entity_id]?.device_id;
    if (device && /^number\..*irrigation_duration$/.test(entity.entity_id))
      durations.set(device, entity);
  }
  return states.flatMap((entity) => {
    const entry = hass.entities[entity.entity_id];
    const duration = entry?.device_id ? durations.get(entry.device_id) : undefined;
    if (
      !duration ||
      !entity.entity_id.startsWith("switch.") ||
      entry?.hidden ||
      entry?.entity_category
    )
      return [];
    const name =
      entity.attributes.friendly_name ?? entry?.name ?? entity.entity_id;
    const minutes = numeric(duration.state);
    const area = hass.areas[entityArea(hass, entity.entity_id) ?? ""]?.name;
    return [
      {
        id: entity.entity_id,
        name,
        state: [
          entity.state === "on"
            ? t.valveStates.open
            : entity.state === "off"
              ? t.valveStates.closed
              : t.unavailable,
          minutes === null
            ? null
            : t.irrigationAutoStop(
                `${minutes} ${duration.attributes.unit_of_measurement ?? "min"}`,
              ),
          area,
        ]
          .filter(Boolean)
          .join(" · "),
        available: ["on", "off"].includes(entity.state),
        actions: [
          {
            domain: "switch" as const,
            service: "turn_on" as const,
            entityId: entity.entity_id,
            label: t.openCover(name),
          },
          {
            domain: "switch" as const,
            service: "turn_off" as const,
            entityId: entity.entity_id,
            label: t.closeCover(name),
          },
        ],
      },
    ];
  });
}

export interface ForecastDay {
  date: string;
  day: string;
  condition: string;
  state: string;
  high: string | null;
  low: string | null;
}

export function buildForecastView(
  value: unknown,
  language: string,
  unit: string,
): ForecastDay[] {
  if (
    !value ||
    typeof value !== "object" ||
    !("forecast" in value) ||
    !Array.isArray(value.forecast)
  )
    return [];
  return value.forecast
    .flatMap((entry): ForecastDay[] => {
      if (
        !entry ||
        typeof entry !== "object" ||
        typeof entry.datetime !== "string" ||
        !Number.isFinite(Date.parse(entry.datetime))
      )
        return [];
      const state =
        typeof entry.condition === "string" ? entry.condition : "unknown";
      return [
        {
          date: entry.datetime,
          day: new Intl.DateTimeFormat(locale(language), {
            weekday: "short",
          }).format(new Date(entry.datetime)),
          condition: translatedState(messages(language).weather, state),
          state,
          high: formatClimate(numeric(entry.temperature), language, unit),
          low: formatClimate(numeric(entry.templow), language, unit),
        },
      ];
    })
    .slice(0, 5);
}
