import { createRoot, type Root } from "react-dom/client";
import css from "./index.css?inline";
import { App } from "./app";
import { installStyles } from "./shadow-styles";
import { createStore } from "./store";
import type { HassLike, PanelInfo } from "./types";

export interface PanelSnapshot {
  hass: HassLike | null;
  narrow: boolean;
  route: unknown;
  panel: PanelInfo;
}
export type PanelStore = ReturnType<typeof createStore<PanelSnapshot>>;

export class ClacamieuPanel extends HTMLElement {
  readonly store: PanelStore = createStore<PanelSnapshot>({ hass: null, narrow: false, route: null, panel: { url_path: "clacamieu" } });
  private root?: Root;

  get hass() { return this.store.get().hass; }
  set hass(hass: HassLike | null) { this.store.set({ ...this.store.get(), hass }); }
  get narrow() { return this.store.get().narrow; }
  set narrow(narrow: boolean) { this.store.set({ ...this.store.get(), narrow }); }
  get route() { return this.store.get().route; }
  set route(route: unknown) { this.store.set({ ...this.store.get(), route }); }
  get panel() { return this.store.get().panel; }
  set panel(panel: PanelInfo) { this.store.set({ ...this.store.get(), panel }); }

  connectedCallback() {
    if (this.root) return;
    const shadow = this.attachShadow({ mode: "open" });
    installStyles(shadow, css);
    const container = document.createElement("div");
    container.id = "root";
    shadow.append(container);
    this.root = createRoot(container);
    this.root.render(<App store={this.store} host={this} />);
  }
}

if (!customElements.get("clacamieu-panel")) customElements.define("clacamieu-panel", ClacamieuPanel);
