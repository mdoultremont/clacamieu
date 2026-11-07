import {
  CloudFog,
  Droplet,
  Lightbulb,
  LightbulbOff,
  Wind,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "cn";
import { messages } from "../i18n";
import {
  buildRoomFooter,
  type RoomCard as RoomCardData,
  type RoomFooterItem,
  type RoomFooterKind,
} from "../room-card";
import type { ServiceAction } from "../types";
import { areaIcon } from "./area-icon";
import { RouteLink } from "./route-link";
import { Tray, TrayLine } from "./tray";

export function RoomCard({
  room,
  today,
  language,
  busy,
  onAction,
}: {
  room: RoomCardData;
  today: Record<string, number | null> | null;
  language: string;
  busy: boolean;
  onAction: (action: ServiceAction) => unknown;
}) {
  const t = messages(language);
  const { lighting } = room;
  const Icon = areaIcon(room.icon);
  return (
    <Tray className="relative">
      <RouteLink
        route={{ screen: "room", areaId: room.id }}
        aria-label={t.openRoom(room.name)}
        className="absolute inset-0 z-10 rounded-[inherit] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      <div className="tray-card flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-center justify-between gap-2">
          {lighting ? (
            <button
              type="button"
              aria-label={t.roomLights(room.name)}
              aria-pressed={lighting.on}
              disabled={busy || !lighting.available}
              onClick={() => onAction(lighting.toggle)}
              className={cn(
                "relative z-20 grid size-9 place-items-center rounded-lg outline-none transition-[background-color,color,box-shadow,scale] duration-200 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-95 disabled:opacity-60",
                lighting.on
                  ? "bg-glow text-glow-foreground shadow-[0_6px_18px_-8px_var(--glow)]"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {lighting.available ? (
                <Icon className="size-[1.125rem]" />
              ) : (
                <LightbulbOff className="size-[1.125rem]" />
              )}
            </button>
          ) : (
            <span className="grid size-9 place-items-center rounded-lg bg-muted/60 text-muted-foreground">
              <Icon className="size-[1.125rem]" />
            </span>
          )}
          {room.temperature !== null && (
            <span className="text-xl font-semibold tracking-tight tabular-nums">
              {room.temperature}°
            </span>
          )}
        </div>
        <p className="truncate font-medium">{room.name}</p>
      </div>
      <RoomFooter items={buildRoomFooter(room, today, language)} />
    </Tray>
  );
}

const footerIcons: Partial<Record<RoomFooterKind, LucideIcon>> = {
  humidity: Droplet,
  co2: Wind,
  pm25: CloudFog,
  power: Zap,
  lights: Lightbulb,
  lightsOff: Lightbulb,
};

/**
 * Indices of the items that fit in `available` pixels, in display order.
 * Alerts claim space first; the rest fill in order until one does not fit.
 * The first claimed item always stays, ellipsized if it is too wide.
 */
export function fitFooterItems(
  alerts: boolean[],
  widths: number[],
  gap: number,
  available: number,
): number[] {
  const order = [
    ...alerts.flatMap((alert, index) => (alert ? [index] : [])),
    ...alerts.flatMap((alert, index) => (alert ? [] : [index])),
  ];
  const kept: number[] = [];
  let used = 0;
  for (const index of order) {
    const width = widths[index] + (kept.length ? gap : 0);
    if (kept.length && used + width > available) break;
    kept.push(index);
    used += width;
  }
  return kept.sort((a, b) => a - b);
}

function RoomFooter({ items }: { items: RoomFooterItem[] }) {
  const line = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState<number[] | null>(null);
  const key = JSON.stringify(items);
  useLayoutEffect(() => {
    const fit = () => {
      if (!line.current || !ruler.current) return;
      const style = getComputedStyle(line.current);
      const available =
        line.current.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight);
      const widths = [...ruler.current.children].map(
        (child) => child.getBoundingClientRect().width,
      );
      const next = fitFooterItems(
        items.map((item) => item.alert),
        widths,
        parseFloat(getComputedStyle(ruler.current).columnGap) || 0,
        available,
      );
      setShown((current) =>
        current?.join() === next.join() ? current : next,
      );
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(line.current!);
    return () => observer.disconnect();
  }, [key]);
  const visible = shown
    ? shown.map((index) => items[index]).filter(Boolean)
    : items;
  return (
    <TrayLine ref={line} className="relative gap-3 tabular-nums">
      <div
        ref={ruler}
        aria-hidden
        className="invisible absolute flex gap-3 whitespace-nowrap"
      >
        {items.map((item, index) => (
          <FooterItem key={index} item={item} />
        ))}
      </div>
      {visible.map((item) => (
        <FooterItem key={item.kind} item={item} />
      ))}
    </TrayLine>
  );
}

function FooterItem({ item }: { item: RoomFooterItem }) {
  const Icon = footerIcons[item.kind];
  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-1",
        item.alert && "font-medium text-destructive",
        item.kind === "noSensors" && "opacity-60",
      )}
    >
      {Icon && <Icon className="size-3.5 shrink-0" />}
      <span className="truncate">{item.text}</span>
    </span>
  );
}
