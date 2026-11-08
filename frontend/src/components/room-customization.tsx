import { useState } from "react";
import { moveItem } from "../config-editor";
import { messages } from "../i18n";
import { displayOptions, type EntityDisplay } from "../room-display";
import type { RoomElement, RoomView } from "../room-view";
import type { RoomEntityConfig } from "../types";
import { ConfigSortableList } from "./config-sortable-list";
import {
  CustomizationDrawer,
  CustomizationSheet,
} from "./customization-drawer";
import { Input } from "./ui/input";
import { Segmented, SegmentedItem } from "./ui/segmented";

type Section = "lights" | "devices" | "sensors";
interface DraftRow {
  id: string;
  defaultName: string;
  /** The Maison name; empty keeps Home Assistant's. */
  name: string;
  display: EntityDisplay;
  options: readonly EntityDisplay[];
}
type Draft = Record<Section, DraftRow[]>;

const sections = ["lights", "devices", "sensors"] as const;

function draftFrom(view: RoomView): Draft {
  const rows = (elements: (RoomElement & { power?: unknown })[]) =>
    elements.map((element) => ({
      id: element.id,
      defaultName: element.defaultName,
      name: element.name === element.defaultName ? "" : element.name,
      display: element.display,
      options: displayOptions(element),
    }));
  return {
    lights: rows(view.lights),
    devices: rows(view.devices),
    sensors: rows(view.sensors),
  };
}

/**
 * A sheet where an admin orders a room's elements, names them, and picks how
 * each shows.
 */
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
    <CustomizationDrawer open={open} onOpenChange={onOpenChange}>
      <Sheet
        view={view}
        language={language}
        onClose={() => onOpenChange(false)}
        onSave={onSave}
      />
    </CustomizationDrawer>
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
  const [editing, setEditing] = useState<string | null>(null);
  const titles: Record<Section, string> = {
    lights: t.lights,
    devices: t.devices,
    sensors: t.openingsAndSensors,
  };
  const update = (section: Section, id: string, change: Partial<DraftRow>) =>
    setDraft((current) => ({
      ...current,
      [section]: current[section].map((item) =>
        item.id === id ? { ...item, ...change } : item,
      ),
    }));
  return (
    <CustomizationSheet
      title={t.customizeRoom}
      description={t.customizeRoomDescription}
      language={language}
      onClose={onClose}
      onSave={() =>
        onSave(
          sections.flatMap((section) =>
            draft[section].map((row) => ({
              entity_id: row.id,
              display: row.display,
              ...(row.name.trim() && { name: row.name.trim() }),
            })),
          ),
        )
      }
    >
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
                onEdit={(id) =>
                  setEditing((current) => (current === id ? null : id))
                }
                rows={draft[section].map((row) => ({
                  id: row.id,
                  title: row.name.trim() || row.defaultName,
                  description: row.name.trim() ? row.defaultName : undefined,
                  hidden: row.display === "hidden",
                  below: editing === row.id && (
                    <Input
                      autoFocus
                      aria-label={t.elementName(row.defaultName)}
                      placeholder={row.defaultName}
                      className="min-h-11 text-base"
                      value={row.name}
                      onChange={(event) =>
                        update(section, row.id, { name: event.target.value })
                      }
                      onBlur={() => setEditing(null)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") setEditing(null);
                      }}
                    />
                  ),
                  trailing: (
                    <Segmented
                      value={row.display}
                      aria-label={t.entityDisplay(row.defaultName)}
                      className="my-1.5 ml-auto mr-1 shrink-0"
                      onValueChange={(value) =>
                        update(section, row.id, {
                          display: value as EntityDisplay,
                        })
                      }
                    >
                      {row.options.map((display) => (
                        <SegmentedItem
                          key={display}
                          value={display}
                          className="min-h-11 flex-none px-2 text-xs"
                        >
                          {t.entityDisplays[display]}
                        </SegmentedItem>
                      ))}
                    </Segmented>
                  ),
                }))}
              />
            </div>
          </section>
        ))}
    </CustomizationSheet>
  );
}
