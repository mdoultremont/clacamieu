import { useId, useState } from "react";
import { messages } from "../i18n";
import type { SecurityView } from "../security-view";
import {
  CustomizationDrawer,
  CustomizationSheet,
} from "./customization-drawer";
import { sensorGroups } from "./security";
import { Switch } from "./ui/switch";

/** A sheet where an admin picks which sensors Security counts and lists. */
export function SecurityCustomization({
  view,
  language,
  open,
  onOpenChange,
  onSave,
}: {
  view: SecurityView;
  language: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (hidden: string[]) => Promise<void>;
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
  view: SecurityView;
  language: string;
  onClose: () => void;
  onSave: (hidden: string[]) => Promise<void>;
}) {
  const t = messages(language);
  const groups = sensorGroups(t).map((group) => ({
    ...group,
    sensors: [...view[group.key].sensors, ...view[group.key].hidden].sort(
      (a, b) => a.name.localeCompare(b.name, language),
    ),
  }));
  const [hidden, setHidden] = useState(() => new Set(view.hiddenIds));
  return (
    <CustomizationSheet
      title={t.customizeSecurity}
      description={t.customizeSecurityDescription}
      language={language}
      onClose={onClose}
      onSave={() => onSave([...hidden])}
    >
      {groups
        .filter((group) => group.sensors.length > 0)
        .map((group) => (
          <section key={group.key} className="space-y-2" aria-label={group.title}>
            <h3 className="px-1 text-xs font-medium text-muted-foreground">
              {group.title}
            </h3>
            <ul className="divide-y overflow-hidden rounded-xl border bg-card">
              {group.sensors.map((sensor) => (
                <SensorToggle
                  key={sensor.id}
                  name={sensor.name}
                  label={`${t.show} ${sensor.name}`}
                  shown={!hidden.has(sensor.id)}
                  onShownChange={(shown) =>
                    setHidden((current) => {
                      const next = new Set(current);
                      if (shown) next.delete(sensor.id);
                      else next.add(sensor.id);
                      return next;
                    })
                  }
                />
              ))}
            </ul>
          </section>
        ))}
    </CustomizationSheet>
  );
}

function SensorToggle({
  name,
  label,
  shown,
  onShownChange,
}: {
  name: string;
  label: string;
  shown: boolean;
  onShownChange: (shown: boolean) => void;
}) {
  const id = useId();
  return (
    <li className="flex min-h-14 items-center gap-3 px-4">
      <label
        htmlFor={id}
        className={`min-w-0 flex-1 truncate ${shown ? "" : "text-muted-foreground"}`}
      >
        {name}
      </label>
      <Switch
        id={id}
        checked={shown}
        aria-label={label}
        onCheckedChange={onShownChange}
      />
    </li>
  );
}
