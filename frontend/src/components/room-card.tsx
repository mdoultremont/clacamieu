import { Droplet, LightbulbOff, Wind } from "lucide-react";
import { cn } from "cn";
import { messages } from "../i18n";
import type { RoomCard as RoomCardData } from "../room-card";
import type { ServiceAction } from "../types";
import { areaIcon } from "./area-icon";
import { RouteLink } from "./route-link";

export function RoomCard({
  room,
  language,
  busy,
  onAction,
}: {
  room: RoomCardData;
  language: string;
  busy: boolean;
  onAction: (action: ServiceAction) => unknown;
}) {
  const t = messages(language);
  const { lighting, co2 } = room;
  const Icon = areaIcon(room.icon);
  return (
    <div className="relative flex min-h-32 flex-col gap-2 rounded-xl border bg-card p-3 text-card-foreground">
      <RouteLink
        route={{ screen: "room", areaId: room.id }}
        aria-label={t.openRoom(room.name)}
        className="absolute inset-0 rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:bg-muted/60"
      />
      <div className="flex items-start justify-between gap-2">
        {lighting ? (
          <button
            type="button"
            aria-label={t.roomLights(room.name)}
            aria-pressed={lighting.on}
            disabled={busy || !lighting.available}
            onClick={() => onAction(lighting.toggle)}
            className={cn(
              "relative grid size-11 place-items-center rounded-lg outline-none transition-[background-color,color,box-shadow,scale] duration-200 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-95 disabled:opacity-60",
              lighting.on
                ? "bg-glow text-glow-foreground shadow-[0_6px_18px_-8px_var(--glow)]"
                : "bg-muted text-muted-foreground",
            )}
          >
            {lighting.available ? (
              <Icon className="size-5" />
            ) : (
              <LightbulbOff className="size-5" />
            )}
          </button>
        ) : (
          <span className="grid size-11 place-items-center rounded-lg bg-muted/60 text-muted-foreground">
            <Icon className="size-5" />
          </span>
        )}
        {room.temperature !== null && (
          <span className="text-2xl font-semibold tracking-tight tabular-nums">
            {room.temperature}°
          </span>
        )}
      </div>
      <div className="pointer-events-none mt-auto min-w-0">
        <p className="truncate font-medium">{room.name}</p>
        {(room.humidity !== null || co2) && (
          <p className="flex items-center gap-3 text-sm tabular-nums text-muted-foreground">
            {room.humidity !== null && (
              <span className="flex items-center gap-1" title={t.humidity}>
                <Droplet className="size-3.5" />
                {room.humidity} %
              </span>
            )}
            {co2 && (
              <span
                className={cn(
                  "flex min-w-0 items-center gap-1",
                  co2.level === "poor" && "font-medium text-air-poor",
                )}
                title="CO₂"
              >
                <Wind className="size-3.5 shrink-0" />
                <span className="truncate">{co2.value} ppm</span>
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
