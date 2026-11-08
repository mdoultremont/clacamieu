import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Ellipsis, House, LayoutGrid, Shield, Zap } from "lucide-react";
import { Configuration } from "./components/configuration";
import { Energy } from "./components/energy";
import { Home } from "./components/home";
import { Room } from "./components/room";
import { Security } from "./components/security";
import { buildSecurityView } from "./security-view";
import { buildVacuumView, type ServiceCatalog } from "./vacuum-view";
import { Rooms } from "./components/rooms";
import { Vacuum } from "./components/vacuum";
import { System } from "./components/system";
import { buildRoomView } from "./room-view";
import { buildRoomCards } from "./room-card";
import {
  keepOriginThroughDialog,
  navigate,
  parseRoute,
  routePath,
} from "./navigation";
import { Comfort } from "./components/comfort";
import { Garden } from "./components/garden";
import { buildComfortView } from "./comfort-view";
import { buildGardenView } from "./garden-view";
import { More } from "./components/more";
import { withRoomEntities } from "./config-editor";
import { parseDashboardConfig } from "./dashboard-config";
import { buildHomeView } from "./home-view";
import { buildRoomLighting, lightingControllers } from "./room-lighting";
import { messages } from "./i18n";
import type { ClacamieuPanel, PanelStore } from "./panel";
import type { DashboardConfig, ServiceAction } from "./types";

