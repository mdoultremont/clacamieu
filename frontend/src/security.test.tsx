import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Security } from "./components/security";
import { DevelopmentWriteBlocked } from "./dev-hass";
import { PortalContainerContext } from "./portal-container";
import { buildSecurityView } from "./security-view";
import type { HassLike } from "./types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let container: HTMLDivElement;
let portal: HTMLDivElement;
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  portal?.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function fixture(): HassLike {
  return {
    states: {
      "alarm_control_panel.example": {
        entity_id: "alarm_control_panel.example",
        state: "disarmed",
        attributes: {
          supported_features: 4,
          code_format: "number",
          code_arm_required: true,
        },
        last_changed: "2026-10-21T15:00:00Z",
        last_updated: "2026-10-21T15:00:00Z",
        context: { id: "test", parent_id: null, user_id: null },
      },
      "camera.example": {
        entity_id: "camera.example",
        state: "idle",
        attributes: {
          friendly_name: "Entry camera",
          entity_picture: "/api/camera_proxy/camera.example?token=example",
        },
        last_changed: "",
        last_updated: "",
        context: { id: "test", parent_id: null, user_id: null },
      },
    },
    entities: {},
    devices: {},
    areas: {},
    panels: {},
    user: { id: "example", name: "Example", is_admin: false },
    language: "en",
    callService: vi.fn().mockResolvedValue(null),
    callWS: vi.fn(),
    hassUrl: (path) => `https://example.test${path}`,
  };
}
async function mount(hass: HassLike) {
  container = document.createElement("div");
  portal = document.createElement("div");
  document.body.append(container, portal);
  root = createRoot(container);
  const onCamera = vi.fn();
  await act(async () =>
    root.render(
      <PortalContainerContext value={portal}>
        <Security
          hass={hass}
          view={buildSecurityView(
            hass,
            { home_cards: null, rooms: null },
            new Date(),
          )}
          onCamera={onCamera}
        />
      </PortalContainerContext>,
    ),
  );
  return onCamera;
}
const button = (scope: ParentNode, name: string) =>
  Array.from(scope.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => button.textContent === name,
  )!;
async function enterCode(code: string) {
  const input = portal.querySelector<HTMLInputElement>("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, code);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("security controls", () => {
  it("opens a panel-container dialog and sends a code only after confirmation", async () => {
    const hass = fixture();
    await mount(hass);
    expect(container.querySelector('[data-state="on"]')?.textContent).toBe(
      "Disarmed",
    );
    await act(async () => button(container, "Night").click());
    expect(hass.callService).not.toHaveBeenCalled();
    expect(portal.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(portal.textContent).toContain("Arm in Night mode?");
    expect(portal.querySelector("input")?.type).toBe("password");
    expect(portal.querySelector("input")?.inputMode).toBe("numeric");
    expect(button(portal, "Confirm").disabled).toBe(true);
    await enterCode("1234");
    await act(async () => button(portal, "Confirm").click());
    expect(hass.callService).toHaveBeenCalledExactlyOnceWith(
      "alarm_control_panel",
      "alarm_arm_night",
      { code: "1234" },
      { entity_id: "alarm_control_panel.example" },
    );
    expect(portal.querySelector('[role="alertdialog"]')).toBeNull();
    expect(container.querySelector('[data-state="on"]')?.textContent).toBe(
      "Disarmed",
    );
  });
  it.each([
    [new Error("Invalid alarm code"), "Check the code"],
    [{ code: "invalid_code", message: "Invalid alarm code" }, "Check the code"],
    [new DevelopmentWriteBlocked("blocked"), "blocked in development"],
  ])(
    "keeps rejected confirmations inline for retry",
    async (reason, message) => {
      const hass = fixture();
      hass.callService = vi.fn().mockRejectedValue(reason);
      await mount(hass);
      await act(async () => button(container, "Night").click());
      await enterCode("9999");
      await act(async () => button(portal, "Confirm").click());
      expect(portal.querySelector('[role="alert"]')?.textContent).toContain(
        message,
      );
      expect(button(portal, "Confirm").disabled).toBe(false);
      await act(async () => button(portal, "Cancel").click());
      await act(async () => button(container, "Night").click());
      expect(portal.querySelector("input")?.value).toBe("");
      expect(portal.querySelector('[role="alert"]')).toBeNull();
    },
  );
  it("sends the code when disarming", async () => {
    const hass = fixture();
    hass.states["alarm_control_panel.example"].state = "armed_night";
    await mount(hass);
    await act(async () => button(container, "Disarmed").click());
    expect(portal.textContent).toContain("Disarm the alarm?");
    await enterCode("1234");
    await act(async () => button(portal, "Confirm").click());
    expect(hass.callService).toHaveBeenLastCalledWith(
      "alarm_control_panel",
      "alarm_disarm",
      { code: "1234" },
      { entity_id: "alarm_control_panel.example" },
    );
  });
  it("confirms code-free arming and disables an unavailable alarm", async () => {
    const hass = fixture();
    hass.states["alarm_control_panel.example"].attributes.code_format = null;
    hass.states["alarm_control_panel.example"].attributes.code_arm_required =
      false;
    await mount(hass);
    await act(async () => button(container, "Night").click());
    expect(portal.querySelector("input")).toBeNull();
    await act(async () => button(portal, "Confirm").click());
    expect(hass.callService).toHaveBeenCalledExactlyOnceWith(
      "alarm_control_panel",
      "alarm_arm_night",
      {},
      { entity_id: "alarm_control_panel.example" },
    );
    hass.states["alarm_control_panel.example"].state = "unavailable";
    await act(async () =>
      root.render(
        <PortalContainerContext value={portal}>
          <Security
            hass={hass}
            view={buildSecurityView(
              hass,
              { home_cards: null, rooms: null },
              new Date(),
            )}
            onCamera={vi.fn()}
          />
        </PortalContainerContext>,
      ),
    );
    expect(button(container, "Night").disabled).toBe(true);
  });
  it("resolves camera URLs, refreshes only while visible and handles failed images", async () => {
    vi.useFakeTimers();
    const hass = fixture();
    const onCamera = await mount(hass);
    let image = container.querySelector("img")!;
    expect(image.src).toMatch(
      /^https:\/\/example.test\/api\/camera_proxy\/camera.example\?token=example&_clacamieu=/,
    );
    expect(container.textContent).toContain("Loading image");
    await act(async () => image.dispatchEvent(new Event("load")));
    expect(container.textContent).not.toContain("Loading image");
    const initial = image.src;
    await act(async () => vi.advanceTimersByTime(10_000));
    expect(image.src).not.toBe(initial);
    const refreshed = image.src;
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await act(async () =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await act(async () => vi.advanceTimersByTime(20_000));
    expect(image.src).toBe(refreshed);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    await act(async () =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    expect(image.src).not.toBe(refreshed);
    await act(async () => image.dispatchEvent(new Event("error")));
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("Unavailable");
    await act(async () => button(container, "UnavailableEntry camera").click());
    expect(onCamera).toHaveBeenCalledOnce();
    await act(async () => vi.advanceTimersByTime(10_000));
    image = container.querySelector("img")!;
    expect(image).not.toBeNull();
  });
});
