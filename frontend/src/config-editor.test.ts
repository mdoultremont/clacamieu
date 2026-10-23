import { describe, expect, it, vi } from "vitest";
import {
  configEditorReducer as reduce,
  createConfigEditor,
  defaultCard,
  editorLists,
  moveItem,
  newCardId,
} from "./config-editor";
import type { DashboardConfig, HassLike, HomeCard } from "./types";

const hass: HassLike = {
  states: {},
  entities: {},
  devices: {},
  panels: {},
  areas: {
    a: { area_id: "a", name: "Room A", icon: null },
    b: { area_id: "b", name: "Room B", icon: null },
  },
  user: { id: "user", name: "Example", is_admin: true },
  language: "en",
  callService: vi.fn(),
  callWS: vi.fn(),
};
const cards: HomeCard[] = [
  { id: "s", type: "summary" },
  {
    id: "e",
    type: "entities",
    title: "Devices",
    entity_ids: ["sensor.one", "sensor.two"],
  },
];
const config: DashboardConfig = {
  home_cards: cards,
  rooms: [{ area_id: "b", temperature_entity_id: "sensor.override" }],
};

describe("card ids", () => {
  it("are unique without randomUUID, as on a plain HTTP origin", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto),
    });
    try {
      const ids = new Set(Array.from({ length: 50 }, () => newCardId()));
      expect(ids.size).toBe(50);
      for (const id of ids) expect(id).toMatch(/^[0-9a-f]{32}$/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("configuration draft", () => {
  it("materializes automatic cards and rooms in registry order", () => {
    const state = createConfigEditor({ home_cards: null, rooms: null }, hass);
    expect(state.config).toEqual({
      home_cards: [
        { id: "auto-summary", type: "summary" },
        { id: "auto-rooms", type: "rooms" },
      ],
      rooms: [{ area_id: "a" }, { area_id: "b" }],
    });
  });
  it("appends missing areas hidden while retaining saved options and order", () => {
    expect(createConfigEditor(config, hass).config.rooms).toEqual([
      { area_id: "b", temperature_entity_id: "sensor.override" },
      { area_id: "a", hidden: true },
    ]);
    expect(
      createConfigEditor({ home_cards: [], rooms: [] }, hass).config.rooms,
    ).toEqual([
      { area_id: "a", hidden: true },
      { area_id: "b", hidden: true },
    ]);
  });
  it("keeps options and position through hiding, reordering, and showing", () => {
    let state = createConfigEditor(config, hass);
    state = reduce(state, { type: "toggle-card", id: "e" });
    state = reduce(state, {
      type: "reorder",
      list: "home_cards",
      from: 1,
      to: 0,
    });
    expect(state.config.home_cards?.[0]).toEqual({ ...cards[1], hidden: true });
    state = reduce(state, { type: "toggle-card", id: "e" });
    state = reduce(state, { type: "toggle-room", areaId: "b" });
    state = reduce(state, { type: "reorder", list: "rooms", from: 0, to: 1 });
    expect(state.config.home_cards?.[0]).toEqual({
      ...cards[1],
      hidden: false,
    });
    expect(state.config.rooms?.[1]).toEqual({
      ...config.rooms![0],
      hidden: true,
    });
    expect(config.home_cards).toEqual([
      { id: "s", type: "summary" },
      {
        id: "e",
        type: "entities",
        title: "Devices",
        entity_ids: ["sensor.one", "sensor.two"],
      },
    ]);
  });
  it("adds, edits each option shape, reorders entities and removes cards", () => {
    let state = createConfigEditor(config, hass);
    for (const card of [
      { id: "alarm", type: "alarm", entity_id: "alarm_control_panel.example" },
      { id: "vacuum", type: "vacuum", entity_id: "vacuum.example" },
      { id: "rooms", type: "rooms" },
      { id: "power", type: "power" },
    ] satisfies HomeCard[])
      state = reduce(state, { type: "add-card", card });
    state = reduce(state, {
      type: "edit-card",
      card: {
        id: "alarm",
        type: "alarm",
        entity_id: "alarm_control_panel.other",
      },
    });
    state = reduce(state, {
      type: "edit-card",
      card: { id: "vacuum", type: "vacuum", entity_id: "vacuum.other" },
    });
    state = reduce(state, {
      type: "edit-card",
      card: {
        id: "e",
        type: "entities",
        title: "Updated",
        entity_ids: ["sensor.one", "sensor.two"],
      },
    });
    state = reduce(state, {
      type: "entity-add",
      id: "e",
      entityId: "sensor.three",
    });
    state = reduce(state, { type: "entity-reorder", id: "e", from: 2, to: 0 });
    state = reduce(state, { type: "entity-remove", id: "e", index: 2 });
    state = reduce(state, {
      type: "edit-room",
      room: {
        area_id: "b",
        temperature_entity_id: null,
        humidity_entity_id: "sensor.humidity",
        co2_entity_id: "sensor.co2",
      },
    });
    state = reduce(state, { type: "remove-card", id: "s" });
    expect(state.config.home_cards).toEqual([
      {
        id: "e",
        type: "entities",
        title: "Updated",
        entity_ids: ["sensor.three", "sensor.one"],
      },
      { id: "alarm", type: "alarm", entity_id: "alarm_control_panel.other" },
      { id: "vacuum", type: "vacuum", entity_id: "vacuum.other" },
      { id: "rooms", type: "rooms" },
      { id: "power", type: "power" },
    ]);
    expect(state.config.rooms?.[0]).toEqual({
      area_id: "b",
      temperature_entity_id: null,
      humidity_entity_id: "sensor.humidity",
      co2_entity_id: "sensor.co2",
    });
  });
  it("resets to null without immediately persisting automatic lists, and can edit again", () => {
    let state = reduce(createConfigEditor(config, hass), { type: "reset" });
    expect(state.config).toEqual({ home_cards: null, rooms: null });
    expect(editorLists(state).rooms).toEqual([
      { area_id: "a" },
      { area_id: "b" },
    ]);
    state = reduce(state, { type: "toggle-room", areaId: "a" });
    expect(state.config.rooms?.[0]).toEqual({ area_id: "a", hidden: true });
  });
  it("does not reorder past bounds and cannot create an invalid alarm default", () => {
    expect(moveItem(cards, 0, -1)).toBe(cards);
    expect(moveItem(cards, 1, 2)).toBe(cards);
    expect(defaultCard("alarm", "new", hass, "Entities")).toBeNull();
    expect(defaultCard("entities", "new", hass, "Entities")).toEqual({
      id: "new",
      type: "entities",
      title: "Entities",
      entity_ids: [],
    });
  });
});
