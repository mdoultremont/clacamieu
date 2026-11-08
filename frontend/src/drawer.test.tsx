import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "./components/ui/drawer";
import { PortalContainerContext } from "./portal-container";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLElement;
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
});

it("lets the page scroll gestures that start inside a drawer in a shadow root", async () => {
  host = document.createElement("div");
  document.body.append(host);
  const shadow = host.attachShadow({ mode: "open" });
  const container = document.createElement("div");
  const portal = document.createElement("div");
  shadow.append(container, portal);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <PortalContainerContext value={portal}>
        <Drawer open>
          <DrawerContent>
            <DrawerTitle>Title</DrawerTitle>
            <DrawerDescription>Description</DrawerDescription>
            <div data-testid="body">Long list</div>
          </DrawerContent>
        </Drawer>
      </PortalContainerContext>,
    ),
  );
  const body = shadow.querySelector('[data-testid="body"]')!;
  const init = { bubbles: true, cancelable: true, composed: true };
  const wheel = new WheelEvent("wheel", { ...init, deltaY: 100 });
  const touch = new Event("touchmove", init);
  body.dispatchEvent(wheel);
  body.dispatchEvent(touch);
  expect(wheel.defaultPrevented).toBe(false);
  expect(touch.defaultPrevented).toBe(false);
});
