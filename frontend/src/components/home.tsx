import {
  Bot,
  CloudSun,
  Droplets,
  Lightbulb,
  Play,
  ShieldCheck,
  Thermometer,
  Wind,
  Zap,
} from "lucide-react";
import { messages } from "../i18n";
import type { HomeView, ServiceAction } from "../types";
import { Button } from "./ui/button";

export function Home({
  view,
  language,
  onAction,
  busy,
}: {
  view: HomeView;
  language: string;
  onAction: (action: ServiceAction) => void;
  busy: boolean;
}) {
  const t = messages(language);
  return (
    <>
      <header className="greeting">
        <p className="eyebrow">{view.date}</p>
        <h1>{view.greeting}</h1>
      </header>
      <section className="hero" aria-label={t.inside}>
        {view.indoorTemperature !== null && (
          <div className="big-number">
            {view.indoorTemperature}
            <span>°</span>
          </div>
        )}
        <div className="hero-label">
          <p>{t.inside}</p>
          {view.weather && (
            <p className="weather">
              <CloudSun size={13} />
              {t.outside}{" "}
              {view.weather.temperature !== null &&
                `${view.weather.temperature}° · `}
              {view.weather.condition}
            </p>
          )}
        </div>
      </section>
      {view.people.length > 0 && (
        <div className="people">
          {view.people.map((person) => (
            <span
              key={person.id}
              className={`person ${person.currentUser ? "current" : ""}`}
            >
              <span className={`presence ${person.home ? "at-home" : ""}`} />
              {person.name}
            </span>
          ))}
        </div>
      )}
      {view.alarm && (
        <section className="status-card" aria-label={view.alarm.title}>
          <div className={`status-icon ${view.alarm.tone}`}>
            <ShieldCheck size={18} />
          </div>
          <div className="status-copy">
            <h2>{view.alarm.title}</h2>
            {view.alarm.subtitle && <p>{view.alarm.subtitle}</p>}
          </div>
          {view.alarm.action && (
            <Button
              disabled={busy}
              onClick={() => view.alarm?.action && onAction(view.alarm.action)}
            >
              {view.alarm.action.label}
            </Button>
          )}
        </section>
      )}
      {view.vacuum && (
        <section className="status-card" aria-label={view.vacuum.name}>
          <div className="status-icon sky">
            <Bot size={18} />
          </div>
          <div className="status-copy">
            <h2>{view.vacuum.name}</h2>
            <p>
              {view.vacuum.state}
              {view.vacuum.battery !== null && ` · ${view.vacuum.battery} %`}
            </p>
          </div>
          {view.vacuum.action && (
            <Button
              disabled={busy}
              onClick={() =>
                view.vacuum?.action && onAction(view.vacuum.action)
              }
            >
              {view.vacuum.action.service === "start" && <Play size={12} />}
              {view.vacuum.action.label}
            </Button>
          )}
        </section>
      )}
      <section className="rooms-section" aria-labelledby="rooms-heading">
        <div className="section-heading">
          <h2 id="rooms-heading">{t.rooms}</h2>
          <span>{t.lightsOn(view.lightsOn)}</span>
        </div>
        <div className="room-grid">
          {view.rooms.map((room) => (
            <article className="room" key={room.id}>
              <div className="room-top">
                <h3>{room.name}</h3>
                <span className={`lamp ${room.lightsOn ? "on" : ""}`}>
                  <Lightbulb size={14} />
                </span>
              </div>
              <div className="climate">
                {room.temperature !== null && (
                  <span className="temperature">
                    <Thermometer size={12} />
                    <b>{room.temperature}°</b>
                  </span>
                )}
                {room.humidity !== null && (
                  <span>
                    <Droplets size={12} />
                    {room.humidity} %
                  </span>
                )}
                {room.co2 !== null && (
                  <span>
                    <Wind size={12} />
                    {room.co2} ppm
                  </span>
                )}
                {room.temperature === null &&
                  room.humidity === null &&
                  room.co2 === null && <span>{t.noClimate}</span>}
              </div>
            </article>
          ))}
        </div>
        {!view.rooms.length && <p className="muted">{t.noRooms}</p>}
      </section>
      {view.plugPower && (
        <section className="power-card" aria-label={t.plugPower}>
          <p className="power-label">
            <Zap size={13} />
            {t.plugPower}
          </p>
          <div className="power-number">
            {view.plugPower.total} <span>W</span>
          </div>
          <p className="muted">{view.plugPower.topConsumer}</p>
        </section>
      )}
    </>
  );
}
