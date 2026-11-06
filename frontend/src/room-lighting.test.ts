import { describe, expect, it } from "vitest";
import { buildRoomLighting, lightingControllers } from "./room-lighting";
import type { HassEntity, HassLike } from "./types";

function entity(
  entity_id: string,
  state: string,
  attributes: Record<string, unknown> = {},
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

function hass(states: HassEntity[]): HassLike {
  return {
    states: Object.fromEntries(states.map((state) => [state.entity_id, state])),
    entities: Object.fromEntries(
      states.map((state) => [
        state.entity_id,
        { entity_id: state.entity_id, area_id: "living" },
      ]),
    ),
    devices: {},
    areas: { living: { area_id: "living", name: "Living", icon: null } },
    panels: {},
    user: { id: "u", name: "U", is_admin: true },
    language: "en",
    callService: async () => undefined,
    callWS: async <T,>() => undefined as T,
  };
}

const group = entity("light.main", "on", {
  friendly_name: "Main",
  entity_id: ["light.a", "light.b"],
  brightness: 128,
  supported_color_modes: ["color_temp"],
});

describe("buildRoomLighting", () => {
  it("drives the room through its lighting controller script", () => {
    const lighting = buildRoomLighting(
      hass([
        group,
        entity("light.a", "on"),
        entity("script.living_lights", "off"),
        entity("scene.evening", "", { friendly_name: "Evening" }),
      ]),
      "living",
      lightingControllers({
        script: { living_lights: { fields: { command: {} } } },
      }),
    );
    expect(lighting).toMatchObject({
      entityId: "light.main",
      on: true,
      brightness: 50,
      dimmable: true,
      toggle: {
        domain: "script",
        service: "turn_on",
        entityId: "script.living_lights",
        data: { variables: { command: "toggle" } },
      },
      scenes: [
        {
          name: "Evening",
          action: {
            domain: "script",
            entityId: "script.living_lights",
            data: {
              variables: { command: "set_scene", scene: "scene.evening" },
            },
          },
        },
      ],
    });
  });

  it("toggles the main light and activates scenes directly without a controller", () => {
    const lighting = buildRoomLighting(
      hass([
        group,
        entity("light.a", "off"),
        entity("script.other", "off"),
        entity("scene.evening", ""),
      ]),
      "living",
      new Set(),
    );
    expect(lighting?.toggle).toMatchObject({
      domain: "light",
      service: "toggle",
      entityId: "light.main",
    });
    expect(lighting?.scenes[0].action).toMatchObject({
      domain: "scene",
      service: "turn_on",
      entityId: "scene.evening",
    });
  });

  it("has no room control when several lights have no group", () => {
    expect(
      buildRoomLighting(
        hass([entity("light.a", "on"), entity("light.b", "off")]),
        "living",
        new Set(),
      ),
    ).toBeNull();
  });
});
