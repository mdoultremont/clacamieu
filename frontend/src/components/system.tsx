import {
  BatteryLow,
  ChevronLeft,
  ChevronRight,
  Download,
  WifiOff,
  Wrench,
} from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { messages } from "../i18n";
import { navigate } from "../navigation";
import { buildSystemView, type SystemEntity } from "../system-view";
import type { HassLike } from "../types";
import { ItemSection } from "./item-section";
import { RouteLink } from "./route-link";
import { Button } from "./ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemSeparator,
  ItemTitle,
} from "./ui/item";

export function System({
  hass,
  now,
  onMoreInfo,
}: {
  hass: HassLike;
  now: Date;
  onMoreInfo: (id: string) => void;
}) {
  const t = messages(hass.language);
  const view = buildSystemView(hass, now);
  const [repairs, setRepairs] = useState<number | null>(null);
  const [repairsError, setRepairsError] = useState(false);
  useEffect(() => {
    let current = true;
    hass
      .callWS<{ issues: { ignored: boolean }[] }>({
        type: "repairs/list_issues",
      })
      .then(({ issues }) => {
        if (current) {
          setRepairs(issues.filter((issue) => !issue.ignored).length);
          setRepairsError(false);
        }
      })
      .catch(() => {
        if (current) {
          setRepairs(null);
          setRepairsError(true);
        }
      });
    return () => {
      current = false;
    };
  }, [hass.callWS, now]);
  const stats = [
    {
      label: t.unavailableEntities,
      count: view.unavailable.length,
      problem: true,
      icon: WifiOff,
    },
    {
      label: t.lowBatteries,
      count: view.batteries.length,
      problem: true,
      icon: BatteryLow,
    },
    {
      label: t.pendingUpdates,
      count: view.updates.length,
      problem: false,
      icon: Download,
    },
    ...(repairs === null
      ? []
      : [{ label: t.repairs, count: repairs, icon: Wrench, problem: true }]),
  ];
  const groups = [
    {
      title: t.unavailableEntities,
      empty: t.noUnavailable,
      rows: view.unavailable.map((entity) => ({
        ...entity,
        detail: entity.since,
      })),
    },
    {
      title: t.lowBatteries,
      empty: t.noLowBatteries,
      rows: view.batteries.map((entity) => ({
        ...entity,
        detail: entity.value,
      })),
    },
    {
      title: t.pendingUpdates,
      empty: t.noUpdates,
      rows: view.updates.map((entity) => ({
        ...entity,
        detail: t.updateVersions(entity.installed, entity.latest),
      })),
    },
  ];
  return (
    <>
      <header className="space-y-2">
        <Button variant="ghost" className="-ml-3 min-h-11" asChild>
          <RouteLink route={{ screen: "more" }}>
            <ChevronLeft />
            {t.more}
          </RouteLink>
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">{t.systemPage}</h1>
        <p className="text-muted-foreground">{t.systemSummary}</p>
      </header>
      <div className="grid grid-cols-2 gap-3">
        {stats.map(({ label, count, icon: Icon, problem }) => (
          <div
            key={label}
            className="min-w-0 space-y-2 rounded-xl border bg-card p-4"
          >
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Icon className="size-4 shrink-0" />
              {label}
            </div>
            <p
              className={`text-2xl font-semibold tabular-nums ${count && problem ? "text-destructive" : ""}`}
            >
              {count}
            </p>
          </div>
        ))}
      </div>
      {repairsError && (
        <p className="error" role="alert">
          {t.repairsError}
        </p>
      )}
      {groups.map((group) => (
        <ItemSection key={group.title} title={group.title}>
          {group.rows.length === 0 ? (
            <Item size="sm" role="listitem">
              <ItemDescription>{group.empty}</ItemDescription>
            </Item>
          ) : (
            group.rows.map((entity, index) => (
              <Fragment key={entity.id}>
                {index > 0 && <ItemSeparator />}
                <EntityRow entity={entity} onMoreInfo={onMoreInfo} />
              </Fragment>
            ))
          )}
        </ItemSection>
      ))}
      {hass.user.is_admin && (
        <ItemSection title={t.settings}>
          {[
            { path: "/config/updates", title: t.pendingUpdates },
            ...(repairs === null
              ? []
              : [{ path: "/config/repairs", title: t.repairs }]),
          ].map((link, index) => (
            <Fragment key={link.path}>
              {index > 0 && <ItemSeparator />}
              <div role="listitem">
                <Item size="sm" asChild>
                  <a
                    href={link.path}
                    onClick={(event) => {
                      if (
                        event.button ||
                        event.metaKey ||
                        event.ctrlKey ||
                        event.shiftKey ||
                        event.altKey
                      )
                        return;
                      event.preventDefault();
                      navigate(link.path);
                    }}
                  >
                    <ItemContent>
                      <ItemTitle>{link.title}</ItemTitle>
                    </ItemContent>
                    <ItemActions>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </ItemActions>
                  </a>
                </Item>
              </div>
            </Fragment>
          ))}
        </ItemSection>
      )}
    </>
  );
}

function EntityRow({
  entity,
  onMoreInfo,
}: {
  entity: SystemEntity & { detail: string };
  onMoreInfo: (id: string) => void;
}) {
  return (
    <div role="listitem">
      <Item size="sm" asChild>
        <button
          type="button"
          className="w-full text-left hover:bg-accent/50"
          onClick={() => onMoreInfo(entity.id)}
        >
          <ItemContent>
            <ItemTitle>{entity.name}</ItemTitle>
            <ItemDescription>
              {[entity.area, entity.detail].filter(Boolean).join(" · ")}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <ChevronRight className="size-4 text-muted-foreground" />
          </ItemActions>
        </button>
      </Item>
    </div>
  );
}
