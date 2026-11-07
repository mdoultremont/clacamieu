import { describe, expect, it } from "vitest";
import { fitFooterItems } from "./components/room-card";
import { buildRoomCards, buildRoomFooter, type RoomCard } from "./room-card";
import type { HassEntity, HassLike } from "./types";

const room = (overrides: Partial<RoomCard> = {}): RoomCard => ({
  id: "room",
  name: "Room",
  icon: null,
  lighting: null,
  temperature: null,
  humidity: null,
  co2: null,
  pm25: null,
  hasLights: false,
  lightsOn: 0,
  plugs: [],
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
          humidity: "58",
          co2: { value: "686", ppm: 686, level: "good" },
          pm25: "8",
          hasLights: true,
          lightsOn: 2,
          plugs: [
            { id: "a", name: "A", watts: 100, energyId: "sensor.a" },
            { id: "b", name: "B", watts: 20.4, energyId: "sensor.b" },
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
          humidity: "40",
          co2: { value: "1,480", ppm: 1480, level: "poor" },
        }),
      ),
    ).toEqual(["humidity:40 %", "co2:1,480 ppm!"]);
  });
  it("shows plug power at low draw and before energy loads", () => {
    expect(
      footer(
        room({ plugs: [{ id: "a", name: "A", watts: 0, energyId: "x" }] }),
      ),
    ).toEqual(["power:0 W"]);
  });
  it("says lights are off only when nothing else applies", () => {
    expect(footer(room({ hasLights: true }), null, "fr")).toEqual([
      "lightsOff:Lumières éteintes",
    ]);
    expect(footer(room({ hasLights: true, humidity: "50" }))).toEqual([
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