export function App({
  store,
  host,
}: {
  store: PanelStore;
  host: ClacamieuPanel;
}) {
  const {
    hass,
    panel,
    narrow,
    route: panelRoute,
  } = useSyncExternalStore(store.subscribe, store.get);
  const requestedRoute = parseRoute(
    `${panelRoute?.prefix ?? "/clacamieu"}${panelRoute?.path ?? ""}`,
  );
  const route =
    requestedRoute.screen === "configuration" && !hass?.user.is_admin
      ? { screen: "home" as const }
      : requestedRoute;
  const [configLoaded, setConfigLoaded] = useState(false);
  const [config, setConfig] = useState<DashboardConfig>({
    home_cards: null,
    rooms: null,
  });
  const [now, setNow] = useState(() => new Date());
  const [services, setServices] = useState<ServiceCatalog>({});
  const controllers = useMemo(() => lightingControllers(services), [services]);
  const openedInPanel = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = messages(hass?.language ?? navigator.language);
  useEffect(() => {
    setError(null);
    host.shadowRoot?.querySelector(".page-scroll")?.scrollTo?.(0, 0);
  }, [panelRoute?.path, host]);
  useEffect(() => {
    if (!hass) return;
    let current = true;
    hass
      .callWS<unknown>({ type: "clacamieu/dashboard/config" })
      .then((value) => {
        if (current) {
          setConfig(parseDashboardConfig(value));
          setConfigLoaded(true);
        }
      })
      .catch(() => {
        // Editing without the stored settings would overwrite them on save.
        if (current) setConfig({ home_cards: null, rooms: null });
      });
    return () => {
      current = false;
    };
  }, [hass?.callWS]);
  useEffect(() => {
    if (!hass) return;
    let current = true;
    hass
      .callWS<ServiceCatalog>({ type: "get_services" })
      .then((catalog) => {
        if (current) setServices(catalog);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [hass?.callWS]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  async function runAction(action: ServiceAction): Promise<boolean> {
    if (!hass || busy) return false;
    setBusy(true);
    setError(null);
    try {
      await hass.callService(
        action.domain,
        action.service,
        "data" in action ? action.data : {},
        { entity_id: action.entityId },
      );
      return true;
    } catch (reason) {
      setError(
        reason instanceof Error && reason.name === "DevelopmentWriteBlocked"
          ? t.blockedError
          : t.actionError,
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  function openMoreInfo(entityId: string) {
    keepOriginThroughDialog();
    host.dispatchEvent(
      new CustomEvent("hass-more-info", {
        bubbles: true,
        composed: true,
        detail: { entityId },
      }),
    );
  }
  if (!hass || (route.screen === "configuration" && !configLoaded))
    return (
      <div className="loading" role="status">
        {t.loading}
      </div>
    );
  const room =
    route.screen === "room"
      ? buildRoomView(hass, config, route.areaId)
      : null;
  const tabs = [
    { key: "home", label: t.home, icon: House },
    { key: "rooms", label: t.rooms, icon: LayoutGrid },
    { key: "security", label: t.security, icon: Shield },
    { key: "energy", label: t.energy, icon: Zap },
    { key: "more", label: t.more, icon: Ellipsis },
  ] as const;
  const saveConfig = async (next: DashboardConfig) => {
    const saved = await hass.callWS<unknown>({
      type: "clacamieu/dashboard/config/update",
      ...next,
    });
    setConfig(parseDashboardConfig(saved));
  };
  function openConfiguration() {
    openedInPanel.current = true;
    navigate(routePath({ screen: "configuration" }));
  }
  function leaveConfiguration() {
    // Going back keeps one Home entry in history, so the next Back leaves the panel.
    if (openedInPanel.current) {
      openedInPanel.current = false;
      history.back();
    } else navigate(routePath({ screen: "home" }), { replace: true });
  }
  return (
    <div
      className={`panel-shell ${narrow ? "narrow" : "wide"}`}
      lang={hass.language}
    >
      {route.screen === "configuration" && hass.user.is_admin ? (
        <Configuration
          hass={hass}
          config={config}
          onCancel={leaveConfiguration}
          onSave={async (draft) => {
            await saveConfig(draft);
            leaveConfiguration();
            setError(null);
          }}
        />
      ) : (
        <>
          <main className="page-scroll">
            <div className="page-content">
              {route.screen === "home" ? (
                <Home
                  view={buildHomeView(hass, config, now, controllers)}
                  now={now}
                  hass={hass}
                  security={buildSecurityView(hass, config)}
                  vacuum={buildVacuumView(hass, config, { services, now })}
                  language={hass.language}
                  onAction={runAction}
                  busy={busy}
                />
              ) : route.screen === "security" ? (
                <Security
                  view={buildSecurityView(hass, config)}
                  hass={hass}
                  now={now}
                  onMoreInfo={openMoreInfo}
                  onCustomize={
                    hass.user.is_admin && configLoaded
                      ? (hidden) =>
                          saveConfig({
                            ...config,
                            security: { hidden_entity_ids: hidden },
                          })
                      : undefined
                  }
                />
              ) : route.screen === "rooms" ||
                (route.screen === "room" && !room) ? (
                <Rooms
                  rooms={buildRoomCards(hass, config, controllers)}
                  hass={hass}
                  onAction={runAction}
                  busy={busy}
                />
              ) : route.screen === "room" ? (
                <Room
                  key={route.areaId}
                  view={room!}
                  hass={hass}
                  now={now}
                  onMoreInfo={openMoreInfo}
                  lighting={buildRoomLighting(
                    hass,
                    route.areaId,
                    controllers,
                  )}
                  language={hass.language}
                  onAction={runAction}
                  busy={busy}
                  error={error}
                  onCustomize={
                    hass.user.is_admin && configLoaded
                      ? (entities) =>
                          saveConfig(
                            withRoomEntities(
                              config,
                              hass,
                              route.areaId,
                              entities,
                            ),
                          )
                      : undefined
                  }
                />
              ) : route.screen === "energy" ? (
                <Energy hass={hass} />
              ) : route.screen === "vacuum" ? (
                <Vacuum
                  hass={hass}
                  config={config}
                  now={now}
                  onAction={runAction}
                  busy={busy}
                  error={error}
                  onMoreInfo={openMoreInfo}
                  onCustomize={
                    hass.user.is_admin && configLoaded
                      ? (sections) =>
                          saveConfig({ ...config, vacuum: { sections } })
                      : undefined
                  }
                />
              ) : route.screen === "system" ? (
                <System hass={hass} now={now} onMoreInfo={openMoreInfo} />
              ) : route.screen === "comfort" ? (
                <Comfort
                  view={buildComfortView(hass, config)}
                  language={hass.language}
                />
              ) : route.screen === "garden" ? (
                <Garden
                  hass={hass}
                  view={buildGardenView(hass)}
                  onAction={runAction}
                  busy={busy}
                  error={error}
                />
              ) : (
                <More
                  hass={hass}
                  config={config}
                  panel={panel}
                  comfort={buildComfortView(hass, config)}
                  garden={buildGardenView(hass)}
                  onConfigure={
                    configLoaded
                      ? openConfiguration
                      : undefined
                  }
                  toggleMenu={() =>
                    host.dispatchEvent(
                      new Event("hass-toggle-menu", {
                        bubbles: true,
                        composed: true,
                      }),
                    )
                  }
                />
              )}
              {(route.screen === "home" ||
                route.screen === "rooms" ||
                (route.screen === "room" && !room)) &&
                error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
            </div>
          </main>
          <nav className="bottom-nav" aria-label={panel.title ?? t.home}>
            <div className="nav-inner">
              {tabs.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  aria-current={
                    (route.screen === "room"
                      ? "rooms"
                      : route.screen === "vacuum" ||
                          route.screen === "system" ||
                          route.screen === "comfort" ||
                          route.screen === "garden"
                        ? "more"
                        : route.screen) === key
                      ? "page"
                      : undefined
                  }
                  onClick={() => {
                    navigate(routePath({ screen: key }));
                    setError(null);
                  }}
                >
                  <Icon size={24} strokeWidth={1.7} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </nav>
        </>
      )}
    </div>
  );
}
