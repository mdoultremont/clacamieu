import { resolveRoomSensors } from "./room-sensors";
import { locale, messages, translatedState } from "./i18n";
import type {
  DashboardConfig,
  HassEntity,
  HassLike,
  HomeView,
  HomeData,
  HomeCard,
  HomeCardView,
  RoomConfig,
} from "./types";

export function numeric(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function capitalize(text: string, language: string) {
  return text.charAt(0).toLocaleUpperCase(language) + text.slice(1);
}

export function buildHomeView(
  hass: HassLike,
  config: DashboardConfig,
  now: Date,
): HomeView {
  const t = messages(hass.language);
  const language = locale(hass.language);
  const number = (value: number, digits = 0) =>
    new Intl.NumberFormat(language, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  const states = Object.values(hass.states);
  const visible = (entity: HassEntity) =>
    !hass.entities[entity.entity_id]?.hidden &&
    !hass.entities[entity.entity_id]?.entity_category;
  const areaOf = (entity: HassEntity) => {
    const entry = hass.entities[entity.entity_id];
    return (
      entry?.area_id ??
      (entry?.device_id ? hass.devices[entry.device_id]?.area_id : null)
    );
  };
  const sensorValue = (entity: HassEntity | undefined) =>
    entity ? numeric(entity.state) : null;
  const resolved = resolveDashboardConfig(hass, config);
  const rawRooms = resolved.rooms.flatMap((room) => {
    const area = hass.areas[room.area_id];
    if (!area) return [];
    const entities = states.filter(
      (entity) => visible(entity) && areaOf(entity) === area.area_id,
    );
    const [temperature, humidity, co2] = resolveRoomSensors(hass, room).map(
      ({ entity }) => sensorValue(entity),
    );
    return [
      {
        id: area.area_id,
        name: area.name,
        temperature,
        humidity,
        co2,
        lights: entities.filter((entity) =>
          entity.entity_id.startsWith("light."),
        ),
      },
    ];
  });
  const temperatures = rawRooms.flatMap((room) =>
    room.temperature == null ? [] : [room.temperature],
  );
  const weather = states.find((entity) =>
    entity.entity_id.startsWith("weather."),
  );
  const outdoor = numeric(weather?.attributes.temperature);
  const people = states
    .filter((entity) => entity.entity_id.startsWith("person."))
    .map((entity) => ({
      id: entity.entity_id,
      name:
        entity.attributes.friendly_name ??
        hass.entities[entity.entity_id]?.name ??
        entity.entity_id,
      home: entity.state === "home",
      currentUser: entity.attributes.user_id === hass.user.id,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, language));
  const binarySensors = states.filter(
    (entity) =>
      entity.entity_id.startsWith("binary_sensor.") &&
      visible(entity) &&
      ["on", "off"].includes(entity.state),
  );
  const openings = binarySensors.filter((entity) =>
    ["door", "window", "garage_door"].includes(
      entity.attributes.device_class ?? "",
    ),
  );
  const openCount = openings.filter((entity) => entity.state === "on").length;
  const moisture = binarySensors.filter(
    (entity) => entity.attributes.device_class === "moisture",
  );
  const safety = [
    ...(openings.length
      ? [
          {
            text: openCount
              ? t.openingsOpen(openCount)
              : t.openingsClosed(openings.length),
            alert: openCount > 0,
          },
        ]
      : []),
    ...(moisture.length
      ? [
          {
            text: moisture.some((entity) => entity.state === "on")
              ? t.leak
              : t.noLeak,
            alert: moisture.some((entity) => entity.state === "on"),
          },
        ]
      : []),
  ];
  const powerByDevice = new Map<string, number>();
  let hasPlugPower = false;
  for (const entity of plugPowerEntities(hass)) {
    const deviceId = hass.entities[entity.entity_id].device_id!;
    hasPlugPower = true;
    const power = sensorValue(entity);
    if (power == null) continue;
    const watts =
      power * (entity.attributes.unit_of_measurement === "kW" ? 1000 : 1);
    powerByDevice.set(deviceId, (powerByDevice.get(deviceId) ?? 0) + watts);
  }
  const plugPowers = [...powerByDevice]
    .map(([id, watts]) => ({
      name: hass.devices[id]?.name_by_user ?? hass.devices[id]?.name ?? "",
      watts,
    }))
    .sort((a, b) => b.watts - a.watts);
  const alarmView = (
    alarm: HassEntity | undefined,
  ): NonNullable<HomeData["alarm"]> => {
    return alarm
      ? {
          title: translatedState(t.alarm, alarm.state),
          safety,
          action:
            alarm.attributes.code_format != null ||
            ![
              "disarmed",
              "armed_away",
              "armed_home",
              "armed_night",
              "armed_vacation",
              "armed_custom_bypass",
              "pending",
              "triggered",
              "arming",
            ].includes(alarm.state)
              ? null
              : {
                  domain: "alarm_control_panel",
                  service:
                    alarm.state === "disarmed"
                      ? "alarm_arm_away"
                      : "alarm_disarm",
                  entityId: alarm.entity_id,
                  label: alarm.state === "disarmed" ? t.arm : t.disarm,
                },
        }
      : {
          title: t.alarm.unavailable,
          safety,
          action: null,
        };
  };
  const vacuumView = (
    vacuum: HassEntity | undefined,
    entityId: string,
  ): NonNullable<HomeData["vacuum"]> => {
    const vacuumDevice = vacuum && hass.entities[vacuum.entity_id]?.device_id;
    const batterySensor = vacuumDevice
      ? states.find(
          (entity) =>
            entity.entity_id.startsWith("sensor.") &&
            hass.entities[entity.entity_id]?.device_id === vacuumDevice &&
            entity.attributes.device_class === "battery",
        )
      : undefined;
    const battery =
      numeric(vacuum?.attributes.battery_level) ?? sensorValue(batterySensor);
    return vacuum
      ? {
          name:
            vacuum.attributes.friendly_name ??
            hass.entities[vacuum.entity_id]?.name ??
            vacuum.entity_id,
          state: translatedState(t.vacuum, vacuum.state),
          battery: battery == null ? null : number(battery),
          action: ["docked", "idle", "paused"].includes(vacuum.state)
            ? {
                domain: "vacuum",
                service: "start",
                entityId: vacuum.entity_id,
                label: t.start,
              }
            : vacuum.state === "cleaning"
              ? {
                  domain: "vacuum",
                  service: "return_to_base",
                  entityId: vacuum.entity_id,
                  label: t.return,
                }
              : null,
        }
      : { name: entityId, state: t.unavailable, battery: null, action: null };
  };
  const data = {
    date: capitalize(
      new Intl.DateTimeFormat(language, {
        weekday: "long",
        day: "numeric",
        month: "long",
      }).format(now),
      language,
    ),
    indoorTemperature: temperatures.length
      ? number(
          temperatures.reduce((total, value) => total + value, 0) /
            temperatures.length,
          1,
        )
      : null,
    indoorSensorCount: temperatures.length,
    weather: weather
      ? {
          temperature: outdoor == null ? null : number(outdoor, 1),
          condition: translatedState(t.weather, weather.state),
        }
      : null,
    people,
    rooms: rawRooms.map((room) => ({
      id: room.id,
      name: room.name,
      temperature:
        room.temperature == null ? null : number(room.temperature, 1),
      humidity: room.humidity == null ? null : number(room.humidity),
      co2: room.co2 == null ? null : number(room.co2),
      lightsOn: room.lights.some((entity) => entity.state === "on"),
    })),
    lightsOn: rawRooms.reduce(
      (count, room) =>
        count +
        room.lights.filter(
          (entity) =>
            entity.state === "on" &&
            !Array.isArray(entity.attributes.entity_id),
        ).length,
      0,
    ),
    plugPower: hasPlugPower
      ? {
          total: plugPowers.length
            ? number(plugPowers.reduce((total, plug) => total + plug.watts, 0))
            : t.unavailable,
          topConsumer: plugPowers.length
            ? `${plugPowers[0].name} ${number(plugPowers[0].watts)} W`.trim()
            : "",
        }
      : null,
  };
  const cards: HomeCardView[] = resolved.home_cards.map((card) => {
    switch (card.type) {
      case "summary":
        return {
          id: card.id,
          type: card.type,
          indoorSensorCount: data.indoorSensorCount,
          indoorTemperature: data.indoorTemperature,
          weather: data.weather,
        };
      case "presence":
        return { id: card.id, type: card.type, people };
      case "rooms":
        return {
          id: card.id,
          type: card.type,
          rooms: data.rooms,
          lightsOn: data.lightsOn,
        };
      case "alarm":
        return {
          id: card.id,
          type: card.type,
          alarm: alarmView(hass.states[card.entity_id]),
        };
      case "vacuum":
        return {
          id: card.id,
          type: card.type,
          vacuum: vacuumView(hass.states[card.entity_id], card.entity_id),
        };
      case "power":
        return {
          id: card.id,
          type: card.type,
          plugPower: data.plugPower ?? {
            total: t.unavailable,
            topConsumer: "",
          },
        };
      case "entities":
        return {
          id: card.id,
          type: card.type,
          title: card.title,
          entities: card.entity_ids.map((id) => {
            const entity = hass.states[id];
            const name =
              entity?.attributes.friendly_name ?? hass.entities[id]?.name ?? id;
            const toggle = ["light", "switch", "fan", "input_boolean"].includes(
              id.split(".")[0],
            );
            return {
              id,
              name,
              state: entity
                ? (hass.formatEntityState?.(entity) ??
                  `${entity.state}${entity.attributes.unit_of_measurement ? ` ${entity.attributes.unit_of_measurement}` : ""}`)
                : t.unavailable,
              on: entity?.state === "on",
              available:
                !!entity && !["unavailable", "unknown"].includes(entity.state),
              action: toggle
                ? {
                    domain: "homeassistant",
                    service: "toggle",
                    entityId: id,
                    label: name,
                  }
                : null,
            };
          }),
        };
    }
  });
  return { date: data.date, cards };
}

export function plugPowerEntities(hass: HassLike): HassEntity[] {
  const states = Object.values(hass.states);
  const plugDevices = new Set(
    states
      .filter((entity) => entity.entity_id.startsWith("switch."))
      .flatMap((entity) => {
        const deviceId = hass.entities[entity.entity_id]?.device_id;
        return deviceId ? [deviceId] : [];
      }),
  );
  return states.filter((entity) => {
    const entry = hass.entities[entity.entity_id];
    return (
      entity.entity_id.startsWith("sensor.") &&
      !entry?.hidden &&
      !entry?.entity_category &&
      entity.attributes.device_class === "power" &&
      !!entry?.device_id &&
      plugDevices.has(entry.device_id)
    );
  });
}

export function resolveDashboardConfig(
  hass: HassLike,
  config: DashboardConfig,
): { home_cards: HomeCard[]; rooms: RoomConfig[] } {
  const automatic: HomeCard[] = [{ id: "auto-summary", type: "summary" }];
  const states = Object.values(hass.states);
  if (states.some((entity) => entity.entity_id.startsWith("person.")))
    automatic.push({ id: "auto-presence", type: "presence" });
  const alarm = states.find((entity) =>
    entity.entity_id.startsWith("alarm_control_panel."),
  );
  if (alarm)
    automatic.push({
      id: "auto-alarm",
      type: "alarm",
      entity_id: alarm.entity_id,
    });
  const vacuum = states.find((entity) =>
    entity.entity_id.startsWith("vacuum."),
  );
  if (vacuum)
    automatic.push({
      id: "auto-vacuum",
      type: "vacuum",
      entity_id: vacuum.entity_id,
    });
  automatic.push({ id: "auto-rooms", type: "rooms" });
  if (plugPowerEntities(hass).length)
    automatic.push({ id: "auto-power", type: "power" });
  return {
    home_cards: (config.home_cards ?? automatic).filter((card) => !card.hidden),
    rooms: (
      config.rooms ??
      Object.values(hass.areas).map((area) => ({ area_id: area.area_id }))
    ).filter((room: RoomConfig) => !room.hidden),
  };
}
