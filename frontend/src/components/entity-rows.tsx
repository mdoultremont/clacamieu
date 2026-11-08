import type { LucideIcon } from "lucide-react";
import { cn } from "cn";
import { Tray } from "./tray";

export interface EntityRow {
  id: string;
  name: string;
  /** Short state or time shown on the right. */
  value: string;
  /** Muted text after the value, such as how long it has held. */
  detail?: string;
  /** A status dot before the name; none when absent. */
  dot?: "good" | "alert" | "off";
  icon?: LucideIcon;
  /** A state worth noticing that isn't a problem, such as an open window. */
  active?: boolean;
  alert?: boolean;
  unavailable?: boolean;
}

const dotClass = {
  good: "bg-air-good",
  alert: "bg-air-poor",
  off: "bg-muted-foreground/40",
};

/** One-line entity rows that open Home Assistant's more-info dialog. */
export function EntityRows({
  rows,
  onMoreInfo,
}: {
  rows: EntityRow[];
  onMoreInfo: (entityId: string) => void;
}) {
  return (
    <Tray>
      <ul className="tray-card divide-y overflow-hidden">
        {rows.map(({ icon: Icon, ...row }) => (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => onMoreInfo(row.id)}
              className="flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left text-sm outline-none focus-visible:bg-muted/60 active:bg-muted/60"
            >
              {row.dot && (
                <span
                  aria-hidden
                  className={cn("size-2 shrink-0 rounded-full", dotClass[row.dot])}
                />
              )}
              {Icon && (
                <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span
                className={cn(
                  "min-w-0 flex-1 truncate",
                  row.unavailable && "text-muted-foreground",
                  row.alert && "font-medium",
                )}
              >
                {row.name}
              </span>
              <span
                className={cn(
                  "shrink-0 text-right text-xs tabular-nums",
                  row.alert ? "text-air-poor" : "text-muted-foreground",
                )}
              >
                <span className={cn(row.active && "font-semibold text-foreground")}>
                  {row.value}
                </span>
                {row.detail && ` ${row.detail}`}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Tray>
  );
}
