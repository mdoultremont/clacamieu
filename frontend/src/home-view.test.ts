import { describe, expect, it, vi } from "vitest";
import { buildHomeView, numeric, resolveDashboardConfig } from "./home-view";
import { parseDashboardConfig } from "./dashboard-config";
import { en, fr } from "./i18n";
import type { HassEntity, HassLike, HomeData } from "./types";

const now = new Date(2026, 9, 21, 18, 0);
function entity(
  entity_id: string,
  state: string,
  attributes: HassEntity["attributes"] = {},
): HassEntity {
  return {
    entity_id,
    state,
    attributes,
    last_changed: "",
    last_updated: "",
    context: { id: "test", parent_id: null, user_id: null },
  };
}
function fixture(): HassLike {
  return {
    states: {},
    entities: {},
    devices: {},
    panels: {},
    areas: {
      room_a: { area_id: "room_a", name: "Room A", icon: null },
      room_b: { area_id: "room_b", name: "Room B", icon: null },
    },
    user: { id: "user_a", name: "Alex Example", is_admin: true },
    language: "fr-BE",
    callService: vi.fn(),
    callWS: vi.fn(),
  };
}
function add(
  hass: HassLike,
  value: HassEntity,
  area = "room_a",
  device?: string,
) {
  hass.states[value.entity_id] = value;
  hass.entities[value.entity_id] = {
    entity_id: value.entity_id,
    area_id: area || null,
    device_id: device,
  };
}
const view = (hass: HassLike, ids: string[] | null = null): HomeData => {
  const result = buildHomeView(
    hass,
    { home_cards: null, rooms: ids?.map((area_id) => ({ area_id })) ?? null },
    now,
  );
  return Object.assign(
    { alarm: null, vacuum: null, plugPower: null, people: [] },
    ...result.cards,
  );
};

