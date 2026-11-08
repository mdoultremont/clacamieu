import { useState } from "react";
import { moveItem } from "../config-editor";
import { messages } from "../i18n";
import { displayOptions, type EntityDisplay } from "../room-display";
import type { RoomElement, RoomView } from "../room-view";
import type { RoomEntityConfig } from "../types";
import { ConfigSortableList } from "./config-sortable-list";
import { Button } from "./ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "./ui/drawer";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

type Section = "lights" | "devices" | "sensors";
type Draft = Record<
  Section,
  { id: string; name: string; display: EntityDisplay; options: readonly EntityDisplay[] }[]
>;

const sections = ["lights", "devices", "sensors"] as const;

function draftFrom(view: RoomView): Draft {
  const rows = (elements: (RoomElement & { power?: unknown })[]) =>
    elements.map((element) => ({
      id: element.id,
      name: element.name,
      display: element.display,
      options: displayOptions(element),
    }));
  return {
    lights: rows(view.lights),
    devices: rows(view.devices),
    sensors: rows(view.sensors),
  };
}

/** A sheet where an admin orders a room's elements and picks how each shows. */
export function RoomCustomization({
  view,
  language,
  open,
  onOpenChange,
  onSave,
}: {
  view: RoomView;
  language: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (entities: RoomEntityConfig[]) => Promise<void>;
}) {
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      shouldScaleBackground={false}
      noBodyStyles
    >
      <DrawerContent className="config-drawer">
        {open && (
          <Sheet
            view={view}
            language={language}
            onClose={() => onOpenChange(false)}
            onSave={onSave}
          />
        )}
      </DrawerContent>
    </Drawer>
  );
}

function Sheet({
  view,
  language,
  onClose,
  onSave,
}: {
  view: RoomView;
  language: string;
  onClose: () => void;
  onSave: (entities: RoomEntityConfig[]) => Promise<void>;
}) {
  const t = messages(language);
  const [draft, setDraft] = useState(() => draftFrom(view));
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const titles: Record<Section, string> = {
    lights: t.lights,
    devices: t.devices,
    sensors: t.openingsAndSensors,
  };
  async function save() {
    setSaving(true);
    setFailed(false);
    try {
      await onSave(
        sections.flatMap((section) =>
          draft[section].map((row) => ({
            entity_id: row.id,
            display: row.display,
          })),
        ),
      );
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
        <DrawerTitle>{t.customizeRoom}</DrawerTitle>
        <DrawerDescription>{t.customizeRoomDescription}</DrawerDescription>
      </DrawerHeader>
      <div className="config-drawer-body space-y-4" data-vaul-no-drag>
        {sections
          .filter((section) => draft[section].length > 0)
          .map((section) => (
            <section key={section} className="space-y-2" aria-label={titles[section]}>
              <h3 className="px-1 text-xs font-medium text-muted-foreground">
                {titles[section]}
              </h3>
              <div role="list" className="overflow-hidden rounded-xl border">
                <ConfigSortableList
                  language={language}
                  onMove={(from, to) =>
                    setDraft((current) => ({
                      ...current,
                      [section]: moveItem(current[section], from, to),
                    }))
                  }
                  rows={draft[section].map((row) => ({
                    id: row.id,
                    title: row.name,
                    hidden: row.display === "hidden",
                    trailing: (
                      <ToggleGroup
                        type="single"
                        variant="outline"
                        size="sm"
                        value={row.display}
                        aria-label={t.entityDisplay(row.name)}
                        className="mr-1 shrink-0"
                        onValueChange={(value) => {
                          if (!value) return;
                          setDraft((current) => ({
                            ...current,
                            [section]: current[section].map((item) =>
                              item.id === row.id
                                ? { ...item, display: value as EntityDisplay }
                                : item,
                            ),
                          }));
                        }}
                      >
                        {row.options.map((display) => (
                          <ToggleGroupItem
                            key={display}
                            value={display}
                            className="min-h-11 px-2 text-xs"
                          >
                            {t.entityDisplays[display]}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    ),
                  }))}
                />
              </div>
            </section>
          ))}
        {failed && (
          <p className="text-sm text-destructive" role="alert">
            {t.saveError}
          </p>
        )}
      </div>
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
