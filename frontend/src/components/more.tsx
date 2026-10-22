import { Fragment, useEffect, useState } from "react";
import {
  ChevronRight,
  House,
  LayoutDashboard,
  Menu,
  Settings,
  Bot,
  Activity,
  Sprout,
  Thermometer,
} from "lucide-react";
import { messages } from "../i18n";
import { navigate } from "../navigation";
import {
  readPreferences,
  setDefaultPanel,
  type CorePreferences,
} from "../preferences";
import type { DashboardConfig, HassLike, PanelInfo } from "../types";
import { buildVacuumView } from "../vacuum-view";
import { RouteLink } from "./route-link";
import { ItemSection } from "./item-section";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "./ui/item";
import type { ComfortView } from "../comfort-view";
import type { GardenView } from "../garden-view";
import { Skeleton } from "./ui/skeleton";
import { Switch } from "./ui/switch";

type PreferenceState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready" | "saving"; value: CorePreferences };

export function More({
  hass,
  config,
  panel,
  toggleMenu,
  onConfigure,
  comfort,
  garden,
}: {
  hass: HassLike;
  config: DashboardConfig;
  comfort: ComfortView;
  garden: GardenView;
  panel: PanelInfo;
  toggleMenu: () => void;
  onConfigure?: () => void;
}) {
  const t = messages(hass.language);
  const [preference, setPreference] = useState<PreferenceState>({
    status: "loading",
  });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    readPreferences(hass)
      .then((value) => {
        if (current) setPreference({ status: "ready", value });
      })
      .catch(() => {
        if (current) setPreference({ status: "error" });
      });
    return () => {
      current = false;
    };
  }, [hass.callWS]);
  async function changeDefault(enabled: boolean) {
    if (preference.status !== "ready") return;
    setError(null);
    setPreference({ status: "saving", value: preference.value });
    try {
      const value = await setDefaultPanel(hass, panel.url_path, enabled);
      setPreference({ status: "ready", value });
    } catch (reason) {
      setPreference(preference);
      setError(
        reason instanceof Error && reason.name === "DevelopmentWriteBlocked"
          ? t.blockedError
          : t.actionError,
      );
    }
  }
  const dashboards = Object.values(hass.panels).filter(
    (entry) => entry.component_name === "lovelace",
  );
  const vacuum = buildVacuumView(hass, config);
  const maisonPages = [
    ...(comfort.rooms.some(
      (room) =>
        room.temperature !== null ||
        room.humidity !== null ||
        room.co2 !== null ||
        room.dewPoint !== null,
    )
      ? [
          {
            screen: "comfort" as const,
            title: t.comfort,
            summary: t.comfortSummary,
            icon: Thermometer,
          },
        ]
      : []),
    ...(vacuum
      ? [
          {
            screen: "vacuum" as const,
            title: vacuum.name,
            summary: t.vacuumSummary,
            icon: Bot,
          },
        ]
      : []),
    ...(garden.weather || garden.areas.length || garden.valves.length
      ? [
          {
            screen: "garden" as const,
            title: t.garden,
            summary: t.gardenSummary,
            icon: Sprout,
          },
        ]
      : []),
    ...(Object.keys(hass.states).length
      ? [
          {
            screen: "system" as const,
            title: t.systemPage,
            summary: t.systemSummary,
            icon: Activity,
          },
        ]
      : []),
  ];
  return (
    <>
      <header>
        <h1 className="text-xl font-semibold tracking-tight">{t.more}</h1>
      </header>
      {maisonPages.length > 0 && (
        <ItemSection title={t.maison}>
          {maisonPages.map(({ screen, title, summary, icon: Icon }, index) => (
            <Fragment key={screen}>
              {index > 0 && <ItemSeparator />}
              <div role="listitem">
                <Item size="sm" asChild>
                  <RouteLink route={{ screen }}>
                    <ItemMedia className="text-muted-foreground">
                      <Icon className="size-4" />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{title}</ItemTitle>
                      <ItemDescription>{summary}</ItemDescription>
                    </ItemContent>
                    <ItemActions className="text-muted-foreground">
                      <ChevronRight className="size-4" />
                    </ItemActions>
                  </RouteLink>
                </Item>
              </div>
            </Fragment>
          ))}
        </ItemSection>
      )}
      {dashboards.length > 0 && (
        <ItemSection title={t.dashboards}>
          {dashboards.map((entry, index) => (
            <Fragment key={entry.url_path}>
              {index > 0 && <ItemSeparator />}
              <div role="listitem">
                <Item size="sm" asChild>
                  <a
                    href={`/${entry.url_path}`}
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
                      navigate(`/${entry.url_path}`);
                    }}
                  >
                    <ItemMedia className="text-muted-foreground">
                      <LayoutDashboard className="size-4" />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{entry.title ?? t.overview}</ItemTitle>
                    </ItemContent>
                    <ItemActions className="text-muted-foreground">
                      <ChevronRight className="size-4" />
                    </ItemActions>
                  </a>
                </Item>
              </div>
            </Fragment>
          ))}
        </ItemSection>
      )}
      <ItemSection title={t.preferences}>
        {hass.user.is_admin && onConfigure && (
          <>
            <div role="listitem">
              <Item size="sm" asChild>
                <button
                  type="button"
                  className="min-h-11 w-full text-left hover:bg-accent/50"
                  onClick={onConfigure}
                >
                  <ItemMedia className="text-muted-foreground">
                    <House className="size-4" />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{t.configureMaison}</ItemTitle>
                  </ItemContent>
                  <ItemActions className="text-muted-foreground">
                    <ChevronRight className="size-4" />
                  </ItemActions>
                </button>
              </Item>
            </div>
            <ItemSeparator />
          </>
        )}
        {hass.user.is_admin && (
          <>
            <div role="listitem">
              <Item size="sm" asChild>
                <a
                  href="/config"
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
                    navigate("/config");
                  }}
                >
                  <ItemMedia className="text-muted-foreground">
                    <Settings className="size-4" />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{t.settings}</ItemTitle>
                  </ItemContent>
                  <ItemActions className="text-muted-foreground">
                    <ChevronRight className="size-4" />
                  </ItemActions>
                </a>
              </Item>
            </div>
            <ItemSeparator />
          </>
        )}
        <div role="listitem">
          <Item size="sm" asChild>
            <button
              type="button"
              className="w-full text-left hover:bg-accent/50"
              onClick={toggleMenu}
            >
              <ItemMedia className="text-muted-foreground">
                <Menu className="size-4" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{t.haMenu}</ItemTitle>
              </ItemContent>
              <ItemActions className="text-muted-foreground">
                <ChevronRight className="size-4" />
              </ItemActions>
            </button>
          </Item>
        </div>
        <ItemSeparator />
        <Item role="listitem" size="sm" asChild>
          <label htmlFor="default-panel" className="cursor-pointer">
            <ItemMedia className="text-muted-foreground">
              <House className="size-4" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{t.defaultPanel}</ItemTitle>
            </ItemContent>
            <ItemActions className="switch-target">
              {preference.status === "loading" ? (
                <Skeleton className="h-5 w-8 rounded-full" />
              ) : (
                <Switch
                  id="default-panel"
                  checked={
                    "value" in preference &&
                    preference.value.default_panel === panel.url_path
                  }
                  disabled={preference.status !== "ready"}
                  onCheckedChange={changeDefault}
                />
              )}
            </ItemActions>
          </label>
        </Item>
      </ItemSection>
      {preference.status === "error" && (
        <p className="error" role="alert">
          {t.preferenceError}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
