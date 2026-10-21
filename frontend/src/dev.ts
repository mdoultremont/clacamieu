import { createDevHass } from "./dev-hass";
import { messages } from "./i18n";
import { ClacamieuPanel } from "./panel";

const element = document.createElement("clacamieu-panel") as ClacamieuPanel;
const media = window.matchMedia("(max-width: 870px)");
element.narrow = media.matches;
element.panel = { url_path: "clacamieu", title: "Maison", config: {} };
const resize = () => { element.narrow = media.matches; };
media.addEventListener("change", resize);
document.body.append(element);

try {
  if (!__CLACAMIEU_DEV__) throw new Error("Development connection is not configured.");
  const close = await createDevHass(__CLACAMIEU_DEV__.url, __CLACAMIEU_DEV__.token, (hass) => {
    document.documentElement.lang = hass.language;
    element.hass = hass;
  });
  import.meta.hot?.dispose(() => { close(); media.removeEventListener("change", resize); element.remove(); });
} catch {
  const error = document.createElement("p");
  error.setAttribute("role", "alert");
  error.textContent = messages(navigator.language).connectionError;
  element.shadowRoot?.querySelector("#root")?.replaceChildren(error);
}
