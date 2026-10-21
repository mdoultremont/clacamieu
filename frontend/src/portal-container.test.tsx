import { act } from "react";
import { createRoot } from "react-dom/client";
import { Portal } from "radix-ui";
import { expect, it } from "vitest";
import { PortalContainerContext, usePortalContainer } from "./portal-container";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function Overlay() {
  const container = usePortalContainer();
  return (
    <Portal.Root container={container}>
      <div role="dialog">Panel overlay</div>
    </Portal.Root>
  );
}

it("keeps portals inside the panel shadow root instead of the document body", async () => {
  const host = document.createElement("div");
  const shadow = host.attachShadow({ mode: "open" });
  const mount = document.createElement("div");
  const container = document.createElement("div");
  shadow.append(mount, container);
  document.body.append(host);
  const root = createRoot(mount);
  try {
    await act(async () => {
      root.render(
        <PortalContainerContext value={container}>
          <Overlay />
        </PortalContainerContext>,
      );
    });
    expect(container.querySelector('[role="dialog"]')?.textContent).toBe(
      "Panel overlay",
    );
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(mount.querySelector('[role="dialog"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
