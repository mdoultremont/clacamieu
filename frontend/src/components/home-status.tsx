import {
  Bot,
  ChevronRight,
  DoorClosed,
  Droplets,
  Plug,
  Shield,
  ShieldCheck,
  Siren,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "cn";
import { messages } from "../i18n";
import type { Route } from "../navigation";
import type { SecuritySensorGroup, SecurityView } from "../security-view";
import type { HomeData, Tone } from "../types";
import type { VacuumView } from "../vacuum-view";
import { RouteLink } from "./route-link";

const toneClass: Record<Tone, string> = {
  idle: "bg-muted text-muted-foreground",
  active: "bg-primary text-primary-foreground",
  alert: "bg-destructive text-white",
};

function StatusCard({
  icon: Icon,
  tone,
  title,
  description,
  route,
  children,
}: {
  icon: LucideIcon;
  tone: Tone;
  title: string;
  description?: string | null;
  route: Route;
  children?: ReactNode;
}) {
  return (
    <RouteLink
      route={route}
      className="block space-y-3 rounded-xl border bg-card p-4 text-card-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:bg-muted/60"
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-lg",
            toneClass[tone],
          )}
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{title}</p>
          {description && (
            <p className="truncate text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </div>
      {children}
    </RouteLink>
  );
}

function Note({ alert, children }: { alert?: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 overflow-hidden rounded-lg px-3 py-2 text-sm whitespace-nowrap",
        alert ? "bg-air-poor/10 text-air-poor" : "bg-muted/70 text-muted-foreground",
      )}
    >
      {children}
    </div>
  );
}

export function AlarmCard({
  summary,
  security,
  language,
}: {
  summary: NonNullable<HomeData["alarm"]>;
  security: SecurityView;
  language: string;
}) {
  const t = messages(language);
  const all: [LucideIcon, SecuritySensorGroup][] = [
    [DoorClosed, security.openings],
    [Droplets, security.leaks],
    [Siren, security.detectors],
  ];
  // Openings always show; leaks and detectors only when they alert.
  const groups = all.filter(
    ([, group], index) =>
      group.sensors.length > 0 && (index === 0 || group.alert),
  );
  return (
    <StatusCard
      icon={summary.tone === "idle" ? Shield : ShieldCheck}
      tone={summary.tone}
      title={`${t.alarmLabel} · ${summary.status}`}
      description={security.alarm?.description}
      route={{ screen: "security" }}
    >
      {groups.length > 0 && (
        <Note alert={groups.some(([, group]) => group.alert)}>
          {groups.map(([Icon, group]) => (
            <span
              key={group.summary}
              className={cn(
                "flex min-w-0 items-center gap-1.5",
                group.alert && "font-medium",
              )}
            >
              <Icon className="size-3.5 shrink-0" />
              <span className="truncate">{group.summary}</span>
            </span>
          ))}
        </Note>
      )}
    </StatusCard>
  );
}

export function VacuumCard({
  summary,
  vacuum,
  language,
}: {
  summary: NonNullable<HomeData["vacuum"]>;
  vacuum: VacuumView | null;
  language: string;
}) {
  const t = messages(language);
  const description = [
    summary.battery !== null ? t.battery(summary.battery) : null,
    summary.tone === "active" ? vacuum?.currentRoom : null,
    summary.tone !== "active" && vacuum?.lastCleaned
      ? t.lastCleaned(vacuum.lastCleaned)
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const low = vacuum?.consumables.filter((item) => item.low) ?? [];
  return (
    <StatusCard
      icon={Bot}
      tone={summary.tone}
      title={`${summary.name} · ${summary.state}`}
      description={description}
      route={{ screen: "vacuum" }}
    >
      {vacuum?.progress != null && (
        <div className="space-y-1.5">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${vacuum.progress}%` }}
            />
          </div>
          <p className="text-xs tabular-nums text-muted-foreground">
            {t.cleaningProgress(vacuum.progress)}
          </p>
        </div>
      )}
      {low.length > 0 && (
        <Note>
          <span className="flex min-w-0 items-center gap-1.5">
            <Wrench className="size-3.5 shrink-0" />
            <span className="truncate">
              {t.maintenance}
              {" · "}
              {low.map((item) => `${item.name} ${item.value}`).join(" · ")}
            </span>
          </span>
        </Note>
      )}
    </StatusCard>
  );
}

const seriesColors = [
  "bg-chart-1 text-chart-1-foreground",
  "bg-chart-2 text-chart-2-foreground",
  "bg-chart-3 text-chart-3-foreground",
];
// Below this share, a segment is too narrow for its value, which moves to the legend.
const minLabelShare = 0.12;

export function PowerCard({
  power,
  language,
}: {
  power: NonNullable<HomeData["plugPower"]>;
  language: string;
}) {
  const t = messages(language);
  const unavailable = power.total === t.unavailable;
  const segments = [
    ...power.consumers.map((consumer, index) => ({
      ...consumer,
      color: seriesColors[index],
    })),
    ...(power.others
      ? [
          {
            name: t.otherPlugs,
            ...power.others,
            color: "bg-muted-foreground/30 text-foreground",
          },
        ]
      : []),
  ];
  // Plugs under 1 W are left out, so the segments fill the gauge between them.
  const shown = segments.reduce((total, segment) => total + segment.share, 0);
  return (
    <StatusCard
      icon={Plug}
      tone="idle"
      title={unavailable ? t.plugs : `${t.plugs} · ${power.total} W`}
      description={unavailable ? t.unavailable : t.plugsRunning(power.running)}
      route={{ screen: "energy" }}
    >
      {segments.length > 0 && (
        <div className="space-y-2">
          <div className="flex h-[1.125rem] gap-[3px]">
            {segments.map((segment) => (
              <div
                key={segment.name}
                className={cn(
                  "flex h-full min-w-0 basis-0 items-center rounded-full justify-center text-[0.625rem] leading-none tabular-nums transition-[flex-grow] duration-500",
                  segment.color,
                )}
                style={{ flexGrow: segment.share / shown }}
              >
                {segment.share >= minLabelShare && `${segment.watts} W`}
              </div>
            ))}
          </div>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {segments.map((segment) => (
              <li key={segment.name} className="flex min-w-0 items-center gap-1.5">
                <span className={cn("size-2 shrink-0 rounded-full", segment.color)} />
                <span className="truncate">{segment.name}</span>
                {segment.share < minLabelShare && (
                  <span className="tabular-nums">
                    {segment.watts} W
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </StatusCard>
  );
}
