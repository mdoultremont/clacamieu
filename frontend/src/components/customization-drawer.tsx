import { useState, type ReactNode } from "react";
import { messages } from "../i18n";
import { Button } from "./ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "./ui/drawer";

/**
 * A bottom sheet where an admin adjusts one page. Its content mounts on open,
 * so each opening starts from the saved settings.
 */
export function CustomizationDrawer({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      shouldScaleBackground={false}
      noBodyStyles
    >
      <DrawerContent className="config-drawer">{open && children}</DrawerContent>
    </Drawer>
  );
}

/** The sheet's title, body, and Cancel and Done buttons; Done saves, then closes. */
export function CustomizationSheet({
  title,
  description,
  language,
  onClose,
  onSave,
  children,
}: {
  title: string;
  description: string;
  language: string;
  onClose: () => void;
  onSave: () => Promise<void>;
  children: ReactNode;
}) {
  const t = messages(language);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  async function save() {
    setSaving(true);
    setFailed(false);
    try {
      await onSave();
      onClose();
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <DrawerHeader>
        <DrawerTitle>{title}</DrawerTitle>
        <DrawerDescription>{description}</DrawerDescription>
      </DrawerHeader>
      <DrawerBody className="space-y-4" data-vaul-no-drag>
        {children}
        {failed && (
          <p className="text-sm text-destructive" role="alert">
            {t.saveError}
          </p>
        )}
      </DrawerBody>
      <DrawerFooter className="grid grid-cols-2">
        <Button variant="outline" disabled={saving} onClick={onClose}>
          {t.cancel}
        </Button>
        <Button disabled={saving} onClick={save}>
          {saving ? t.saving : t.done}
        </Button>
      </DrawerFooter>
    </>
  );
}
