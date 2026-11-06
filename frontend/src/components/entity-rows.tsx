import { cn } from "cn";

export interface EntityRow {
  id: string;
  name: string;
  /** Short state or time shown on the right. */
  value: string;
  /** A status dot before the name; none when absent. */
  dot?: "good" | "alert" | "off";
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
    <ul className="divide-y overflow-hidden rounded-xl border bg-card text-card-foreground">
      {rows.map((row) => (
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
              {row.value}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
