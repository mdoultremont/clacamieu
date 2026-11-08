import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import {
  Drawer,
  DrawerBody,
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

it("keeps wheel scrolling inside a drawer rendered in a shadow root", async () => {
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
            <DrawerBody>
              <p data-testid="row">Long list</p>
            </DrawerBody>
          </DrawerContent>
        </Drawer>
      </PortalContainerContext>,
    ),
  );
  const body = shadow.querySelector<HTMLElement>('[data-slot="drawer-body"]')!;
  body.style.overflowY = "auto";
  Object.defineProperties(body, {
    scrollHeight: { value: 1000 },
    clientHeight: { value: 400 },
  });
  const row = shadow.querySelector('[data-testid="row"]')!;
  const init = { bubbles: true, cancelable: true, composed: true };
  const wheel = new WheelEvent("wheel", { ...init, deltaY: 100 });
  row.dispatchEvent(wheel);
  expect(wheel.defaultPrevented).toBe(false);
});
