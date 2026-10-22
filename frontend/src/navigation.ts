export type Route =
  | {
      screen:
        | "home"
        | "rooms"
        | "security"
        | "energy"
        | "more"
        | "configuration"
        | "vacuum"
        | "system"
        | "comfort"
        | "garden";
    }
  | { screen: "room"; areaId: string };

export interface PanelRoute {
  prefix?: string;
  path: string;
}

export function parseRoute(path: string): Route {
  const parts = path.replace(/\/$/, "").split("/");
  if (parts[0] !== "" || parts[1] !== "clacamieu") return { screen: "home" };
  if (parts.length === 3) {
    if (parts[2] === "securite") return { screen: "security" };
    if (parts[2] === "pieces") return { screen: "rooms" };
    if (parts[2] === "energie") return { screen: "energy" };
    if (parts[2] === "plus") return { screen: "more" };
    if (parts[2] === "configuration") return { screen: "configuration" };
  }
  if (parts.length === 4 && parts[2] === "pieces" && parts[3]) {
    try {
      return { screen: "room", areaId: decodeURIComponent(parts[3]) };
    } catch {
      return { screen: "home" };
    }
  }
  if (parts.length === 4 && parts[2] === "plus") {
    if (parts[3] === "aspitout") return { screen: "vacuum" };
    if (parts[3] === "systeme") return { screen: "system" };
    if (parts[3] === "confort") return { screen: "comfort" };
    if (parts[3] === "jardin") return { screen: "garden" };
  }
  return { screen: "home" };
}

export function routePath(route: Route): string {
  switch (route.screen) {
    case "home":
      return "/clacamieu";
    case "security":
      return "/clacamieu/securite";
    case "rooms":
      return "/clacamieu/pieces";
    case "room":
      return `/clacamieu/pieces/${encodeURIComponent(route.areaId)}`;
    case "energy":
      return "/clacamieu/energie";
    case "more":
      return "/clacamieu/plus";
    case "configuration":
      return "/clacamieu/configuration";
    case "vacuum":
      return "/clacamieu/plus/aspitout";
    case "system":
      return "/clacamieu/plus/systeme";
    case "comfort":
      return "/clacamieu/plus/confort";
    case "garden":
      return "/clacamieu/plus/jardin";
  }
}

export function navigate(path: string, { replace = false } = {}) {
  history[replace ? "replaceState" : "pushState"](null, "", path);
  window.dispatchEvent(
    new CustomEvent("location-changed", { detail: { replace } }),
  );
}
