import { describe, expect, it } from "vitest";
import { fitFooterItems } from "./components/room-card";
import {
  buildRoomCards,
  buildRoomChips,
  buildRoomFooter,
  type RoomCard,
} from "./room-card";
import type { DashboardConfig, HassEntity, HassLike } from "./types";

const room = (overrides: Partial<RoomCard> = {}): RoomCard => ({
  id: "room",
  name: "Room",
  icon: null,
  lighting: null,
  size: "small",
  temperature: null,
  humidity: null,
  co2: null,
  status: null,
  pm25: null,
  hasLights: false,
  lightsOn: 0,
  plugs: [],
  offline: 0,
  battery: null,
  ...overrides,
});

const footer = (
  card: RoomCard,
  today: Record<string, number | null> | null = null,
  language = "en",
) =>
  buildRoomFooter(card, today, language).map(({ kind, text, alert }) =>
    alert ? `${kind}:${text}!` : `${kind}:${text}`,
  );

describe("room footer", () => {
  it("lists humidity, CO₂, PM2.5, plug power and lights in that order", () => {
    expect(
      footer(
        room({
          humidity: { value: "58", percent: 58 },
          co2: { value: "686", ppm: 686, level: "good" },
          pm25: "8",
          hasLights: true,
          lightsOn: 2,
          plugs: [
            { id: "a", name: "A", watts: 100, powerId: "sensor.a_power", energyId: "sensor.a" },
            { id: "b", name: "B", watts: 20.4, powerId: "sensor.b_power", energyId: "sensor.b" },
          ],
        }),
        { "sensor.a": 0.5, "sensor.b": 1.2 },
      ),
    ).toEqual([
      "humidity:58 %",
      "co2:686 ppm",
      "pm25:8 µg/m³",
      "power:120 W · 1.7 kWh",
      "lights:2 on",
    ]);
  });
  it("flags poor CO₂ as an alert in its usual place", () => {
    expect(
      footer(
        room({
          humidity: { value: "40", percent: 40 },
          co2: { value: "1,480", ppm: 1480, level: "poor" },
        }),
      ),
    ).toEqual(["humidity:40 %", "co2:1,480 ppm!"]);
  });
  it("shows plug power at low draw and before energy loads", () => {
    expect(
      footer(
        room({ plugs: [{ id: "a", name: "A", watts: 0, powerId: "sensor.a_power", energyId: "x" }] }),
      ),
    ).toEqual(["power:0 W"]);
  });
  it("says lights are off only when nothing else applies", () => {
    expect(footer(room({ hasLights: true }), null, "fr")).toEqual([
      "lightsOff:Lumières éteintes",
    ]);
    expect(footer(room({ hasLights: true, humidity: { value: "50", percent: 50 } }))).toEqual([
      "humidity:50 %",
    ]);
    expect(footer(room({ hasLights: true, lightsOn: 1 }), null, "fr")).toEqual(
      ["lights:1 allumée"],
    );
  });
  it("falls back to No sensors only for an empty room", () => {
    expect(footer(room())).toEqual(["noSensors:No sensors"]);
    expect(footer(room({ temperature: "20.1" }))).toEqual([]);
  });
});

describe("fitting the room footer", () => {
  it("drops whole items from the end", () => {
    expect(fitFooterItems([false, false, false], [40, 40, 40], 10, 95)).toEqual(
      [0, 1],
    );
  });
  it("keeps an alert that would not fit and drops normal items instead", () => {
    expect(fitFooterItems([false, false, true], [40, 40, 40], 10, 95)).toEqual(
      [0, 2],
    );
  });
  it("keeps the first item even when it alone is too wide", () => {
    expect(fitFooterItems([false, false], [200, 40], 10, 95)).toEqual([0]);
  });
});

describe("room cards", () => {
  it("attaches PM2.5, lights on and the plugs whose device is in the room", () => {
    const states: HassLike["states"] = {};
    const entities: HassLike["entities"] = {};
    const add = (
      id: string,
      state: string,
      device: string,
      attributes: HassEntity["attributes"] = {},
    ) => {
      states[id] = {
        entity_id: id,
        state,
        attributes,
        last_changed: "",
        last_updated: "",
        context: { id: "test", parent_id: null, user_id: null },
      };
      entities[id] = { entity_id: id, device_id: device };
    };
    add("sensor.pm25", "7.6", "air", { device_class: "pm25" });
    add("light.a", "on", "lamp_a");
    add("light.b", "off", "lamp_b");
    add("switch.kettle", "on", "kettle");
    add("sensor.kettle_power", "1200", "kettle", { device_class: "power" });
    add("switch.tv", "on", "tv");
    add("sensor.tv_power", "80", "tv", { device_class: "power" });
    const hass = {
      language: "en",
      states,
      entities,
      areas: {
        kitchen: { area_id: "kitchen", name: "Kitchen", icon: null },
      },
      devices: Object.fromEntries(
        ["air", "lamp_a", "lamp_b", "kettle", "tv"].map((id) => [
          id,
          { id, name: id, area_id: id === "tv" ? "living" : "kitchen" },
        ]),
      ),
    } as unknown as HassLike;
    const [kitchen] = buildRoomCards(
      hass,
      { home_cards: null, rooms: null },
      new Set(),
    );
    expect(kitchen).toMatchObject({
      pm25: "8",
      hasLights: true,
      lightsOn: 1,
      plugs: [{ id: "kettle", watts: 1200 }],
    });
  });
});

