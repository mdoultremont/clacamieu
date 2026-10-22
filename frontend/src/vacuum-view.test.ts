import { describe, expect, it, vi } from "vitest";
import { buildVacuumView } from "./vacuum-view";
import type { DashboardConfig, HassEntity, HassLike } from "./types";

const config: DashboardConfig = { home_cards: null, rooms: null };
function fixture() {
  const hass: HassLike = {
    states: {},
    entities: {},
    devices: {},
    areas: {},
    panels: {},
    user: { id: "u", name: "Example", is_admin: false },
    language: "en",
    callService: vi.fn(),
    callWS: vi.fn(),
    hassUrl: (path) => `https://example.test${path}`,
  };
  function add(
    id: string,
    state: string,
    attributes: HassEntity["attributes"] = {},
    device = "robot",
  ) {
    hass.states[id] = {
      entity_id: id,
      state,
      attributes,
      last_changed: "",
      last_updated: "",
      context: { id: "t", parent_id: null, user_id: null },
    };
    hass.entities[id] = { entity_id: id, device_id: device };
  }
  add("vacuum.robot", "docked", {
    supported_features: 8192 | 4 | 16 | 512,
    battery: 100,
    rooms: {
      Upstairs: [{ id: 3, name: "Study" }],
      Downstairs: [{ id: 8, name: "Hall" }],
    },
    selected_map: "Upstairs",
    current_segment: 3,
  });
  return { hass, add };
}

describe("vacuum view", () => {
  it("returns no page without a vacuum and respects a configured vacuum", () => {
    const { hass, add } = fixture();
    expect(buildVacuumView({ ...hass, states: {} }, config)).toBeNull();
    add("vacuum.other", "paused", { supported_features: 4 });
    const view = buildVacuumView(hass, {
      ...config,
      home_cards: [{ id: "v", type: "vacuum", entity_id: "vacuum.other" }],
    })!;
    expect(view.id).toBe("vacuum.other");
    expect(view.state).toBe("Paused");
    expect(view.actions.map(({ service }) => service)).toEqual(["pause"]);
  });
  it("offers supported controls and only the selected map's service-backed rooms", () => {
    const { hass } = fixture();
    expect(buildVacuumView(hass, config)!.rooms).toEqual([]);
    const view = buildVacuumView(hass, config, {
      dreame_vacuum: { vacuum_clean_segment: {} },
    })!;
    expect(view.actions.map(({ service }) => service)).toEqual([
      "start",
      "pause",
      "return_to_base",
      "locate",
    ]);
    expect(view.currentRoom).toBe("Study");
    expect(view.rooms).toEqual([
      {
        id: 3,
        name: "Study",
        action: {
          domain: "dreame_vacuum",
          service: "vacuum_clean_segment",
          entityId: "vacuum.robot",
          label: "Clean Study",
          data: { segments: [3] },
        },
      },
    ]);
    hass.states["vacuum.robot"].attributes.selected_map = "Missing";
    expect(
      buildVacuumView(hass, config, {
        dreame_vacuum: { vacuum_clean_segment: {} },
      })!.rooms,
    ).toEqual([]);
  });
  it("uses only the vacuum device for map, consumables and statistics", () => {
    const { hass, add } = fixture();
    add("camera.other", "idle", { entity_picture: "/api/other" }, "another");
    add("camera.robot_map", "idle", { entity_picture: "/api/map" });
    add("sensor.robot_filter_left", "9", {
      unit_of_measurement: "%",
      friendly_name: "Filter",
    });
    add("sensor.robot_mop_left", "10", { unit_of_measurement: "%" });
    add("sensor.robot_main_brush_time_left", "5", { unit_of_measurement: "h" });
    add(
      "sensor.other_filter_left",
      "2",
      { unit_of_measurement: "%" },
      "another",
    );
    add("sensor.robot_total_cleaning_time", "12.3", {
      unit_of_measurement: "h",
      friendly_name: "Total time",
    });
    const view = buildVacuumView(hass, config)!;
    expect(view.camera).toEqual({
      id: "camera.robot_map",
      picture: "https://example.test/api/map",
    });
    expect(view.consumables.map(({ low }) => low)).toEqual([true, false]);
    expect(view.statistics).toEqual([
      {
        id: "sensor.robot_total_cleaning_time",
        name: "Total time",
        value: "12.3 h",
      },
    ]);
    hass.entities["vacuum.robot"].device_id = null;
    expect(buildVacuumView(hass, config)!.camera).toBeNull();
    expect(buildVacuumView(hass, config)!.consumables).toEqual([]);
  });
  it("keeps unavailable controls disabled through availability and rejects malformed readings", () => {
    const { hass, add } = fixture();
    hass.states["vacuum.robot"].state = "unavailable";
    hass.states["vacuum.robot"].attributes.battery = -1;
    add("sensor.robot_filter_left", "unknown", { unit_of_measurement: "%" });
    const view = buildVacuumView(hass, config)!;
    expect(view.available).toBe(false);
    expect(view.battery).toBeNull();
    expect(view.consumables).toEqual([]);
  });
});
