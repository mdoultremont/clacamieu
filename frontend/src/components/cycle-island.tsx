import { Check, WashingMachine } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { cn } from "cn";
import {
  formatDuration,
  formatElapsed,
  type CycleChip,
} from "../cycle-view";
import { messages } from "../i18n";
import { RouteLink } from "./route-link";
import { Button } from "./ui/button";

const pillHeight = 28;
const morphMs = 550;
const spring = "cubic-bezier(.3,1.25,.45,1)";
const islandMotion: CSSProperties = {
  transition: [
    `width ${morphMs}ms ${spring}`,
    `height ${morphMs}ms ${spring}`,
    "border-radius 450ms cubic-bezier(.3,1.1,.45,1)",
    "max-width 400ms cubic-bezier(.3,1,.4,1)",
    "opacity 250ms",
    "filter 300ms",
    "margin 400ms",
    "box-shadow 300ms",
  ].join(","),
};

/**
 * Pills under Home's date for cycle appliances that run or just finished.
 * Tapping one grows it in place into a card that overlays the page below,
 * so the page never moves.
 */
export function CycleIslands({
  chips,
  now,
  language,
  onDismiss,
}: {
  chips: CycleChip[];
  now: Date;
  language: string;
  onDismiss: (entityId: string, endedAt: number) => void;
}) {
  const t = messages(language);
  const [openId, setOpenId] = useState<string | null>(null);
  const row = useRef<HTMLDivElement>(null);
  const open = chips.some((chip) => chip.entityId === openId) ? openId : null;
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (row.current && !event.composedPath().includes(row.current))
        setOpenId(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenId(null);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  if (!chips.length) return null;
  return (
    // Safari only re-sorts composited layers once a size transition ends, so
    // the tray grain would cover the growing island; its own layer keeps it on top.
    // iOS Safari cut the open card to the pill height while this row clipped its
    // sides, so the page content clips pills that run past the edge instead.
    <div
      ref={row}
      role="list"
      aria-label={t.appliances}
      className="relative z-20 flex h-7 transform-gpu items-start gap-1.5"
    >
      {chips.map((chip) => (
        <Island
          key={chip.entityId}
          chip={chip}
          now={now}
          language={language}
          open={open === chip.entityId}
          gone={open !== null && open !== chip.entityId}
          onToggle={() =>
            setOpenId((current) =>
              current === chip.entityId ? null : chip.entityId,
            )
          }
          onDismiss={() => {
            if (chip.status !== "finished") return;
            setOpenId(null);
            onDismiss(chip.entityId, chip.endedAt);
          }}
        />
      ))}
    </div>
  );
}

type Phase = "closed" | "opening" | "open" | "closing";

function Island({
  chip,
  now,
  language,
  open,
  gone,
  onToggle,
  onDismiss,
}: {
  chip: CycleChip;
  now: Date;
  language: string;
  open: boolean;
  gone: boolean;
  onToggle: () => void;
  onDismiss: () => void;
}) {
  const t = messages(language);
  const root = useRef<HTMLDivElement>(null);
  const compact = useRef<HTMLDivElement>(null);
  const expanded = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("closed");
  const expanding = phase === "opening" || phase === "open";
  // Pin the current size while the resting layout still holds it.
  useLayoutEffect(() => {
    if (open === expanding) return;
    const element = root.current!;
    const { width, height } = element.getBoundingClientRect();
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
    setPhase(open ? "opening" : "closing");
  }, [open]);
  // Animate to the measured target, then release to the resting layout.
  useLayoutEffect(() => {
    if (phase !== "opening" && phase !== "closing") return;
    const element = root.current!;
    const card = expanded.current!;
    const width = element.parentElement!.clientWidth;
    card.style.width = `${width}px`;
    void element.offsetWidth;
    element.style.width = `${phase === "opening" ? width : compact.current!.offsetWidth}px`;
    element.style.height = `${phase === "opening" ? card.offsetHeight : pillHeight}px`;
    const timer = window.setTimeout(() => {
      element.style.width = "";
      element.style.height = "";
      card.style.width = "";
      setPhase(phase === "opening" ? "open" : "closed");
    }, morphMs);
    return () => window.clearTimeout(timer);
  }, [phase]);
  return (
    <div
      ref={root}
      role="listitem"
      aria-hidden={gone || undefined}
      inert={gone}
      onClick={(event) => {
        if (!(event.target as Element).closest("a, button:not([data-toggle])"))
          onToggle();
      }}
      style={islandMotion}
      className={cn(
        "relative min-w-0 shrink-0 cursor-pointer overflow-hidden bg-card text-card-foreground",
        expanding
          ? "rounded-[22px] shadow-[0_0_0_1px_color-mix(in_oklab,var(--border)_60%,transparent),0_18px_40px_-16px_oklch(0_0_0/0.3)]"
          : "rounded-[14px] shadow-[0_0_0_1px_color-mix(in_oklab,var(--border)_80%,transparent),0_1px_2px_oklch(0_0_0/0.04)]",
        phase === "open" ? "w-full" : phase === "closed" && "h-7",
        gone
          ? "pointer-events-none -mr-1.5 max-w-0 opacity-0 blur-[6px]"
          : expanding
            ? "max-w-none"
            : "max-w-[400px]",
      )}
    >
      <div
        ref={compact}
        className={cn(
          "top-0 left-0 flex h-7 items-center gap-1.5 pr-[11px] pl-[9px] text-[0.78rem] font-medium whitespace-nowrap transition-[opacity,scale,filter] duration-[180ms,300ms,250ms]",
          phase === "closed" ? "relative" : "absolute",
          expanding && "scale-[.85] opacity-0 blur-[4px]",
        )}
      >
        {chip.status === "running" ? (
          <span className="size-[7px] shrink-0 animate-[cycle-pulse_2s_infinite] rounded-full bg-running" />
        ) : (
          <span className="grid size-4 shrink-0 place-items-center rounded-full bg-finished text-white">
            <Check className="size-2.5" strokeWidth={3} />
          </span>
        )}
        <span className="truncate">{chip.name}</span>
        <span className="font-normal opacity-60">
          {chip.status === "running"
            ? (chip.remaining ??
              formatDuration(now.getTime() - chip.since, language))
            : t.cycleFinishedChip}
        </span>
        <button
          type="button"
          data-toggle
          aria-expanded={open}
          aria-label={t.cycleDetails(chip.name)}
          className="absolute inset-0 rounded-[inherit] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          tabIndex={expanding ? -1 : 0}
        />
      </div>
      <div
        ref={expanded}
        aria-hidden={!expanding}
        className={cn(
          "top-0 left-0 origin-top-left p-3 transition-[opacity,scale,filter] duration-[200ms,400ms,300ms] ease-[ease,cubic-bezier(.3,1.2,.45,1),ease]",
          phase === "open" ? "relative" : "absolute",
          expanding
            ? "opacity-100 delay-[90ms]"
            : "pointer-events-none scale-[.94] opacity-0 blur-[6px]",
        )}
      >
        <IslandDetails chip={chip} language={language} onDismiss={onDismiss} />
      </div>
    </div>
  );
}

function IslandDetails({
  chip,
  language,
  onDismiss,
}: {
  chip: CycleChip;
  language: string;
  onDismiss: () => void;
}) {
  const t = messages(language);
  const running = chip.status === "running";
  return (
    <>
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "grid size-[38px] shrink-0 place-items-center rounded-xl",
            running
              ? "bg-running/15 text-running"
              : "bg-finished/15 text-finished",
          )}
        >
          <WashingMachine className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{chip.name}</p>
          <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            {running && <Wave />}
            {running
              ? `${chip.program ?? t.cycleRunning} · ${chip.areaName}`
              : `${chip.ago} · ${chip.areaName}`}
          </p>
        </div>
        <div className="shrink-0 text-right tabular-nums">
          <p className="text-xl leading-tight font-semibold tracking-tight">
            {running ? <Elapsed since={chip.since} /> : chip.duration}
          </p>
          <p className="text-xs text-muted-foreground">
            {running
              ? [chip.remaining ?? chip.watts, chip.kwh]
                  .filter(Boolean)
                  .join(" · ")
              : chip.kwh}
          </p>
        </div>
      </div>
      {running && chip.progress !== null && (
        <div
          role="progressbar"
          aria-valuenow={chip.progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={chip.name}
          className="mt-3 h-1 overflow-hidden rounded-full bg-running/15"
        >
          <div
            className="h-full rounded-full bg-running transition-[width] duration-500"
            style={{ width: `${Math.min(100, Math.max(0, chip.progress))}%` }}
          />
        </div>
      )}
      <div className="mt-3 flex gap-1.5">
        {!running && (
          <Button size="sm" className="flex-1 rounded-xl" onClick={onDismiss}>
            {t.cycleDismiss}
          </Button>
        )}
        <Button
          size="sm"
          variant="secondary"
          className="flex-1 rounded-xl"
          asChild
        >
          <RouteLink route={{ screen: "room", areaId: chip.areaId }}>
            {t.viewRoom}
          </RouteLink>
        </Button>
      </div>
    </>
  );
}

/** A clock that ticks every second while the card is on screen. */
function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return formatElapsed(now - since);
}

function Wave() {
  return (
    <span aria-hidden className="flex h-3.5 items-end gap-0.5">
      {[0, 150, 300, 450].map((delay) => (
        <i
          key={delay}
          className="w-[3px] animate-[cycle-wave_1s_ease-in-out_infinite] rounded-sm bg-running"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}
