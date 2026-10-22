import { describe, expect, it, vi } from "vitest";
import { buildComfortView, sortComfortRooms } from "./comfort-view";
import {
  buildForecastView,
  buildGardenView,
  isOutdoorArea,
} from "./garden-view";
import type { DashboardConfig, HassLike } from "./types";

const automatic: DashboardConfig = { home_cards: null, rooms: null };
function climateFixture(): HassLike {
  return {
    states: {},
    entities: {},
    devices: {},
    panels: {},
    areas: {
      room_a: { area_id: "room_a", name: "Room A", icon: null },
      room_b: { area_id: "room_b", name: "Room B", icon: null },
      outdoor: { area_id: "outdoor", name: "Terrasse", icon: null },
    },
    user: { id: "example", name: "Example", is_admin: false },
    language: "fr",
    callWS: vi.fn(),
    callService: vi.fn(),
  };
}
function addSensor(
  hass: HassLike,
  id: string,
  state: string,
  area = "room_a",
  attributes: Record<string, unknown> = {},
) {
  hass.states[id] = {
    entity_id: id,
    state,
    attributes,
    last_changed: "",
    last_updated: "",
    context: { id: "example", parent_id: null, user_id: null },
  };
  hass.entities[id] = { entity_id: id, area_id: area };
}

describe("comfort climate", () => {
  it("uses visible room configuration, overrides, devices and area sensor preferences for the averages", () => {
    const hass = climateFixture();
    addSensor(hass, "sensor.temp", "20", "room_a", {
      device_class: "temperature",
      unit_of_measurement: "°C",
    });
    addSensor(hass, "sensor.humidity", "50", "room_a", {
      device_class: "humidity",
    });
    addSensor(hass, "sensor.preferred", "24", "room_b", {
      device_class: "temperature",
    });
    addSensor(hass, "sensor.override", "22", "room_b", {
      device_class: "temperature",
    });
    addSensor(hass, "sensor.device_humidity", "70", "", {
      device_class: "humidity",
    });
    hass.entities["sensor.device_humidity"] = {
      entity_id: "sensor.device_humidity",
      device_id: "device_b",
    };
    hass.devices.device_b = {
      id: "device_b",
      area_id: "room_b",
      name: null,
      name_by_user: null,
    };
    hass.areas.room_b.temperature_entity_id = "sensor.preferred";
    const config: DashboardConfig = {
      ...automatic,
      rooms: [
        { area_id: "room_b", temperature_entity_id: "sensor.override" },
        { area_id: "room_a" },
        { area_id: "outdoor", hidden: true },
        { area_id: "deleted" },
      ],
    };
    expect(buildComfortView(hass, config)).toMatchObject({
      temperature: "21°C",
      humidity: "60 %",
      rooms: [
        { id: "room_b", temperature: 22 },
        { id: "room_a", temperature: 20 },
      ],
    });
    expect(buildComfortView(hass, { ...automatic, rooms: [] }).rooms).toEqual(
      [],
    );
    expect(
      buildComfortView(hass, {
        ...automatic,
        rooms: [{ area_id: "room_a", hidden: true }, { area_id: "room_b" }],
      }).temperature,
    ).toBe("24°C");
  });
  it.each([
    ["39.9", "Sec", false],
    ["40", "Confortable", false],
    ["60", "Confortable", false],
    ["60.1", "Humide", false],
    ["70", "Humide", false],
    ["70.1", "Très humide", true],
    ["unavailable", null, false],
  ])(
    "labels humidity %s and flags only above 70",
    (value, perception, problem) => {
      const hass = climateFixture();
      addSensor(hass, "sensor.humidity", String(value), "room_a", {
        device_class: "humidity",
      });
      const room = buildComfortView(hass, automatic).rooms[0];
      expect(room.perception).toBe(perception);
      expect(room.problems.length > 0).toBe(problem);
    },
  );
  it("sorts worst first by the selected reading with missing values last and preserves input order", () => {
    const hass = climateFixture();
    for (const [id, area, value, deviceClass] of [
      ["sensor.a_humidity", "room_a", "80", "humidity"],
      ["sensor.b_humidity", "room_b", "60", "humidity"],
      ["sensor.a_co2", "room_a", "1200", "carbon_dioxide"],
      ["sensor.b_co2", "room_b", "1500", "carbon_dioxide"],
      ["sensor.a_dew_point", "room_a", "14", "temperature"],
      ["sensor.b_dew_point", "room_b", "12", "temperature"],
    ])
      addSensor(hass, id, value, area, { device_class: deviceClass });
    const rooms = buildComfortView(hass, automatic).rooms;
    expect(rooms[0].problems).toEqual(["Humidité élevée"]);
    expect(rooms[1].problems).toEqual(["CO₂ élevé"]);
    expect(sortComfortRooms(rooms, "co2").map((r) => r.id)).toEqual([
      "room_b",
      "room_a",
      "outdoor",
    ]);
    expect(sortComfortRooms(rooms, "humidity")[0].id).toBe("room_a");
    expect(sortComfortRooms(rooms, "dewPoint")[0].id).toBe("room_a");
    expect(sortComfortRooms(rooms, "all")[0].id).toBe("room_b");
    expect(rooms[0].id).toBe("room_a");
  });
  it("uses translated perception, ignores hidden sensors and keeps an unavailable room", () => {
    const hass = climateFixture();
    addSensor(hass, "sensor.a_thermal_perception", "comfortable");
    addSensor(hass, "sensor.a_humidity", "80", "room_a", {
      device_class: "humidity",
    });
    expect(buildComfortView(hass, automatic).rooms[0].perception).toBe(
      "Confortable",
    );
    hass.formatEntityState = () => "Formatted comfort";
    expect(buildComfortView(hass, automatic).rooms[0].perception).toBe(
      "Formatted comfort",
    );
    hass.entities["sensor.a_thermal_perception"].hidden = true;
    expect(buildComfortView(hass, automatic).rooms[0].perception).toBe(
      "Très humide",
    );
    expect(buildComfortView(hass, automatic).rooms[1]).toMatchObject({
      temperature: null,
      humidity: null,
      co2: null,
      perception: null,
    });
  });
});

