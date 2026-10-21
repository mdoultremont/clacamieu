import { useEffect, useState } from "react";
import {
  ChevronRight,
  House,
  LayoutDashboard,
  Menu,
  Settings,
} from "lucide-react";
import { messages } from "../i18n";
import { navigate } from "../navigation";
import {
  readPreferences,
  setDefaultPanel,
  type CorePreferences,
} from "../preferences";
import type { HassLike, PanelInfo } from "../types";
import { Switch } from "./ui/switch";

type PreferenceState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready" | "saving"; value: CorePreferences };

export function More({
  hass,
  panel,
  toggleMenu,
}: {
  hass: HassLike;
  panel: PanelInfo;
  toggleMenu: () => void;
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
  return (
    <>
      <header className="greeting">
        <h1>{t.more}</h1>
      </header>
      <section aria-labelledby="dashboards-heading">
        <div className="section-heading">
          <h2 id="dashboards-heading">{t.dashboards}</h2>
        </div>
        <div className="link-list">
          {Object.values(hass.panels)
            .filter((entry) => entry.component_name === "lovelace")
            .map((entry) => (
              <a
                key={entry.url_path}
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
                className="link-row"
              >
                <LayoutDashboard size={18} />
                <span>{entry.title ?? t.overview}</span>
                <ChevronRight size={16} />
              </a>
            ))}
        </div>
      </section>
      <section aria-labelledby="preferences-heading">
        <div className="section-heading">
          <h2 id="preferences-heading">{t.preferences}</h2>
        </div>
        <div className="link-list">
          {hass.user.is_admin && (
            <a
              className="link-row"
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
              <Settings size={18} />
              <span>{t.settings}</span>
              <ChevronRight size={16} />
            </a>
          )}
          <button className="link-row" onClick={toggleMenu}>
            <Menu size={18} />
            <span>{t.haMenu}</span>
            <ChevronRight size={16} />
          </button>
          <div className="link-row">
            <House size={18} />
            <label htmlFor="default-panel">{t.defaultPanel}</label>
            <Switch
              id="default-panel"
              checked={
                "value" in preference &&
                preference.value.default_panel === panel.url_path
              }
              disabled={preference.status !== "ready"}
              onCheckedChange={changeDefault}
            />
          </div>
        </div>
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
      </section>
    </>
  );
}
