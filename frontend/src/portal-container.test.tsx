import { act } from "react";
import { createRoot } from "react-dom/client";
import { Portal } from "radix-ui";
import { expect, it, vi } from "vitest";
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

async function checkPortal(
  children: import("react").ReactNode,
  selector: string,
) {
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
          {children}
        </PortalContainerContext>,
      );
    });
    expect(container.querySelector(selector)).not.toBeNull();
    expect(container.querySelector(selector)?.getRootNode()).toBe(shadow);
    expect(document.body.querySelector(selector)).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
}

it("mounts the real Drawer content in the panel shadow root", async () => {
  const { Drawer, DrawerContent, DrawerTitle, DrawerDescription } =
    await import("./components/ui/drawer");
  await checkPortal(
    <Drawer open noBodyStyles>
      <DrawerContent>
        <DrawerTitle>Card</DrawerTitle>
        <DrawerDescription>Options</DrawerDescription>
      </DrawerContent>
    </Drawer>,
    '[data-slot="drawer-content"]',
  );
});
it("mounts Select options in the panel shadow root", async () => {
  HTMLElement.prototype.scrollIntoView ??= vi.fn();
  const { Select, SelectContent, SelectTrigger, SelectValue, SelectItem } =
    await import("./components/ui/select");
  await checkPortal(
    <Select open value="auto">
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="auto">Automatic</SelectItem>
      </SelectContent>
    </Select>,
    '[role="listbox"]',
  );
});
it("mounts reset confirmation in the panel shadow root", async () => {
  const {
    AlertDialog,
    AlertDialogContent,
    AlertDialogTitle,
    AlertDialogDescription,
  } = await import("./components/ui/alert-dialog");
  await checkPortal(
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogTitle>Reset</AlertDialogTitle>
        <AlertDialogDescription>Reset configuration</AlertDialogDescription>
      </AlertDialogContent>
    </AlertDialog>,
    '[role="alertdialog"]',
  );
});
