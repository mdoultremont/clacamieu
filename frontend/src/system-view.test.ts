import { describe, expect, it, vi } from "vitest";
import { buildSystemView } from "./system-view";
import type { HassEntity, HassLike } from "./types";

function fixture() {
  const hass: HassLike = {
    states: {},
    entities: {},
    devices: {
      device: { id: "device", area_id: "room", name: null, name_by_user: null },
    },
    areas: { room: { area_id: "room", name: "Study", icon: null } },
    panels: {},
    user: { id: "u", name: "Example", is_admin: false },
    language: "en",
    callService: vi.fn(),
    callWS: vi.fn(),
  };
  const add = (
    id: string,
    state: string,
    attributes: HassEntity["attributes"] = {},
  ) => {
    hass.states[id] = {
      entity_id: id,
      state,
      attributes,
      last_changed: "2026-10-21T11:00:00Z",
      last_updated: "",
      context: { id: "t", parent_id: null, user_id: null },
    };
    hass.entities[id] = { entity_id: id, device_id: "device" };
  };
  return { hass, add };
}
const now = new Date("2026-10-21T12:00:00Z");
describe("system view", () => {
  it("groups unavailable visible non-diagnostic entities by device, with area and duration", () => {
    const { hass, add } = fixture();
    hass.devices.device.name = "Desk sensor";
    for (const id of [
      "sensor.offline",
      "sensor.hidden",
      "sensor.diagnostic",
      "switch.config",
      "sensor.loose",
    ])
      add(id, "unavailable");
    hass.entities["sensor.hidden"].hidden = true;
    hass.entities["sensor.diagnostic"].entity_category = "diagnostic";
    hass.entities["switch.config"].entity_category = "config";
    hass.entities["sensor.loose"] = { entity_id: "sensor.loose", area_id: "room" };
    expect(buildSystemView(hass, now).unavailable).toEqual([
      {
        id: "sensor.offline",
        name: "Desk sensor",
        area: "Study",
        since: "1 hour ago",
        entities: 2,
      },
      {
        id: "sensor.loose",
        name: "sensor.loose",
        area: "Study",
        since: "1 hour ago",
        entities: 1,
      },
    ]);
    for (const id of ["sensor.offline", "switch.config"])
      hass.states[id].last_changed = "";
    expect(buildSystemView(hass, now).unavailable[0].since).toBe(
      "Unknown duration",
    );
  });
  it("includes battery diagnostic sensors, sorts ascending and excludes 40 percent and invalid levels", () => {
    const { hass, add } = fixture();
    for (const [id, value] of Object.entries({
      a: "39",
      b: "0",
      c: "40",
      d: "unavailable",
      e: "-1",
    }))
      add(`sensor.${id}`, value, {
        device_class: "battery",
        unit_of_measurement: "%",
      });
    add("sensor.voltage", "3", {
      device_class: "battery",
      unit_of_measurement: "V",
    });
    hass.entities["sensor.a"].entity_category = "diagnostic";
    expect(
      buildSystemView(hass, now).batteries.map(({ id, value }) => [id, value]),
    ).toEqual([
      ["sensor.b", "0 %"],
      ["sensor.a", "39 %"],
    ]);
  });
  it("shows only visible pending updates with both versions and translates fallback labels", () => {
    const { hass, add } = fixture();
    add("update.pending", "on", {
      installed_version: "1.0",
      latest_version: "2.0",
    });
    add("update.current", "off");
    add("update.hidden", "on");
    hass.entities["update.hidden"].hidden = true;
    expect(buildSystemView(hass, now).updates).toEqual([
      {
        id: "update.pending",
        name: "update.pending",
        area: "Study",
        installed: "1.0",
        latest: "2.0",
      },
    ]);
    hass.language = "fr";
    delete hass.states["update.pending"].attributes.latest_version;
    expect(buildSystemView(hass, now).updates[0].latest).toBe(
      "Version inconnue",
    );
  });
});
