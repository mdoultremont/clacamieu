import { useEffect, useState, useSyncExternalStore } from "react";
import { Ellipsis, House, LayoutGrid, Shield, Zap } from "lucide-react";
import { Configuration } from "./components/configuration";
import { Home } from "./components/home";
import { Room } from "./components/room";
import { Rooms } from "./components/rooms";
import { buildRoomView, buildRoomsView } from "./room-view";
import { navigate, parseRoute, routePath } from "./navigation";
import { More } from "./components/more";
import { parseDashboardConfig } from "./dashboard-config";
import { buildHomeView } from "./home-view";
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
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  async function runAction(action: ServiceAction) {
    if (!hass || busy) return;
    setBusy(true);
    setError(null);
    try {
      await hass.callService(
        action.domain,
        action.service,
        "data" in action ? action.data : {},
        { entity_id: action.entityId },
      );
    } catch (reason) {
      setError(
        reason instanceof Error && reason.name === "DevelopmentWriteBlocked"
          ? t.blockedError
          : t.actionError,
      );
    } finally {
      setBusy(false);
    }
  }
  if (!hass || (route.screen === "configuration" && !configLoaded))
    return (
      <div className="loading" role="status">
        {t.loading}
      </div>
    );
  const room =
    route.screen === "room" ? buildRoomView(hass, config, route.areaId) : null;
  const tabs = [
    { key: "home", label: t.home, icon: House },
    { key: "rooms", label: t.rooms, icon: LayoutGrid },
    { key: "security", label: t.security, icon: Shield },
    { key: "energy", label: t.energy, icon: Zap },
    { key: "more", label: t.more, icon: Ellipsis },
  ] as const;
  return (
    <div
      className={`panel-shell ${narrow ? "narrow" : "wide"}`}
      lang={hass.language}
    >
      {route.screen === "configuration" && hass.user.is_admin ? (
        <Configuration
          hass={hass}
          config={config}
          onCancel={() => {
            navigate(routePath({ screen: "home" }), { replace: true });
          }}
          onSave={async (draft) => {
            const saved = await hass.callWS<unknown>({
              type: "clacamieu/dashboard/config/update",
              ...draft,
            });
            setConfig(parseDashboardConfig(saved));
            navigate(routePath({ screen: "home" }), { replace: true });
            setError(null);
          }}
        />
      ) : (
        <>
          <main className="page-scroll">
            <div className="page-content">
              {route.screen === "home" ? (
                <Home
                  view={buildHomeView(hass, config, now)}
                  language={hass.language}
                  onAction={runAction}
                  busy={busy}
                  onConfigure={
                    hass.user.is_admin && configLoaded
                      ? () => navigate(routePath({ screen: "configuration" }))
                      : undefined
                  }
                />
              ) : route.screen === "rooms" ||
                (route.screen === "room" && !room) ? (
                <Rooms
                  rooms={buildRoomsView(hass, config)}
                  language={hass.language}
                />
              ) : route.screen === "room" ? (
                <Room
                  key={route.areaId}
                  view={room!}
                  language={hass.language}
                  onAction={runAction}
                  busy={busy}
                  error={error}
                />
              ) : (
                <More
                  hass={hass}
                  panel={panel}
                  onConfigure={
                    configLoaded
                      ? () => navigate(routePath({ screen: "configuration" }))
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
              {route.screen === "home" && error && (
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
                  disabled={key !== "home" && key !== "more" && key !== "rooms"}
                  aria-current={
                    (route.screen === "room" ? "rooms" : route.screen) === key
                      ? "page"
                      : undefined
                  }
                  onClick={() => {
                    if (key === "home" || key === "more" || key === "rooms") {
                      navigate(routePath({ screen: key }));
                      setError(null);
                    }
                  }}
                >
                  <Icon size={20} strokeWidth={1.7} />
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