function house() {
  const hass = {
    language: "en",
    states: {},
    entities: {},
    devices: {},
    areas: Object.fromEntries(
      ["office", "kitchen", "garden"].map((id) => [
        id,
        { area_id: id, name: id[0].toUpperCase() + id.slice(1), icon: null },
      ]),
    ),
  } as unknown as HassLike;
  const add = (
    id: string,
    state: string,
    area: string,
    attributes: HassEntity["attributes"] = {},
  ) => {
    hass.states[id] = {
      entity_id: id,
      state,
      attributes,
      last_changed: "",
      last_updated: "",
      context: { id: "test", parent_id: null, user_id: null },
    };
    hass.entities[id] = { entity_id: id, device_id: id };
    hass.devices[id] = { id, name: id, name_by_user: null, area_id: area };
  };
  const cards = (rooms: DashboardConfig["rooms"] = null) =>
    Object.fromEntries(
      buildRoomCards(hass, { home_cards: null, rooms }, new Set()).map(
        (card) => [card.id, card],
      ),
    );
  return { hass, add, cards };
}

describe("room card size", () => {
  it("is large for an indoor room with a temperature and small otherwise", () => {
    const { add, cards } = house();
    add("sensor.office_temperature", "21", "office", {
      device_class: "temperature",
    });
    add("sensor.garden_temperature", "12", "garden", {
      device_class: "temperature",
    });
    add("sensor.kitchen_humidity", "50", "kitchen", {
      device_class: "humidity",
    });
    const { office, kitchen, garden } = cards();
    expect([office.size, kitchen.size, garden.size]).toEqual([
      "large",
      "small",
      "small",
    ]);
  });
  it("follows the size an admin saved", () => {
    const { add, cards } = house();
    add("sensor.office_temperature", "21", "office", {
      device_class: "temperature",
    });
    const { office, kitchen } = cards([
      { area_id: "office", size: "small" },
      { area_id: "kitchen", size: "large" },
    ]);
    expect([office.size, kitchen.size]).toEqual(["small", "large"]);
  });
});

describe("room card status", () => {
  it("names fair or poor air before comfort", () => {
    const { add, cards } = house();
    add("sensor.office_co2", "1000", "office", {
      device_class: "carbon_dioxide",
    });
    add("sensor.office_humidity", "50", "office", {
      device_class: "humidity",
    });
    add("sensor.kitchen_co2", "1500", "kitchen", {
      device_class: "carbon_dioxide",
    });
    const { office, kitchen } = cards();
    expect(office.status).toEqual({ text: "Fair air", level: "fair" });
    expect(kitchen.status).toEqual({ text: "Poor air", level: "poor" });
  });
  it("falls back to the comfort perception when the air is good or unknown", () => {
    const { add, cards } = house();
    add("sensor.office_co2", "600", "office", {
      device_class: "carbon_dioxide",
    });
    add("sensor.office_humidity", "35", "office", {
      device_class: "humidity",
    });
    const { office, kitchen } = cards();
    expect(office.status).toEqual({ text: "Dry", level: null });
    expect(office.humidity).toEqual({ value: "35", percent: 35 });
    expect(kitchen.status).toBeNull();
  });
});

describe("room card device health", () => {
  it("counts offline devices and shows the lowest battery below 20 %", () => {
    const { add, cards } = house();
    add("switch.office_plug", "unavailable", "office");
    add("binary_sensor.office_motion", "unavailable", "office");
    add("sensor.office_remote_battery", "9", "office", {
      device_class: "battery",
      unit_of_measurement: "%",
    });
    add("sensor.office_door_battery", "15", "office", {
      device_class: "battery",
      unit_of_measurement: "%",
    });
    add("sensor.kitchen_battery", "35", "kitchen", {
      device_class: "battery",
      unit_of_measurement: "%",
    });
    const { office, kitchen } = cards();
    expect(office).toMatchObject({
      offline: 2,
      battery: { level: 9, value: "9 %" },
    });
    expect(kitchen).toMatchObject({ offline: 0, battery: null });
  });
});

describe("room chips", () => {
  it("keeps PM2.5, power and lights on, leaving climate to the columns", () => {
    expect(
      buildRoomChips(
        room({
          humidity: { value: "58", percent: 58 },
          co2: { value: "686", ppm: 686, level: "good" },
          pm25: "8",
          hasLights: true,
          lightsOn: 2,
          plugs: [
            { id: "a", name: "A", watts: 100, powerId: "sensor.a_power", energyId: "sensor.a" },
          ],
        }),
        { "sensor.a": 1.2 },
        "en",
      ).map((chip) => chip.text),
    ).toEqual(["8 µg/m³", "100 W · 1.2 kWh", "2 on"]);
  });
  it("is empty when the room has only climate or nothing lit", () => {
    expect(
      buildRoomChips(room({ hasLights: true, temperature: "20.0" }), null, "en"),
    ).toEqual([]);
  });
});