describe("garden", () => {
  it.each(["Jardin", "Terrasse", "Extérieur", "Outdoor", "Garden", "Outside"])(
    "recognizes the outdoor area %s",
    (name) => {
      expect(isOutdoorArea({ area_id: "example", name, icon: null }, {})).toBe(
        true,
      );
    },
  );
  it("recognizes outdoor floors and excludes indoor rooms and hidden sensors", () => {
    const hass = climateFixture();
    hass.areas.room_b.floor_id = "floor_outdoor";
    hass.floors = {
      floor_outdoor: { floor_id: "floor_outdoor", name: "Extérieur" },
    };
    for (const area of ["room_a", "room_b", "outdoor"])
      addSensor(hass, `sensor.${area}`, "20", area, {
        device_class: "temperature",
      });
    hass.entities["sensor.outdoor"].hidden = true;
    expect(buildGardenView(hass).areas.map((area) => area.id)).toEqual([
      "room_b",
    ]);
    expect(isOutdoorArea(hass.areas.room_a, hass.floors)).toBe(false);
  });
  it("uses the first visible weather entity with its unit and forecast support", () => {
    const hass = climateFixture();
    addSensor(hass, "weather.hidden", "rainy");
    hass.entities["weather.hidden"].hidden = true;
    addSensor(hass, "weather.example", "cloudy", "", {
      temperature: 52,
      temperature_unit: "°F",
      humidity: 86,
      supported_features: 3,
    });
    expect(buildGardenView(hass).weather).toMatchObject({
      id: "weather.example",
      temperature: "52°F",
      humidity: "86 %",
      condition: "Nuageux",
      daily: true,
    });
    expect(buildGardenView(climateFixture())).toEqual({
      weather: null,
      areas: [],
      valves: [],
    });
  });
  it("offers only supported valve actions and disables unavailable valves without a client timer", () => {
    const hass = climateFixture();
    addSensor(hass, "valve.example", "closed", "outdoor", {
      supported_features: 3,
      friendly_name: "Watering",
    });
    addSensor(hass, "valve.open_only", "unavailable", "outdoor", {
      supported_features: 1,
    });
    addSensor(hass, "valve.hidden", "closed", "outdoor", {
      supported_features: 3,
    });
    hass.entities["valve.hidden"].hidden = true;
    const valves = buildGardenView(hass).valves;
    expect(valves).toHaveLength(2);
    expect(valves[0]).toMatchObject({
      available: true,
      state: "Fermée · Terrasse",
      actions: [
        { domain: "valve", service: "open_valve", entityId: "valve.example" },
        { domain: "valve", service: "close_valve" },
      ],
    });
    expect(valves[1]).toMatchObject({
      available: false,
      actions: [{ service: "open_valve" }],
    });
  });
  it("lists irrigation outlets that close themselves after the device duration", () => {
    const hass = climateFixture();
    const onDevice = (id: string, state: string, attributes = {}) => {
      addSensor(hass, id, state, "outdoor", attributes);
      hass.entities[id].device_id = "valve_device";
    };
    onDevice("number.garden_irrigation_duration", "10", {
      unit_of_measurement: "min",
    });
    onDevice("switch.garden_1", "off", { friendly_name: "Garden 1" });
    onDevice("switch.garden_child_lock", "off");
    hass.entities["switch.garden_child_lock"].entity_category = "config";
    addSensor(hass, "switch.lamp", "off");
    const valves = buildGardenView(hass).valves;
    expect(valves).toEqual([
      {
        id: "switch.garden_1",
        name: "Garden 1",
        state: "Fermée · Fermeture après 10 min · Terrasse",
        available: true,
        actions: [
          expect.objectContaining({ domain: "switch", service: "turn_on" }),
          expect.objectContaining({ domain: "switch", service: "turn_off" }),
        ],
      },
    ]);
  });
  it("parses five forecast days, units and missing temperatures without accepting invalid dates", () => {
    expect(buildForecastView(null, "en", "°C")).toEqual([]);
    const forecast = Array.from({ length: 7 }, (_, index) => ({
      datetime: `2026-10-${22 + index}T12:00:00Z`,
      condition: "rainy",
      temperature: 12,
      templow: 5,
    }));
    const view = buildForecastView(
      { forecast: [{ datetime: "invalid" }, ...forecast] },
      "fr",
      "°C",
    );
    expect(view).toHaveLength(5);
    expect(view[0]).toMatchObject({
      day: "jeu.",
      condition: "Pluvieux",
      high: "12°C",
      low: "5°C",
    });
    expect(
      buildForecastView(
        { forecast: [{ datetime: "2026-10-22T12:00:00Z" }] },
        "en",
        "°F",
      )[0],
    ).toMatchObject({ high: null, low: null });
  });
});
