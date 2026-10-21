import { useSyncExternalStore } from "react";
import { messages } from "./i18n";
import type { ClacamieuPanel, PanelStore } from "./panel";

export function App({ store }: { store: PanelStore; host: ClacamieuPanel }) {
  const { hass } = useSyncExternalStore(store.subscribe, store.get);
  return <main>{messages(hass?.language ?? navigator.language).loading}</main>;
}
