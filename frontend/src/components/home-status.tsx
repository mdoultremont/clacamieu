import {
  Bot,
  ChevronRight,
  DoorClosed,
  Shield,
  ShieldCheck,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { cn } from "cn";
import { messages } from "../i18n";
import type { Route } from "../navigation";
import type { SecurityView } from "../security-view";
import { buildPlugPowerView } from "../plug-power-view";
import type { HassLike, HomeData, Tone } from "../types";
import { useEnergyToday } from "../use-energy";
import type { VacuumView } from "../vacuum-view";
import { RouteLink } from "./route-link";
import { Tray } from "./tray";

export const toneClass: Record<Tone, string> = {
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
  alert,
  info,
  children,
}: {
  icon: LucideIcon;
  tone: Tone;
  title: string;
  description?: string | null;
  route: Route;
  alert?: ReactNode;
  info?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Tray alert={alert} info={info}>
      <RouteLink
        route={route}
        className="tray-card block space-y-3 p-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:bg-muted/60"
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
    </Tray>
  );
}

function LineText({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <>
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{text}</span>
    </>
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
  const alerts = [security.openings, security.leaks, security.detectors]
    .filter((group) => group.alert)
    .map((group) => group.summary);
  const { openings } = security;
  return (
    <StatusCard
      icon={summary.tone === "idle" ? Shield : ShieldCheck}
      tone={summary.tone}
      title={`${t.alarmLabel} · ${summary.status}`}
      description={security.alarm?.description}
      route={{ screen: "security" }}
      alert={
        alerts.length > 0 && (
          <span className="truncate">{alerts.join(" · ")}</span>
        )
      }
      info={
        !openings.alert &&
        openings.sensors.length > 0 && (
          <LineText icon={DoorClosed} text={openings.summary} />
        )
      }
    />
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
  const low = vacuum?.maintenance.items.filter((item) => item.flagged) ?? [];
  return (
    <StatusCard
      icon={Bot}
      tone={summary.tone}
      title={`${summary.name} · ${summary.state}`}
      description={description}
      route={{ screen: "vacuum" }}
      alert={
        summary.tone === "alert" && (
          <span className="truncate">{summary.state}</span>
        )
      }
      info={
        low.length > 0 && (
          <LineText
            icon={Wrench}
            text={[
              t.maintenance,
              ...low.map((item) => `${item.name} ${item.value}`),
            ].join(" · ")}
          />
        )
      }
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
    </StatusCard>
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
      icon={Zap}
      tone="idle"
      title={[t.energy, view.watts, view.today]
        .filter((part) => part !== null)
        .join(" · ")}
      description={view.watts ? t.plugsRunning(view.running) : t.unavailable}
      route={{ screen: "energy" }}
    >
      {view.rows.length > 0 && (
        <div
          className={cn(
            "grid items-center gap-x-4 gap-y-1.5 text-sm tabular-nums",
            columns,
          )}
        >
          {view.tracksEnergy && (
            <>
              <span />
              <span className="text-right text-xs text-muted-foreground">
                {t.plugsNow}
              </span>
              <span className="text-right text-xs text-muted-foreground">
                {t.today}
              </span>
            </>
          )}
          {view.rows.map((row, index) => (
            <Fragment key={index}>
              <span className="truncate">{row.name}</span>
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
              <span className="truncate text-muted-foreground">
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
