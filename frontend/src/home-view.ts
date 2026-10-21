import { locale, messages, translatedState } from "./i18n";
import type { DashboardConfig, HassEntity, HassLike, HomeView } from "./types";

export function numeric(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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
  const areas = config.room_area_ids.length
    ? [...new Set(config.room_area_ids)].flatMap((id) =>
        hass.areas[id] ? [hass.areas[id]] : [],
      )
    : Object.values(hass.areas);
  const rawRooms = areas.map((area) => {
    const entities = states.filter(
      (entity) => visible(entity) && areaOf(entity) === area.area_id,
    );
    const climate = (deviceClass: string, explicit?: string | null) =>
      sensorValue(
        explicit
          ? hass.states[explicit]
          : entities.find(
              (entity) =>
                entity.entity_id.startsWith("sensor.") &&
                entity.attributes.device_class === deviceClass,
            ),
      );
    return {
      id: area.area_id,
      name: area.name,
      temperature: climate("temperature", area.temperature_entity_id),
      humidity: climate("humidity", area.humidity_entity_id),
      co2: climate("carbon_dioxide"),
      lights: entities.filter((entity) =>
        entity.entity_id.startsWith("light."),
      ),
    };
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
  const alarm = states.find((entity) =>
    entity.entity_id.startsWith("alarm_control_panel."),
  );
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
  const alarmSubtitle = [
    openings.length
      ? openCount
        ? t.openingsOpen(openCount)
        : t.openingsClosed(openings.length)
      : null,
    moisture.length
      ? moisture.some((entity) => entity.state === "on")
        ? t.leak
        : t.noLeak
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const vacuum = states.find((entity) =>
    entity.entity_id.startsWith("vacuum."),
  );
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
  const plugDevices = new Set(
    states
      .filter((entity) => entity.entity_id.startsWith("switch."))
      .flatMap((entity) => {
        const deviceId = hass.entities[entity.entity_id]?.device_id;
        return deviceId ? [deviceId] : [];
      }),
  );
  const powerByDevice = new Map<string, number>();
  let hasPlugPower = false;
  for (const entity of states) {
    const deviceId = hass.entities[entity.entity_id]?.device_id;
    if (
      !entity.entity_id.startsWith("sensor.") ||
      !visible(entity) ||
      entity.attributes.device_class !== "power" ||
      !deviceId ||
      !plugDevices.has(deviceId)
    )
      continue;
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
  const hour = now.getHours();
  const firstName = hass.user.name.trim().split(/\s+/)[0];
  return {
    greeting: `${hour >= 18 ? t.evening : hour >= 12 ? t.afternoon : t.morning}${firstName ? ` ${firstName}` : ""}`,
    date: new Intl.DateTimeFormat(language, {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(now),
    indoorTemperature: temperatures.length
      ? number(
          temperatures.reduce((total, value) => total + value, 0) /
            temperatures.length,
          1,
        )
      : null,
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
    alarm: alarm
      ? {
          title: translatedState(t.alarm, alarm.state),
          subtitle: alarmSubtitle,
          tone: ["pending", "triggered"].includes(alarm.state)
            ? "red"
            : alarm.state === "disarmed"
              ? "green"
              : "amber",
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
      : null,
    vacuum: vacuum
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
      : null,
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
}
