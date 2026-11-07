import { describe, expect, it, vi } from "vitest";
import {
  buildVacuumView,
  calibrationTransform,
  cleaningAction,
  roomLastCleaned,
  roomSelection,
} from "./vacuum-view";
import type { DashboardConfig, HassEntity, HassLike } from "./types";

const config: DashboardConfig = { home_cards: null, rooms: null };
const services = { dreame_vacuum: { vacuum_clean_segment: {} } };
const now = new Date("2026-11-07T12:00:00Z");

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
    friendly_name: "Robot",
    supported_features: 8192 | 4 | 16 | 512,
    battery: 100,
    selected_map: "Ground floor",
    rooms: {
      "Ground floor": [
        { id: 1, name: "Bathroom", icon: "mdi:toilet" },
        { id: 2, name: "Kitchen", icon: "mdi:chef-hat" },
        { id: 3, name: "Hall", icon: "mdi:foot-print" },
        { id: 4, name: "Living room", icon: "mdi:sofa-outline" },
        { id: 5, name: "Study", icon: "mdi:monitor-shimmer" },
      ],
      Upstairs: [{ id: 9, name: "Bedroom" }],
    },
    cleaning_sequence: [3, 2, 4, 1],
    current_segment: 3,
    active_segments: null,
    completed_segments: null,
    dust_bag_status: "Installed",
    clean_water_tank_status: "Installed",
    dirty_water_tank_status: "Installed",
    detergent_status: "Disabled",
    low_water_warning: "No warning",
    auto_empty_mode: "High frequency",
    hot_water_status: "Enabled",
  });
  add("sensor.robot_current_room", "Hall");
  add("sensor.robot_error", "no_error", { description: "No error" });
  add("sensor.robot_cleaning_history", "2026-11-06T09:15:00+00:00");
  add("sensor.robot_cleaning_progress", "unavailable", {
    unit_of_measurement: "%",
  });
  add("sensor.robot_cleaned_area", "6", { unit_of_measurement: "m²" });
  add("sensor.robot_cleaning_time", "11", { unit_of_measurement: "min" });
  add("sensor.robot_total_cleaned_area", "2369", { unit_of_measurement: "m²" });
  add("sensor.robot_total_cleaning_time", "60.2833333333333", {
    unit_of_measurement: "h",
  });
  add("sensor.robot_cleaning_count", "141", { unit_of_measurement: "x" });
  add("sensor.robot_first_cleaning_date", "2026-04-25T12:00:00+00:00");
  return { hass, add };
}

function addMaintenance(add: ReturnType<typeof fixture>["add"]) {
  const part = (key: string, percent: string, left: string, unit: string) => {
    add(`sensor.robot_${key}_left`, percent, { unit_of_measurement: "%" });
    add(`sensor.robot_${key}_time_left`, left, { unit_of_measurement: unit });
  };
  part("main_brush", "79", "239", "h");
  part("filter", "59", "89", "h");
  part("tank_filter", "70", "150", "h");
  part("sensor_dirty", "0", "0", "h");
  part("wheel_dirty", "3", "0.0416666666666667", "d");
  part("scale_inhibitor", "82", "900", "d");
  for (const key of ["main_brush", "filter", "sensor", "wheel"])
    add(`button.robot_reset_${key}`, "unknown");
  add("binary_sensor.robot_maintenance", "on", { items: ["sensor", "wheel"] });
}