describe("home view", () => {
  it("uses the configured room order, skips unknown IDs and averages only shown temperatures", () => {
    const hass = fixture();
    add(hass, entity("sensor.a", "20", { device_class: "temperature" }));
    add(
      hass,
      entity("sensor.b", "18.4", { device_class: "temperature" }),
      "room_b",
    );
    expect(view(hass).indoorTemperature).toBe("19,2");
    expect(
      view(hass, ["room_b", "unknown", "room_a"]).rooms.map((room) => room.id),
    ).toEqual(["room_b", "room_a"]);
    expect(view(hass, ["room_b"]).indoorTemperature).toBe("18,4");
    expect(view(hass, ["unknown"]).rooms).toEqual([]);
  });
  it("prefers explicit climate entities and uses device ownership unless an entity overrides it", () => {
    const hass = fixture();
    hass.devices.device_a = {
      id: "device_a",
      area_id: "room_b",
      name: "Climate device",
      name_by_user: null,
    };
    hass.areas.room_a.temperature_entity_id = "sensor.selected";
    hass.areas.room_a.humidity_entity_id = "sensor.selected_humidity";
    add(hass, entity("sensor.first", "12", { device_class: "temperature" }));
    add(hass, entity("sensor.selected", "21.1"));
    add(hass, entity("sensor.selected_humidity", "53"));
    add(
      hass,
      entity("sensor.device", "18", { device_class: "temperature" }),
      "",
      "device_a",
    );
    add(
      hass,
      entity("sensor.override", "900", { device_class: "carbon_dioxide" }),
      "room_a",
      "device_a",
    );
    expect(view(hass).rooms[0]).toMatchObject({
      temperature: "21,1",
      humidity: "53",
      co2: "900",
    });
    expect(view(hass).rooms[1].temperature).toBe("18,0");
  });
  it("excludes hidden and categorized sensors and lights, and excludes light groups from the count", () => {
    const hass = fixture();
    add(hass, entity("sensor.hidden", "25", { device_class: "temperature" }));
    hass.entities["sensor.hidden"].hidden = true;
    add(
      hass,
      entity("sensor.diagnostic", "28", { device_class: "temperature" }),
    );
    hass.entities["sensor.diagnostic"].entity_category = "diagnostic";
    add(hass, entity("sensor.real", "19", { device_class: "temperature" }));
    add(hass, entity("light.group", "on", { entity_id: ["light.lamp"] }));
    add(hass, entity("light.lamp", "on"));
    add(hass, entity("light.hidden", "on"));
    hass.entities["light.hidden"].hidden = true;
    add(hass, entity("light.other", "on"), "room_b");
    expect(view(hass, ["room_a"])).toMatchObject({
      indoorTemperature: "19,0",
      lightsOn: 1,
    });
    expect(view(hass).rooms[0].lightsOn).toBe(true);
  });
  it("keeps missing readings null and hides entity-dependent blocks", () => {
    const hass = fixture();
    add(
      hass,
      entity("sensor.invalid", "unavailable", { device_class: "temperature" }),
    );
    expect(view(hass)).toMatchObject({
      indoorTemperature: null,
      alarm: null,
      vacuum: null,
      weather: null,
      people: [],
      plugPower: null,
    });
    expect(view(hass).rooms[0]).toMatchObject({
      temperature: null,
      humidity: null,
      co2: null,
    });
  });
  it.each([
    "",
    " ",
    "unavailable",
    "unknown",
    "Infinity",
    "NaN",
    null,
    undefined,
    false,
    {},
  ])("treats %s as a missing number", (value) => {
    expect(numeric(value)).toBeNull();
  });
  it("keeps zero readings", () => {
    expect(numeric("0")).toBe(0);
  });
  it("localizes the greeting, date, weather and numbers", () => {
    const hass = fixture();
    add(hass, entity("weather.example", "cloudy", { temperature: 11 }));
    expect(view(hass)).toMatchObject({
      greeting: "Bonsoir Alex",
      date: "mercredi 21 octobre",
      weather: { temperature: "11,0", condition: "Nuageux" },
    });
    expect(
      buildHomeView(
        hass,
        { home_cards: null, rooms: null },
        new Date(2026, 9, 21, 17, 59),
      ).cards.find((card) => card.type === "summary")?.greeting,
    ).toBe("Bonjour Alex");
    hass.language = "en";
    for (const [hour, greeting] of [
      [8, "Good morning"],
      [13, "Good afternoon"],
      [18, "Good evening"],
    ] as const) {
      expect(
        buildHomeView(
          hass,
          { home_cards: null, rooms: null },
          new Date(2026, 9, 21, hour),
        ).cards.find((card) => card.type === "summary")?.greeting,
      ).toBe(`${greeting} Alex`);
    }
  });
  it("sorts people and identifies the current user and presence", () => {
    const hass = fixture();
    add(hass, entity("person.b", "away", { friendly_name: "Blair" }));
    add(
      hass,
      entity("person.a", "home", { friendly_name: "Alex", user_id: "user_a" }),
    );
    expect(view(hass).people).toEqual([
      { id: "person.a", name: "Alex", home: true, currentUser: true },
      { id: "person.b", name: "Blair", home: false, currentUser: false },
    ]);
  });
  it("counts only available visible openings and moisture sensors", () => {
    const hass = fixture();
    add(
      hass,
      entity("alarm_control_panel.example", "disarmed", { code_format: null }),
    );
    add(hass, entity("binary_sensor.door", "off", { device_class: "door" }));
    add(
      hass,
      entity("binary_sensor.window", "off", { device_class: "window" }),
    );
    add(
      hass,
      entity("binary_sensor.garage", "unavailable", {
        device_class: "garage_door",
      }),
    );
    add(
      hass,
      entity("binary_sensor.moisture", "off", { device_class: "moisture" }),
    );
    expect(view(hass).alarm).toMatchObject({
      title: "Alarme désarmée",
      subtitle: "2 ouvertures fermées · aucune fuite",
      tone: "green",
      action: { service: "alarm_arm_away" },
    });
    hass.states["binary_sensor.window"].state = "on";
    hass.states["binary_sensor.moisture"].state = "on";
    hass.states["alarm_control_panel.example"].state = "triggered";
    expect(view(hass).alarm).toMatchObject({
      subtitle: "1 ouverte · fuite détectée",
      tone: "red",
      action: { service: "alarm_disarm" },
    });
    hass.states["alarm_control_panel.example"].attributes.code_format =
      "number";
    expect(view(hass).alarm?.action).toBeNull();
  });
  it.each([
    "armed_away",
    "armed_home",
    "armed_night",
    "armed_vacation",
    "arming",
  ])("shows the amber alarm tone for %s", (state) => {
    const hass = fixture();
    add(hass, entity("alarm_control_panel.example", state));
    expect(view(hass).alarm?.tone).toBe("amber");
    expect(view(hass).alarm?.title).toBe(
      fr.alarm[state as keyof typeof fr.alarm],
    );
  });
  it("uses the vacuum battery attribute before a sensor on its own device", () => {
    const hass = fixture();
    add(
      hass,
      entity("vacuum.helper", "docked", {
        friendly_name: "Helper",
        battery_level: 90,
      }),
      "",
      "vacuum_a",
    );
    add(
      hass,
      entity("sensor.battery", "74", { device_class: "battery" }),
      "",
      "vacuum_a",
    );
    hass.entities["sensor.battery"].entity_category = "diagnostic";
    expect(view(hass).vacuum).toMatchObject({
      battery: "90",
      state: "À la base",
      action: { service: "start" },
    });
    delete hass.states["vacuum.helper"].attributes.battery_level;
    hass.states["vacuum.helper"].state = "cleaning";
    expect(view(hass).vacuum).toMatchObject({
      battery: "74",
      action: { service: "return_to_base" },
    });
  });
  it("totals smart plug power, converts kilowatts and chooses the device's preferred name", () => {
    const hass = fixture();
    hass.devices.plug_a = {
      id: "plug_a",
      area_id: null,
      name: "Plug A",
      name_by_user: "Appliance A",
    };
    hass.devices.plug_b = {
      id: "plug_b",
      area_id: null,
      name: "Appliance B",
      name_by_user: null,
    };
    add(hass, entity("switch.a", "on"), "", "plug_a");
    add(hass, entity("switch.b", "off"), "", "plug_b");
    add(
      hass,
      entity("sensor.a_power", "0.08", {
        device_class: "power",
        unit_of_measurement: "kW",
      }),
      "",
      "plug_a",
    );
    add(
      hass,
      entity("sensor.b_power", "12.4", {
        device_class: "power",
        unit_of_measurement: "W",
      }),
      "",
      "plug_b",
    );
    add(hass, entity("sensor.unrelated", "900", { device_class: "power" }));
    expect(view(hass).plugPower).toEqual({
      total: "92",
      topConsumer: "Appliance A 80 W",
    });
  });
  it("keeps a plug card with unavailable readings instead of claiming zero watts", () => {
    const hass = fixture();
    add(hass, entity("switch.a", "on"), "", "plug_a");
    add(
      hass,
      entity("sensor.a_power", "unavailable", { device_class: "power" }),
      "",
      "plug_a",
    );
    expect(view(hass).plugPower).toEqual({
      total: "Indisponible",
      topConsumer: "",
    });
  });
  it("has matching English and French message keys", () => {
    expect(Object.keys(fr)).toEqual(Object.keys(en));
    for (const key of ["alarm", "vacuum", "weather"] as const)
      expect(Object.keys(fr[key])).toEqual(Object.keys(en[key]));
  });
});

