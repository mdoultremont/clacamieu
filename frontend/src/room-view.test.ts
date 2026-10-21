import { describe, expect, it, vi } from "vitest";
import { buildRoomsView, buildRoomView } from "./room-view";
import type { DashboardConfig, HassEntity, HassLike } from "./types";

const config: DashboardConfig = { home_cards: null, rooms: null };
function fixture(): HassLike {
  const states: HassLike["states"] = {};
  const entities: HassLike["entities"] = {};
  function add(
    id: string,
    state: string,
    attributes: HassEntity["attributes"] = {},
  ) {
    states[id] = {
      entity_id: id,
      state,
      attributes,
      last_changed: "",
      last_updated: "",
      context: { id: "test", parent_id: null, user_id: null },
    };
    entities[id] = { entity_id: id, device_id: "device_a" };
  }
  add("light.member_b", "off", {
    friendly_name: "Reading lamp",
    supported_color_modes: ["onoff"],
  });
  add("light.member_a", "on", {
    friendly_name: "Main lamp",
    brightness: 158,
    supported_color_modes: ["brightness"],
  });
  add("light.group", "on", {
    friendly_name: "Room lights",
    entity_id: ["light.member_a", "light.member_b"],
    brightness: 158,
    supported_color_modes: ["brightness"],
  });
  add("scene.reading", "2026-10-21T12:00:00+00:00", {
    friendly_name: "Reading",
  });
  add("cover.blind", "closed", {
    friendly_name: "Blind",
    supported_features: 3,
  });
  add("binary_sensor.door", "on", {
    friendly_name: "Door",
    device_class: "door",
  });
  add("sensor.temp", "20.5", {
    device_class: "temperature",
    unit_of_measurement: "°C",
  });
  add("sensor.humidity", "55", {
    device_class: "humidity",
    unit_of_measurement: "%",
  });
  add("sensor.co2", "649", {
    device_class: "carbon_dioxide",
    unit_of_measurement: "ppm",
  });
  add("switch.plug", "off", { friendly_name: "Smart plug" });
  return {
    states,
    entities,
    devices: {
      device_a: {
        id: "device_a",
        area_id: "room_a",
        name: "Example",
        name_by_user: null,
      },
    },
    areas: {
      room_a: { area_id: "room_a", name: "Room A", icon: null },
      room_b: { area_id: "room_b", name: "Room B", icon: null },
    },
    panels: {},
    language: "fr",
    user: { id: "test", name: "Example", is_admin: true },
    callWS: vi.fn(),
    callService: vi.fn(),
  };
}

describe("room views", () => {
  it("resolves areas through devices and lists groups before their members without double counting", () => {
    const room = buildRoomView(fixture(), config, "room_a")!;
    expect(room.lights.map((light) => light.id)).toEqual([
      "light.group",
      "light.member_a",
      "light.member_b",
    ]);
    expect(room.lightsOn).toBe(1);
    expect(room.lights[1]).toMatchObject({
      brightness: 62,
      dimmable: true,
      group: false,
    });
    expect(room.lights[2]).toMatchObject({
      on: false,
      dimmable: false,
      brightness: null,
    });
    expect(room.scenes[0]).toMatchObject({
      id: "scene.reading",
      name: "Reading",
    });
    expect(
      room.devices.find((device) => device.id === "cover.blind")?.actions,
    ).toMatchObject([
      { domain: "cover", service: "open_cover" },
      { domain: "cover", service: "close_cover" },
    ]);
    expect(
      room.devices.find((device) => device.id === "switch.plug")?.actions,
    ).toMatchObject([{ domain: "homeassistant", service: "toggle" }]);
    expect(room.sensors[0].state).toBe("Ouvert");
    expect(room.climate.map((sensor) => sensor.value)).toEqual([
      "20,5",
      "55",
      "649",
    ]);
    expect(room.air).toBe("good");
  });
  it("excludes hidden and category entities and honors entity areas over device areas", () => {
    const hass = fixture();
    hass.entities["light.member_a"].hidden = true;
    hass.entities["light.member_b"].entity_category = "diagnostic";
    hass.entities["scene.reading"].area_id = "room_b";
    expect(
      buildRoomView(hass, config, "room_a")!.lights.map((light) => light.id),
    ).toEqual(["light.group"]);
    expect(buildRoomView(hass, config, "room_a")!.scenes).toEqual([]);
    expect(buildRoomView(hass, config, "room_b")!.scenes).toHaveLength(1);
  });
  it("uses the configured sensor overrides and Home Assistant state formatting", () => {
    const hass = fixture();
    hass.formatEntityState = (entity) => `Formatted ${entity.state}`;
    const room = buildRoomView(
      hass,
      {
        ...config,
        rooms: [
          { area_id: "room_a", temperature_entity_id: "sensor.humidity" },
        ],
      },
      "room_a",
    )!;
    expect(room.climate[0].value).toBe("55,0");
    expect(room.sensors[0].state).toBe("Formatted on");
  });
  it.each([
    ["799", "good"],
    ["800", "fair"],
    ["1199", "fair"],
    ["1200", "poor"],
    ["unavailable", null],
  ])("classifies CO₂ %s as %s", (value, air) => {
    const hass = fixture();
    hass.states["sensor.co2"].state = value!;
    expect(buildRoomView(hass, config, "room_a")!.air).toBe(air);
  });
  it("keeps configured room order, hides rooms and omits deleted areas", () => {
    const hass = fixture();
    expect(
      buildRoomsView(hass, {
        ...config,
        rooms: [
          { area_id: "room_b" },
          { area_id: "gone" },
          { area_id: "room_a", hidden: true },
        ],
      }).map((room) => room.id),
    ).toEqual(["room_b"]);
    expect(buildRoomView(hass, config, "gone")).toBeNull();
    expect(buildRoomView(hass, config, "room_b")).toMatchObject({
      climate: [],
      lights: [],
      scenes: [],
      devices: [],
      sensors: [],
    });
  });
});