describe("vacuum view", () => {
  it("returns no page without a vacuum and respects a configured vacuum", () => {
    const { hass, add } = fixture();
    expect(buildVacuumView({ ...hass, states: {} }, config)).toBeNull();
    add("vacuum.other", "paused", { supported_features: 8192 | 16 });
    const view = buildVacuumView(hass, {
      ...config,
      home_cards: [{ id: "v", type: "vacuum", entity_id: "vacuum.other" }],
    })!;
    expect(view.id).toBe("vacuum.other");
    expect(view.state).toBe("Paused");
    expect(view.controls.map(({ label }) => label)).toEqual([
      "Resume",
      "Return to base",
    ]);
  });

  it("offers the controls that fit what the vacuum is doing", () => {
    const { hass } = fixture();
    const controls = (state: string) => {
      hass.states["vacuum.robot"].state = state;
      return buildVacuumView(hass, config)!.controls.map(
        ({ service }) => service,
      );
    };
    expect(controls("docked")).toEqual(["locate"]);
    expect(controls("idle")).toEqual(["locate", "return_to_base"]);
    expect(controls("cleaning")).toEqual(["pause", "return_to_base"]);
    expect(controls("paused")).toEqual(["start", "return_to_base"]);
    expect(controls("returning")).toEqual(["pause"]);
    expect(controls("unavailable")).toEqual([]);
    hass.states["vacuum.robot"].attributes.supported_features = 8192 | 4;
    expect(controls("cleaning")).toEqual(["pause"]);
    expect(controls("docked")).toEqual([]);
    expect(buildVacuumView(hass, config)!.start).toMatchObject({
      domain: "vacuum",
      service: "start",
      label: "Clean everything",
    });
  });

  it("describes the robot at rest and during a task", () => {
    const { hass } = fixture();
    const docked = buildVacuumView(hass, config)!;
    expect(docked).toMatchObject({
      tone: "idle",
      underway: false,
      details: "Battery 100 % · Last cleaned Fri, Nov 6",
      progress: null,
      error: null,
      task: null,
    });
    hass.states["vacuum.robot"].state = "cleaning";
    hass.states["sensor.robot_current_room"].state = "Kitchen";
    hass.states["sensor.robot_cleaning_progress"].state = "42";
    const cleaning = buildVacuumView(hass, config)!;
    expect(cleaning).toMatchObject({
      tone: "active",
      underway: true,
      details: "Kitchen · 6 m² · 11 min",
      progress: 42,
    });
  });

  it("reports the error sensor, or the error state when the sensor is quiet", () => {
    const { hass } = fixture();
    hass.states["sensor.robot_error"].state = "main_brush_tangled";
    hass.states["sensor.robot_error"].attributes.description =
      "Main brush tangled";
    expect(buildVacuumView(hass, config)!.error).toBe("Main brush tangled");
    hass.states["sensor.robot_error"].state = "no_error";
    hass.states["vacuum.robot"].state = "error";
    const view = buildVacuumView(hass, config)!;
    expect(view.error).toBe("Error");
    expect(view.tone).toBe("alert");
  });

  it("lists the selected map's rooms in the robot's order when segment cleaning exists", () => {
    const { hass } = fixture();
    expect(buildVacuumView(hass, config)!.rooms).toEqual([]);
    const view = buildVacuumView(hass, config, { services })!;
    expect(view.rooms.map(({ name, sequence }) => [sequence, name])).toEqual([
      [1, "Hall"],
      [2, "Kitchen"],
      [3, "Living room"],
      [4, "Bathroom"],
      [5, "Study"],
    ]);
    expect(view.rooms[0].icon).toBe("mdi:foot-print");
  });

  it("ranks and cleans the chosen rooms in the robot's order, not tap order", () => {
    const { hass } = fixture();
    const view = buildVacuumView(hass, config, { services })!;
    const tapped = new Set([1, 2, 3]);
    expect(roomSelection(view.rooms, tapped).map(({ name }) => name)).toEqual([
      "Hall",
      "Kitchen",
      "Bathroom",
    ]);
    expect(
      cleaningAction(view, roomSelection(view.rooms, tapped), "en"),
    ).toEqual({
      domain: "dreame_vacuum",
      service: "vacuum_clean_segment",
      entityId: "vacuum.robot",
      label: "Clean 3 rooms",
      data: { segments: [3, 2, 1] },
    });
    expect(
      cleaningAction(view, roomSelection(view.rooms, new Set([4])), "fr")
        ?.label,
    ).toBe("Nettoyer 1 pièce");
    expect(cleaningAction(view, [], "en")).toBe(view.start);
  });

  it("follows the running task's rooms in cleaning order", () => {
    const { hass } = fixture();
    Object.assign(hass.states["vacuum.robot"].attributes, {
      active_segments: [1, 4, 2],
      completed_segments: [2],
      current_segment: 4,
    });
    hass.states["vacuum.robot"].state = "cleaning";
    expect(
      buildVacuumView(hass, config)!.task!.map(({ name, rank, status }) => [
        rank,
        name,
        status,
      ]),
    ).toEqual([
      [1, "Kitchen", "done"],
      [2, "Living room", "current"],
      [3, "Bathroom", "next"],
    ]);
    hass.states["vacuum.robot"].attributes.active_segments = null;
    hass.states["vacuum.robot"].attributes.completed_segments = [3];
    expect(
      buildVacuumView(hass, config)!.task!.map(({ status }) => status),
    ).toEqual(["done", "upcoming", "current", "next", "upcoming"]);
  });

  it("summarises shortcuts by the rooms of their tasks", () => {
    const { hass, add } = fixture();
    add("button.robot_shortcut_2", "unknown", {
      index: 2,
      name: "After dinner",
      tasks: [
        [{ order: 1, segment_id: 2, cleaning_times: 1, task_type: 1 }],
        [{ order: 1, segment_id: 2, cleaning_times: 1, task_type: 1 }],
      ],
    });
    add("button.robot_shortcut_1", "unavailable", {
      index: 1,
      name: "Daily",
      tasks: [
        [
          { order: 1, segment_id: 2, cleaning_times: 1, task_type: 1 },
          { order: 2, segment_id: 4, cleaning_times: 2, task_type: 1 },
          { order: 3, segment_id: 3, cleaning_times: 1, task_type: 1 },
        ],
      ],
    });
    add("button.robot_shortcut_3", "unknown", {
      index: 3,
      name: "Everything",
      tasks: [[{ order: 1, task_type: 0, cleaning_times: 1 }]],
    });
    add("button.robot_reset_filter", "unknown");
    const view = buildVacuumView(hass, config)!;
    expect(
      view.shortcuts.map(({ name, summary, available }) => [
        name,
        summary,
        available,
      ]),
    ).toEqual([
      ["Daily", "Kitchen, Living room · 2 passes, Hall", false],
      ["After dinner", "Kitchen · 2 passes", true],
      ["Everything", "Whole home", true],
    ]);
    expect(view.shortcuts[1].action).toEqual({
      domain: "button",
      service: "press",
      entityId: "button.robot_shortcut_2",
      label: "Run After dinner",
    });
  });

  it("flags the parts Dreame lists and maps each to its reset button", () => {
    const { hass, add } = fixture();
    addMaintenance(add);
    const { items, flagged, next } = buildVacuumView(hass, config)!.maintenance;
    expect(
      items.map(({ name, value, timeLeft, flagged }) => [
        name,
        value,
        timeLeft,
        flagged,
      ]),
    ).toEqual([
      ["Sensors", "0 %", "0 h left", true],
      ["Wheels", "3 %", "1 h left", true],
      ["Filter", "59 %", "89 h left", false],
      ["Tank filter", "70 %", "150 h left", false],
      ["Main brush", "79 %", "239 h left", false],
      ["Scale inhibitor", "82 %", "900 days left", false],
    ]);
    expect(items.map(({ reset }) => reset?.entityId ?? null)).toEqual([
      "button.robot_reset_sensor",
      "button.robot_reset_wheel",
      "button.robot_reset_filter",
      null,
      "button.robot_reset_main_brush",
      null,
    ]);
    expect(items[0].reset).toMatchObject({
      domain: "button",
      service: "press",
    });
    expect(flagged).toBe(2);
    expect(next).toBeNull();
  });

  it("estimates the next maintenance from the robot's average use", () => {
    const { hass, add } = fixture();
    addMaintenance(add);
    hass.states["binary_sensor.robot_maintenance"].attributes.items = [];
    for (const key of ["sensor_dirty", "wheel_dirty"]) {
      hass.states[`sensor.robot_${key}_left`].state = "100";
      hass.states[`sensor.robot_${key}_time_left`].state = "500";
    }
    // 60.3 h over 196 days is about 0.31 h a day, so 89 h of filter last 289 days.
    expect(buildVacuumView(hass, config, { now })!.maintenance.next).toBe(
      "Next: filter, in about 9 months",
    );
    hass.states["sensor.robot_filter_time_left"].state = "10";
    expect(buildVacuumView(hass, config, { now })!.maintenance.next).toBe(
      "Next: filter, in about 5 weeks",
    );
    hass.states["sensor.robot_filter_time_left"].state = "1";
    hass.language = "fr";
    expect(buildVacuumView(hass, config, { now })!.maintenance.next).toBe(
      "Prochain : filtre, dans environ 3 jours",
    );
    hass.states["sensor.robot_first_cleaning_date"].state = "unknown";
    hass.states["sensor.robot_scale_inhibitor_time_left"].state = "unknown";
    hass.states["sensor.robot_wheel_dirty_time_left"].state = "unknown";
    expect(buildVacuumView(hass, config, { now })!.maintenance.next).toBeNull();
  });

  it("falls back to a low percentage without Dreame's maintenance sensor", () => {
    const { hass, add } = fixture();
    addMaintenance(add);
    delete hass.states["binary_sensor.robot_maintenance"];
    expect(
      buildVacuumView(hass, config)!
        .maintenance.items.filter(({ flagged }) => flagged)
        .map(({ name }) => name),
    ).toEqual(["Sensors", "Wheels"]);
  });

  it("names what the station is missing", () => {
    const { hass } = fixture();
    expect(buildVacuumView(hass, config)!.station).toEqual({
      ready: true,
      parts: "Dust bag · Clean water · Dirty water · Detergent",
      alert: null,
      info: "Frequent auto-empty · Hot water",
    });
    Object.assign(hass.states["vacuum.robot"].attributes, {
      dust_bag_status: "Not installed",
      low_water_warning: "Low water",
      hot_water_status: "Disabled",
    });
    expect(buildVacuumView(hass, config)!.station).toMatchObject({
      ready: false,
      alert: "Dust bag · Low water",
      info: "Frequent auto-empty · Hot water off",
    });
  });

  it("offers cleaning settings from the vacuum's own selects", () => {
    const { hass, add } = fixture();
    add("select.robot_cleaning_mode", "sweeping", {
      options: ["sweeping", "mopping", "sweeping_and_mopping"],
    });
    add("select.robot_room_1_cleaning_mode", "unavailable", {
      options: ["sweeping"],
    });
    add("select.robot_suction_level", "unavailable", {
      options: ["quiet", "standard"],
    });
    const [mode, suction] = buildVacuumView(hass, config)!.settings;
    expect(mode.id).toBe("select.robot_cleaning_mode");
    expect(mode.options.map(({ label }) => label)).toEqual([
      "Sweeping",
      "Mopping",
      "Sweeping and mopping",
    ]);
    expect(mode.options[1].action).toEqual({
      domain: "select",
      service: "select_option",
      entityId: "select.robot_cleaning_mode",
      label: "Cleaning mode: Mopping",
      data: { option: "mopping" },
    });
    expect(suction.available).toBe(false);
    hass.formatEntityState = (entity, value) =>
      `${entity.entity_id}=${value ?? entity.state}`;
    expect(buildVacuumView(hass, config)!.settings[0].options[0].label).toBe(
      "select.robot_cleaning_mode=sweeping",
    );
  });

  it("formats statistics without raw units", () => {
    const { hass } = fixture();
    expect(buildVacuumView(hass, config)!.statistics).toEqual([
      {
        id: "sensor.robot_total_cleaned_area",
        name: "Area cleaned",
        value: "2,369 m²",
      },
      { id: "sensor.robot_cleaning_count", name: "Cleanings", value: "141" },
      {
        id: "sensor.robot_total_cleaning_time",
        name: "Time cleaning",
        value: "60 h 17",
      },
    ]);
  });

  it("places room pins through the map calibration, on Dreame's number bubbles", () => {
    const transform = calibrationTransform([
      { vacuum: { x: 0, y: 0 }, map: { x: 346, y: 725 } },
      { vacuum: { x: 1000, y: 0 }, map: { x: 426, y: 725 } },
      { vacuum: { x: 0, y: 1000 }, map: { x: 346, y: 645 } },
    ])!;
    expect(transform(1000, 1000)).toEqual([426, 645]);
    expect(transform(-2500, 5000)).toEqual([146, 325]);
    expect(
      calibrationTransform([
        { vacuum: { x: 0, y: 0 }, map: { x: 0, y: 0 } },
        { vacuum: { x: 1, y: 1 }, map: { x: 1, y: 1 } },
        { vacuum: { x: 2, y: 2 }, map: { x: 2, y: 2 } },
      ]),
    ).toBeNull();
    expect(calibrationTransform(null)).toBeNull();
    const { hass, add } = fixture();
    add("camera.robot_map", "idle", {
      entity_picture: "/api/camera_proxy/camera.robot_map",
      calibration_points: [
        { vacuum: { x: 0, y: 0 }, map: { x: 346, y: 725 } },
        { vacuum: { x: 1000, y: 0 }, map: { x: 426, y: 725 } },
        { vacuum: { x: 0, y: 1000 }, map: { x: 346, y: 645 } },
      ],
      rooms: {
        "2": { x: 1250, y: 5500, name: "Kitchen" },
        "3": { x: -1250, y: 2000, name: "Hall" },
        "7": { x: 0, y: 0, name: "Hidden" },
      },
    });
    expect(buildVacuumView(hass, config)!.pins).toBeNull();
    const view = buildVacuumView(hass, config, { services })!;
    expect(
      view.pins!.map(({ name, sequence, x, y }) => [name, sequence, x, y]),
    ).toEqual([
      ["Hall", 1, 246, 521],
      ["Kitchen", 2, 446, 241],
    ]);
    hass.states["camera.robot_map"].attributes.calibration_points = null;
    expect(buildVacuumView(hass, config, { services })!.pins).toBeNull();
  });

  it("labels each room by the last day the robot reported it", () => {
    const at = (iso: string) => Date.parse(iso) / 1000;
    const history = [
      { s: "Living room", lu: at("2026-11-03T10:00:00Z") },
      { s: "Hall", lu: at("2026-11-04T08:00:00Z") },
      // 23:30 in Paris on November 6, still yesterday there.
      { s: "Hall", lu: at("2026-11-06T22:30:00Z") },
      { s: "unavailable", lu: at("2026-11-06T22:40:00Z") },
      { s: "Kitchen", lu: at("2026-11-07T07:00:00Z") },
    ];
    const label = roomLastCleaned(history, now, "Europe/Paris", "en");
    expect(["Kitchen", "Hall", "Living room", "Study"].map(label)).toEqual([
      "Today",
      "Yesterday",
      "4 days ago",
      "Not in 10 days",
    ]);
    expect(roomLastCleaned(history, now, "Asia/Tokyo", "fr")("Hall")).toBe(
      "Aujourd'hui",
    );
    expect(roomLastCleaned([], now, "UTC", "fr")("Hall")).toBe(
      "Pas depuis 10 jours",
    );
  });

  it("keeps the basics for a vacuum without Dreame entities", () => {
    const { hass, add } = fixture();
    add(
      "vacuum.basic",
      "docked",
      { supported_features: 8192 | 4 | 16 | 512, battery_level: 64 },
      "basic",
    );
    const view = buildVacuumView(
      hass,
      {
        ...config,
        home_cards: [{ id: "v", type: "vacuum", entity_id: "vacuum.basic" }],
      },
      { services },
    )!;
    expect(view).toMatchObject({
      state: "Docked",
      details: "Battery 64 %",
      controls: [{ service: "locate" }],
      start: { service: "start" },
      camera: null,
      rooms: [],
      pins: null,
      task: null,
      roomHistoryId: null,
      settings: [],
      shortcuts: [],
      maintenance: { items: [], flagged: 0, next: null },
      station: null,
      statistics: [],
    });
    hass.states["vacuum.basic"].state = "cleaning";
    expect(
      buildVacuumView(hass, {
        ...config,
        home_cards: [{ id: "v", type: "vacuum", entity_id: "vacuum.basic" }],
      })!.task,
    ).toBeNull();
  });

  it("uses only the vacuum device's live map camera", () => {
    const { hass, add } = fixture();
    add("camera.other", "idle", { entity_picture: "/api/other" }, "another");
    add("camera.robot_saved_map", "idle", { entity_picture: "/api/saved" });
    hass.entities["camera.robot_saved_map"].entity_category = "config";
    add("camera.robot_map", "idle", { entity_picture: "/api/map" });
    expect(buildVacuumView(hass, config)!.camera).toEqual({
      id: "camera.robot_map",
      picture: "https://example.test/api/map",
    });
    hass.entities["vacuum.robot"].device_id = null;
    expect(buildVacuumView(hass, config)!.camera).toBeNull();
  });

  it("disables an unavailable vacuum and rejects malformed readings", () => {
    const { hass, add } = fixture();
    hass.states["vacuum.robot"].state = "unavailable";
    hass.states["vacuum.robot"].attributes.battery = -1;
    add("sensor.robot_filter_left", "unknown", { unit_of_measurement: "%" });
    const view = buildVacuumView(hass, config)!;
    expect(view.available).toBe(false);
    expect(view.battery).toBeNull();
    expect(view.maintenance.items).toEqual([]);
  });
});
