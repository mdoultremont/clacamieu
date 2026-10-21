import { describe, expect, it, vi } from "vitest";
import { buildSecurityView } from "./security-view";
import type { DashboardConfig, HassEntity, HassLike } from "./types";

const now = new Date("2026-10-21T18:00:00Z");
const config: DashboardConfig = { home_cards: null, rooms: null };
export function securityFixture(): HassLike {
  const states: HassLike["states"] = {};
  const add = (
    id: string,
    state: string,
    attributes: HassEntity["attributes"] = {},
  ) => {
    states[id] = {
      entity_id: id,
      state,
      attributes,
      last_changed: "2026-10-21T15:00:00Z",
      last_updated: "2026-10-21T15:00:00Z",
      context: { id: "test", parent_id: null, user_id: null },
    };
  };
  add("alarm_control_panel.example", "disarmed", {
    friendly_name: "House alarm",
    supported_features: 1 | 2 | 4 | 16 | 32,
    changed_by: "Alex Example",
    code_format: null,
    code_arm_required: false,
  });
  add("camera.entry", "idle", {
    friendly_name: "Entry camera",
    entity_picture: "/api/camera_proxy/camera.entry?token=example",
  });
  add("camera.offline", "unavailable", {
    entity_picture: "/api/camera_proxy/camera.offline?token=example",
  });
  add("camera.hidden", "idle", { entity_picture: "/example" });
  add("camera.diagnostic", "idle", { entity_picture: "/example" });
  add("binary_sensor.window", "off", {
    friendly_name: "Window",
    device_class: "window",
  });
  add("binary_sensor.door", "on", {
    friendly_name: "Door",
    device_class: "door",
  });
  add("binary_sensor.garage", "off", {
    friendly_name: "Garage",
    device_class: "garage_door",
  });
  add("binary_sensor.dry", "off", {
    friendly_name: "Dry sensor",
    device_class: "moisture",
  });
  add("binary_sensor.leak", "on", {
    friendly_name: "Wet sensor",
    device_class: "moisture",
  });
  for (const device_class of ["smoke", "gas", "carbon_monoxide", "safety"]) {
    add(`binary_sensor.${device_class}`, "off", { device_class });
  }
  return {
    states,
    entities: {
      "camera.hidden": { entity_id: "camera.hidden", hidden: true },
      "camera.diagnostic": {
        entity_id: "camera.diagnostic",
        entity_category: "diagnostic",
      },
      "binary_sensor.door": {
        entity_id: "binary_sensor.door",
        device_id: "example",
      },
      "binary_sensor.window": {
        entity_id: "binary_sensor.window",
        area_id: "room",
      },
    },
    devices: {
      example: {
        id: "example",
        area_id: "room",
        name: null,
        name_by_user: null,
      },
    },
    areas: { room: { area_id: "room", name: "Room A", icon: null } },
    panels: {},
    language: "fr",
    user: { id: "test", name: "Alex Example", is_admin: true },
    callWS: vi.fn(),
    callService: vi.fn().mockResolvedValue(null),
  };
}

