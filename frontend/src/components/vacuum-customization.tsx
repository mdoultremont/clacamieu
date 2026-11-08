import { useState } from "react";
import { moveItem } from "../config-editor";
import { messages } from "../i18n";
import type { VacuumSection } from "../types";
import { ConfigSortableList } from "./config-sortable-list";
import {
  CustomizationDrawer,
  CustomizationSheet,
} from "./customization-drawer";

/** A sheet where an admin orders the vacuum page's sections. */
export function VacuumCustomization({
  order,
  language,
  open,
  onOpenChange,
  onSave,
}: {
  order: VacuumSection[];
  language: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (sections: VacuumSection[]) => Promise<void>;
}) {
  return (
    <CustomizationDrawer open={open} onOpenChange={onOpenChange}>
      <Sheet
        order={order}
        language={language}
        onClose={() => onOpenChange(false)}
        onSave={onSave}
      />
    </CustomizationDrawer>
  );
}

function Sheet({
  order,
  language,
  onClose,
  onSave,
}: {
  order: VacuumSection[];
  language: string;
  onClose: () => void;
  onSave: (sections: VacuumSection[]) => Promise<void>;
}) {
  const t = messages(language);
  const [draft, setDraft] = useState(order);
  return (
    <CustomizationSheet
      title={t.customizeVacuum}
      description={t.customizeVacuumDescription}
      language={language}
      onClose={onClose}
      onSave={() => onSave(draft)}
    >
      <div role="list" className="overflow-hidden rounded-xl border">
        <ConfigSortableList
          language={language}
          onMove={(from, to) => setDraft((current) => moveItem(current, from, to))}
          rows={draft.map((section) => ({
            id: section,
            title: t.vacuumSections[section],
            trailing: false,
          }))}
        />
      </div>
    </CustomizationSheet>
  );
}
