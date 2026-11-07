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
import { Fragment, type ReactNode } from "react";
import { cn } from "cn";
import { messages } from "../i18n";
import type { Route } from "../navigation";
import type { SecuritySensorGroup, SecurityView } from "../security-view";
import { buildPlugPowerView } from "../plug-power-view";
import type { HassLike, HomeData, Tone } from "../types";
import { useEnergyToday } from "../use-energy";
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

function Total({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-right">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <span className="block text-lg font-semibold">{value}</span>
    </span>
  );
}

export function PowerCard({
  power,
  hass,
}: {
  power: NonNullable<HomeData["plugPower"]>;
  hass: HassLike;
}) {
  const t = messages(hass.language);
  const today = useEnergyToday(
    hass,
    power.plugs.flatMap((plug) => (plug.energyId ? [plug.energyId] : [])),
  );
  const view = buildPlugPowerView(power.plugs, today, hass.language);
  const columns = view.tracksEnergy
    ? "grid-cols-[minmax(0,1fr)_auto_auto]"
    : "grid-cols-[minmax(0,1fr)_auto]";
  return (
    <StatusCard
      icon={Plug}
      tone="idle"
      title={t.energyConsumption}
      description={view.watts ? t.plugsRunning(view.running) : t.unavailable}
      route={{ screen: "energy" }}
    >
      {view.watts && (
        <div
          className={cn(
            "grid items-center gap-x-4 gap-y-1.5 text-sm tabular-nums",
            columns,
          )}
        >
          <span />
          <Total label={t.plugsNow} value={view.watts} />
          {view.tracksEnergy && (
            <Total label={t.today} value={view.today ?? "—"} />
          )}
          {view.rows.length > 0 && <span className="col-span-full h-1" />}
          {view.rows.map((row, index) => (
            <Fragment key={index}>
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    row.running ? "bg-chart-1" : "bg-muted-foreground/30",
                  )}
                />
                <span className="truncate">{row.name}</span>
              </span>
              <span
                className={cn(
                  "text-right",
                  !row.running && "text-muted-foreground",
                )}
              >
                {row.watts ?? "—"}
              </span>
              {view.tracksEnergy && (
                <span className="text-right text-muted-foreground">
                  {row.today ?? "—"}
                </span>
              )}
            </Fragment>
          ))}
          {view.others && (
            <>
              <span className="truncate pl-3.5 text-muted-foreground">
                + {t.otherPlugs(view.others.count)}
              </span>
              <span className="text-right text-muted-foreground">
                {view.others.watts ?? "—"}
              </span>
              {view.tracksEnergy && (
                <span className="text-right text-muted-foreground">
                  {view.others.today ?? "—"}
                </span>
              )}
            </>
          )}
        </div>
      )}
    </StatusCard>
  );
}