describe("dashboard configuration", () => {
  it("parses valid entries while dropping unknown, malformed, and duplicate entries", () => {
    expect(
      parseDashboardConfig({
        home_cards: [
          null,
          { id: "future", type: "future" },
          { id: "a", type: "summary" },
          { id: "a", type: "rooms" },
          { id: "bad", type: "alarm", entity_id: "vacuum.a" },
          {
            id: "e",
            type: "entities",
            title: "Devices",
            entity_ids: ["switch.a"],
          },
          {
            id: "broken",
            type: "entities",
            title: "Devices",
            entity_ids: ["bad"],
          },
        ],
        rooms: [
          { area_id: "room_b", co2_entity_id: null },
          { area_id: "room_b" },
          { area_id: "room_a", temperature_entity_id: 3 },
          null,
        ],
      }),
    ).toEqual({
      home_cards: [
        { id: "a", type: "summary" },
        {
          id: "e",
          type: "entities",
          title: "Devices",
          entity_ids: ["switch.a"],
        },
      ],
      rooms: [{ area_id: "room_b", co2_entity_id: null }],
    });
    for (const value of [null, undefined, {}, { home_cards: 3, rooms: "bad" }])
      expect(parseDashboardConfig(value)).toEqual({
        home_cards: null,
        rooms: null,
      });
    expect(parseDashboardConfig({ home_cards: [], rooms: [] })).toEqual({
      home_cards: [],
      rooms: [],
    });
  });
  it("resolves automatic cards in order using the first alarm and vacuum and the plug rule", () => {
    const hass = fixture();
    add(hass, entity("person.a", "home"));
    add(hass, entity("alarm_control_panel.a", "disarmed"));
    add(hass, entity("alarm_control_panel.b", "armed_away"));
    add(hass, entity("vacuum.a", "docked"));
    add(hass, entity("vacuum.b", "cleaning"));
    add(
      hass,
      entity("sensor.power", "90", { device_class: "power" }),
      "",
      "plug",
    );
    expect(
      resolveDashboardConfig(hass, {
        home_cards: null,
        rooms: null,
      }).home_cards.map((card) => card.type),
    ).toEqual(["summary", "presence", "alarm", "vacuum", "rooms"]);
    add(hass, entity("switch.plug", "on"), "", "plug");
    const resolved = resolveDashboardConfig(hass, {
      home_cards: null,
      rooms: null,
    });
    expect(resolved.home_cards).toEqual([
      { id: "auto-summary", type: "summary" },
      { id: "auto-presence", type: "presence" },
      { id: "auto-alarm", type: "alarm", entity_id: "alarm_control_panel.a" },
      { id: "auto-vacuum", type: "vacuum", entity_id: "vacuum.a" },
      { id: "auto-rooms", type: "rooms" },
      { id: "auto-power", type: "power" },
    ]);
    expect(resolved.rooms).toEqual([
      { area_id: "room_a" },
      { area_id: "room_b" },
    ]);
  });
  it("uses saved order and visibility and selects the configured alarm and vacuum", () => {
    const hass = fixture();
    add(hass, entity("alarm_control_panel.a", "disarmed"));
    add(hass, entity("alarm_control_panel.b", "triggered"));
    add(hass, entity("vacuum.a", "docked"));
    add(hass, entity("vacuum.b", "cleaning"));
    const result = buildHomeView(
      hass,
      {
        rooms: [],
        home_cards: [
          { id: "v", type: "vacuum", entity_id: "vacuum.b" },
          { id: "a", type: "alarm", entity_id: "alarm_control_panel.b" },
          { id: "r", type: "rooms" },
        ],
      },
      now,
    );
    expect(result.cards.map((card) => card.id)).toEqual(["v", "a", "r"]);
    expect(result.cards[0]).toMatchObject({
      vacuum: { action: { entityId: "vacuum.b", service: "return_to_base" } },
    });
    expect(result.cards[1]).toMatchObject({
      alarm: { tone: "red", action: { entityId: "alarm_control_panel.b" } },
    });
    expect(result.cards[2]).toMatchObject({ rooms: [] });
    expect(buildHomeView(hass, { rooms: null, home_cards: [] }, now)).toEqual({
      cards: [],
    });
  });
  it("applies room overrides before registry preferences and keeps null overrides automatic", () => {
    const hass = fixture();
    hass.areas.room_a.temperature_entity_id = "sensor.registry";
    add(hass, entity("sensor.registry", "15"));
    add(hass, entity("sensor.override", "22"));
    add(hass, entity("sensor.humidity", "45", { device_class: "humidity" }));
    add(hass, entity("sensor.co2", "700"));
    const result = buildHomeView(
      hass,
      {
        home_cards: [{ id: "r", type: "rooms" }],
        rooms: [
          {
            area_id: "room_a",
            temperature_entity_id: "sensor.override",
            humidity_entity_id: null,
            co2_entity_id: "sensor.co2",
          },
        ],
      },
      now,
    );
    expect(result.cards[0]).toMatchObject({
      rooms: [{ temperature: "22,0", humidity: "45", co2: "700" }],
    });
  });
  it("keeps missing configured entities visible and exposes toggles only for supported domains", () => {
    const hass = fixture();
    for (const domain of [
      "switch",
      "light",
      "fan",
      "input_boolean",
      "sensor",
      "lock",
    ])
      add(hass, entity(`${domain}.a`, "on", { friendly_name: domain }));
    add(hass, entity("switch.offline", "unavailable"));
    const ids = [
      "sensor.missing",
      "switch.a",
      "light.a",
      "fan.a",
      "input_boolean.a",
      "sensor.a",
      "lock.a",
      "switch.offline",
    ];
    const result = buildHomeView(
      hass,
      {
        rooms: null,
        home_cards: [
          { id: "e", type: "entities", title: "Devices", entity_ids: ids },
          { id: "a", type: "alarm", entity_id: "alarm_control_panel.missing" },
          { id: "v", type: "vacuum", entity_id: "vacuum.missing" },
          { id: "p", type: "power" },
        ],
      },
      now,
    );
    const card = result.cards[0];
    if (card.type !== "entities") throw new Error("Expected entities card");
    expect(card.entities.map((row) => row.id)).toEqual(ids);
    expect(card.entities[0]).toMatchObject({
      name: "sensor.missing",
      state: "Indisponible",
      action: null,
    });
    expect(card.entities.slice(1, 5).map((row) => row.action)).toEqual(
      ids.slice(1, 5).map((entityId) => ({
        domain: "homeassistant",
        service: "toggle",
        entityId,
        label: entityId.split(".")[0],
      })),
    );
    expect(card.entities.slice(5, 7).every((row) => row.action === null)).toBe(
      true,
    );
    expect(card.entities[7]).toMatchObject({
      available: false,
      action: { domain: "homeassistant", service: "toggle" },
    });
    expect(result.cards[1]).toMatchObject({
      alarm: { title: "Alarme indisponible", action: null },
    });
    expect(result.cards[2]).toMatchObject({
      vacuum: { state: "Indisponible", action: null },
    });
    expect(result.cards[3]).toMatchObject({
      plugPower: { total: "Indisponible" },
    });
  });
});
