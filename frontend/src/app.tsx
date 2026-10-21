import { useEffect, useState, useSyncExternalStore } from "react";
import { Ellipsis, House, LayoutGrid, Shield, Zap } from "lucide-react";
import { Home } from "./components/home";
import { More } from "./components/more";
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
  const { hass, panel, narrow } = useSyncExternalStore(
    store.subscribe,
    store.get,
  );
  const [tab, setTab] = useState<"home" | "more">(() =>
    import.meta.env.DEV &&
    new URLSearchParams(location.search).get("tab") === "plus"
      ? "more"
      : "home",
  );
  const [config, setConfig] = useState<DashboardConfig>({ room_area_ids: [] });
  const [now, setNow] = useState(() => new Date());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = messages(hass?.language ?? navigator.language);
  useEffect(() => {
    if (!hass) return;
    let current = true;
    hass
      .callWS<DashboardConfig>({ type: "clacamieu/dashboard/config" })
      .then((value) => {
        if (
          current &&
          Array.isArray(value.room_area_ids) &&
          value.room_area_ids.every((id) => typeof id === "string")
        )
          setConfig(value);
      })
      .catch(() => {
        if (current) setConfig({ room_area_ids: [] });
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
        {},
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
  if (!hass)
    return (
      <div className="loading" role="status">
        {t.loading}
      </div>
    );
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
      <main className="page-scroll">
        <div className="page-content">
          {tab === "home" ? (
            <Home
              view={buildHomeView(hass, config, now)}
              language={hass.language}
              onAction={runAction}
              busy={busy}
            />
          ) : (
            <More
              hass={hass}
              panel={panel}
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
          {tab === "home" && error && (
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
              disabled={key !== "home" && key !== "more"}
              aria-current={tab === key ? "page" : undefined}
              onClick={() => {
                if (key === "home" || key === "more") {
                  setTab(key);
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
    </div>
  );
}
