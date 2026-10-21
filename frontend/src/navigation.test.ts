import { afterEach, describe, expect, it, vi } from "vitest";
import { navigate, parseRoute, routePath, type Route } from "./navigation";

afterEach(() => {
  vi.restoreAllMocks();
  history.replaceState(null, "", "/");
});
describe("Maison routes", () => {
  it.each<[string, Route]>([
    ["/clacamieu", { screen: "home" }],
    ["/clacamieu/", { screen: "home" }],
    ["/clacamieu/pieces", { screen: "rooms" }],
    ["/clacamieu/pieces/room_a", { screen: "room", areaId: "room_a" }],
    ["/clacamieu/pieces/room%20a", { screen: "room", areaId: "room a" }],
    ["/clacamieu/plus", { screen: "more" }],
    ["/clacamieu/configuration", { screen: "configuration" }],
  ])("parses %s and round trips through its canonical path", (path, route) => {
    expect(parseRoute(path)).toEqual(route);
    expect(parseRoute(routePath(route))).toEqual(route);
  });
  it.each([
    "/",
    "/other",
    "/clacamieu/unknown",
    "/clacamieu/pieces/a/extra",
    "/clacamieu/pieces/%ZZ",
  ])("falls back to Home for %s", (path) => {
    expect(parseRoute(path)).toEqual({ screen: "home" });
  });
  it("pushes navigation and replaces the editor history entry on return", () => {
    const push = vi.spyOn(history, "pushState");
    const replace = vi.spyOn(history, "replaceState");
    const events: boolean[] = [];
    const listener = (event: Event) =>
      events.push((event as CustomEvent).detail.replace);
    window.addEventListener("location-changed", listener);
    navigate("/clacamieu/configuration");
    expect(location.pathname).toBe("/clacamieu/configuration");
    navigate("/clacamieu", { replace: true });
    expect(push).toHaveBeenCalledExactlyOnceWith(
      null,
      "",
      "/clacamieu/configuration",
    );
    expect(replace).toHaveBeenCalledExactlyOnceWith(null, "", "/clacamieu");
    expect(events).toEqual([false, true]);
    window.removeEventListener("location-changed", listener);
  });
});