describe("security view", () => {
  it("derives Alarmo state, actor, supported modes and confirmations", () => {
    const view = buildSecurityView(securityFixture(), config, now);
    expect(view.alarm).toMatchObject({
      id: "alarm_control_panel.example",
      title: "Alarme désarmée",
      state: "disarmed",
      available: true,
    });
    expect(view.alarm?.description).toMatch(
      /^Depuis \d{2}:\d{2} · par Alex Example$/,
    );
    expect(
      view.alarm?.modes.map((mode) => [
        mode.state,
        mode.service,
        mode.needsCode,
      ]),
    ).toEqual([
      ["disarmed", "alarm_disarm", false],
      ["armed_home", "alarm_arm_home", false],
      ["armed_away", "alarm_arm_away", false],
      ["armed_night", "alarm_arm_night", false],
      ["armed_vacation", "alarm_arm_vacation", false],
      ["armed_custom_bypass", "alarm_arm_custom_bypass", false],
    ]);
    expect(view.alarm?.modes[3].confirmation).toBe("Armer en mode Nuit ?");
    expect(view.alarm?.modes[0].confirmation).toBe("Désarmer l'alarme ?");
  });
  it("uses the configured alarm and omits unsupported modes", () => {
    const hass = securityFixture();
    hass.states["alarm_control_panel.selected"] = {
      ...hass.states["alarm_control_panel.example"],
      entity_id: "alarm_control_panel.selected",
      attributes: { supported_features: 4 },
    };
    const view = buildSecurityView(
      hass,
      {
        ...config,
        home_cards: [
          {
            id: "alarm",
            type: "alarm",
            entity_id: "alarm_control_panel.selected",
          },
        ],
      },
      now,
    );
    expect(view.alarm?.id).toBe("alarm_control_panel.selected");
    expect(view.alarm?.modes.map((mode) => mode.state)).toEqual([
      "disarmed",
      "armed_night",
    ]);
  });
  it.each(["number", "text"])(
    "with code_format %s, asks for a code to disarm and to arm only when arming requires one",
    (format) => {
      const hass = securityFixture();
      const attributes = hass.states["alarm_control_panel.example"].attributes;
      attributes.code_format = format;
      attributes.code_arm_required = false;
      let modes = buildSecurityView(hass, config, now).alarm!.modes;
      expect(modes[0]).toMatchObject({ state: "disarmed", needsCode: true });
      expect(modes.slice(1).some((mode) => mode.needsCode)).toBe(false);
      attributes.code_arm_required = true;
      modes = buildSecurityView(hass, config, now).alarm!.modes;
      expect(modes.every((mode) => mode.needsCode)).toBe(true);
    },
  );
  it("asks for no code without a code format, like Home Assistant's own controls", () => {
    const hass = securityFixture();
    hass.states["alarm_control_panel.example"].attributes.code_arm_required =
      true;
    expect(
      buildSecurityView(hass, config, now).alarm!.modes.some(
        (mode) => mode.needsCode,
      ),
    ).toBe(false);
  });
  it("falls back to the first alarm when the configured one no longer exists", () => {
    const view = buildSecurityView(
      securityFixture(),
      {
        home_cards: [
          { id: "a", type: "alarm", entity_id: "alarm_control_panel.removed" },
        ],
        rooms: null,
      },
      now,
    );
    expect(view.alarm?.id).toBe("alarm_control_panel.example");
  });
  it("omits the alarm group when no alarm exists", () => {
    const hass = securityFixture();
    delete hass.states["alarm_control_panel.example"];
    expect(buildSecurityView(hass, config, now).alarm).toBeNull();
  });
  it("shows one camera per device and leaves out vacuum maps", () => {
    const hass = securityFixture();
    const add = (id: string, state: string, device: string) => {
      hass.states[id] = {
        ...hass.states["camera.entry"],
        entity_id: id,
        state,
        attributes: { friendly_name: id, entity_picture: `/${id}` },
      };
      hass.entities[id] = { entity_id: id, device_id: device };
    };
    add("camera.porch_snapshots", "unavailable", "porch");
    add("camera.porch_fluent", "idle", "porch");
    add("camera.porch_clear", "idle", "porch");
    add("camera.robot_map", "idle", "robot");
    add("vacuum.robot", "docked", "robot");
    const ids = buildSecurityView(hass, config, now).cameras.map(
      (camera) => camera.id,
    );
    expect(ids.filter((id) => id.startsWith("camera.porch"))).toEqual([
      "camera.porch_fluent",
    ]);
    expect(ids).not.toContain("camera.robot_map");
  });
  it("filters cameras and gives unavailable cameras a placeholder", () => {
    const view = buildSecurityView(securityFixture(), config, now);
    expect(view.cameras).toEqual([
      {
        id: "camera.entry",
        name: "Entry camera",
        picture: "/api/camera_proxy/camera.entry?token=example",
      },
      { id: "camera.offline", name: "camera.offline", picture: null },
    ]);
  });
  it("sorts open openings and leaks first, with area and relative change time", () => {
    const view = buildSecurityView(securityFixture(), config, now);
    expect(view.openings).toMatchObject({ summary: "1 ouverte", alert: true });
    expect(view.openings.sensors[0]).toMatchObject({
      id: "binary_sensor.door",
      state: "Ouvert",
      active: true,
      description: expect.stringMatching(/^Room A · il y a 3\s+h$/),
    });
    expect(view.leaks).toMatchObject({
      summary: "1 fuite détectée",
      alert: true,
    });
    expect(view.leaks.sensors[0]).toMatchObject({
      id: "binary_sensor.leak",
      active: true,
    });
    expect(view.detectors.sensors).toHaveLength(4);
  });
  it("shows closed counts and counts offline sensors separately", () => {
    const hass = securityFixture();
    hass.states["binary_sensor.door"].state = "off";
    hass.states["binary_sensor.leak"].state = "off";
    let view = buildSecurityView(hass, config, now);
    expect(view.openings.summary).toBe("3 / 3 fermées");
    expect(view.leaks.summary).toBe("Aucune fuite");
    hass.states["binary_sensor.garage"].state = "unavailable";
    hass.states["binary_sensor.leak"].state = "unknown";
    view = buildSecurityView(hass, config, now);
    expect(view.openings.summary).toBe("2 / 3 fermées · 1 indisponible");
    expect(view.leaks.summary).toBe("Aucune fuite · 1 indisponible");
    expect(
      view.leaks.sensors.find((sensor) => sensor.id === "binary_sensor.leak")
        ?.state,
    ).toBe("Indisponible");
  });
  it("handles missing timestamps, actors, and detector groups with English copy", () => {
    const hass = securityFixture();
    hass.language = "en";
    hass.states["alarm_control_panel.example"].last_changed = "";
    delete hass.states["alarm_control_panel.example"].attributes.changed_by;
    for (const id of ["smoke", "gas", "carbon_monoxide", "safety"])
      delete hass.states[`binary_sensor.${id}`];
    hass.states["binary_sensor.door"].last_changed = "";
    const view = buildSecurityView(hass, config, now);
    expect(view.alarm?.description).toBe("");
    expect(view.openings.sensors[0].description).toBe("Room A");
    expect(view.detectors.sensors).toEqual([]);
    expect(view.alarm?.modes[1].label).toBe("Home");
    expect(view.leaks.summary).toBe("1 leak detected");
  });
});
