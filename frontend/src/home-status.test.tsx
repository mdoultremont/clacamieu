import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { VacuumCard } from "./components/home-status";
import type { HomeData } from "./types";
import type { VacuumView } from "./vacuum-view";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let container: HTMLDivElement;
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
});

const summary: NonNullable<HomeData["vacuum"]> = {
  name: "Robot",
  state: "Docked",
  tone: "idle",
  battery: "100",
  action: null,
};
const vacuum = (alert: string | null) =>
  ({
    currentRoom: null,
    lastCleaned: null,
    progress: null,
    maintenance: { items: [], flagged: 0, next: null },
    station: { ready: !alert, parts: "Clean water", alert, info: null },
  }) as unknown as VacuumView;

async function render(view: VacuumView, card = summary) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(<VacuumCard summary={card} vacuum={view} language="fr" />),
  );
  return container.textContent;
}

it("shows a station problem on the Home vacuum card", async () => {
  expect(await render(vacuum("Eau propre insuffisante"))).toContain(
    "Eau propre insuffisante",
  );
});

it("keeps the robot's own error next to a station problem", async () => {
  expect(
    await render(vacuum("Eau propre insuffisante"), {
      ...summary,
      state: "Brosse coincée",
      tone: "alert",
    }),
  ).toContain("Brosse coincée · Eau propre insuffisante");
});
