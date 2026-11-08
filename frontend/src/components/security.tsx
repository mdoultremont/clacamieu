import {
  Camera,
  ChevronRight,
  DoorClosed,
  Droplets,
  History,
  Shield,
  Siren,
  SlidersHorizontal,
} from "lucide-react";
import {
  useEffect,
  useId,
  useState,
  type ComponentType,
  type MouseEvent,
} from "react";
import { cn } from "cn";
import {
  activityEntityIds,
  buildActivity,
  type ActivityTone,
} from "../activity-view";
import { navigate } from "../navigation";
import { Tray } from "./tray";
import { messages, type Messages } from "../i18n";
import { useActivity } from "../use-activity";
import type {
  SecuritySensorGroup,
  SecurityView,
} from "../security-view";
import type { HassLike } from "../types";
import { AlarmModes } from "./alarm-modes";
import { SecurityCustomization } from "./security-customization";
import { SensorRows } from "./sensor-rows";
import { Button } from "./ui/button";
import { ItemSection } from "./item-section";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "./ui/item";

export function Security({
  view,
  hass,
  now,
  onMoreInfo,
  onCustomize,
}: {
  view: SecurityView;
  hass: HassLike;
  now: Date;
  onMoreInfo: (entityId: string) => void;
  /** Saves the sensors left out of Security; absent for non-admins. */
  onCustomize?: (hidden: string[]) => Promise<void>;
}) {
  const t = messages(hass.language);
  const [customizing, setCustomizing] = useState(false);
  return (
    <>
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">{t.security}</h1>
        {onCustomize && (
          <Button
            variant="ghost"
            size="icon"
            className="-my-2 size-11 shrink-0 text-muted-foreground"
            aria-label={t.customizeSecurity}
            title={t.customizeSecurity}
            onClick={() => setCustomizing(true)}
          >
            <SlidersHorizontal />
          </Button>
        )}
      </header>
      {view.alarm && (
        <Alarm key={view.alarm.id} alarm={view.alarm} hass={hass} />
      )}
      {view.cameras.length > 0 && (
        <section aria-label={t.cameras} className="space-y-2">
          <h2 className="flex items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground">
            <Camera className="size-3.5" />
            {t.cameras}
          </h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,16rem),1fr))] gap-3">
            {view.cameras.map((camera) => (
              <CameraStill
                key={camera.id}
                camera={camera}
                hass={hass}
                onOpen={() => onMoreInfo(camera.id)}
              />
            ))}
          </div>
        </section>
      )}
      {sensorGroups(t).map(({ key, title, icon }) =>
        key !== "detectors" || view.detectors.sensors.length > 0 ? (
          <SensorGroup
            key={key}
            title={title}
            group={view[key]}
            icon={icon}
            hass={hass}
            now={now}
            onMoreInfo={onMoreInfo}
          />
        ) : null,
      )}
      <Activity hass={hass} onMoreInfo={onMoreInfo} />
      {onCustomize && (
        <SecurityCustomization
          view={view}
          language={hass.language}
          open={customizing}
          onOpenChange={setCustomizing}
          onSave={onCustomize}
        />
      )}
    </>
  );
}

export const sensorGroups = (t: Messages) =>
  [
    { key: "openings", title: t.openings, icon: DoorClosed },
    { key: "leaks", title: t.leaks, icon: Droplets },
    { key: "detectors", title: t.detectors, icon: Siren },
  ] as const;

function Alarm({
  alarm,
  hass,
}: {
  alarm: NonNullable<SecurityView["alarm"]>;
  hass: HassLike;
}) {
  const t = messages(hass.language);
  return (
    <ItemSection title={t.alarmLabel}>
      <Item role="listitem" size="sm">
        <ItemMedia className="text-muted-foreground">
          <Shield className="size-4" />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>{alarm.title}</ItemTitle>
          {alarm.description && (
            <ItemDescription>{alarm.description}</ItemDescription>
          )}
        </ItemContent>
      </Item>
      <ItemSeparator />
      <div className="p-4">
        <AlarmModes alarm={alarm} hass={hass} />
      </div>
    </ItemSection>
  );
}

function CameraStill({
  camera,
  hass,
  onOpen,
}: {
  camera: SecurityView["cameras"][number];
  hass: HassLike;
  onOpen: () => void;
}) {
  const [refresh, setRefresh] = useState(() => Date.now());
  const [loaded, setLoaded] = useState(false);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  useEffect(() => {
    let timer: number | undefined;
    const schedule = (refreshNow: boolean) => {
      window.clearInterval(timer);
      if (document.visibilityState === "hidden") return;
      if (refreshNow) setRefresh(Date.now());
      timer = window.setInterval(() => setRefresh(Date.now()), 10_000);
    };
    const updateVisibility = () => schedule(true);
    schedule(false);
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);
  const source = camera.picture
    ? (hass.hassUrl?.(camera.picture) ?? camera.picture)
    : null;
  const image = source
    ? `${source}${source.includes("?") ? "&" : "?"}_clacamieu=${refresh}`
    : null;
  return (
    <Tray info={<span className="truncate">{camera.name}</span>}>
      <button
        type="button"
        aria-label={camera.name}
        className="tray-card relative flex aspect-video items-center justify-center overflow-hidden text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        onClick={onOpen}
      >
        {image && failedSource !== image && (
          <img
            src={image}
            alt=""
            className={`absolute inset-0 h-full w-full object-cover ${loaded ? "" : "opacity-0"}`}
            onLoad={() => setLoaded(true)}
            onError={() => {
              setLoaded(false);
              setFailedSource(image);
            }}
          />
        )}
        {(!loaded || !image || failedSource === image) && (
          <span className="flex flex-col items-center gap-1 px-2 text-center text-xs">
            <Camera className="size-5" />
            {image && failedSource !== image
              ? messages(hass.language).cameraLoading
              : messages(hass.language).unavailable}
          </span>
        )}
      </button>
    </Tray>
  );
}

function SensorGroup({
  title,
  group,
  icon: Icon,
  hass,
  now,
  onMoreInfo,
}: {
  title: string;
  group: SecuritySensorGroup;
  icon: ComponentType<{ className?: string }>;
  hass: HassLike;
  now: Date;
  onMoreInfo: (entityId: string) => void;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-2">
      <div className="flex items-baseline justify-between gap-3 px-1 text-xs text-muted-foreground">
        <h2 id={id} className="flex items-center gap-1.5 font-medium">
          <Icon className="size-3.5" />
          {title}
        </h2>
        <p className={cn("text-right", group.alert && "font-medium text-air-poor")}>
          {group.summary}
        </p>
      </div>
      {group.sensors.length > 0 && (
        <SensorRows
          sensors={group.sensors}
          hass={hass}
          now={now}
          onMoreInfo={onMoreInfo}
        />
      )}
    </section>
  );
}

const collapsedEvents = 10;

const toneDot: Record<ActivityTone, string> = {
  idle: "bg-muted-foreground/40",
  active: "bg-glow",
  alert: "bg-air-poor",
};

function Activity({
  hass,
  onMoreInfo,
}: {
  hass: HassLike;
  onMoreInfo: (entityId: string) => void;
}) {
  const t = messages(hass.language);
  const entries = useActivity(hass);
  const logbook = `/logbook?entity_id=${activityEntityIds(hass).join(",")}`;
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  if (entries === null) return null;
  const all = buildActivity(hass, entries, new Date());
  const total = all.reduce((count, day) => count + day.events.length, 0);
  // Show the newest events first, and the rest on demand.
  let budget = expanded ? total : collapsedEvents;
  const days = all.flatMap((day) => {
    const events = day.events.slice(0, budget);
    budget -= events.length;
    return events.length ? [{ ...day, events }] : [];
  });
  return (
    <section aria-labelledby={id} className="space-y-2">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2
          id={id}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
        >
          <History className="size-3.5" />
          {t.activity}
        </h2>
        <a
          href={hass.hassUrl?.(logbook) ?? logbook}
          onClick={(event) => openHomeAssistantPage(event, hass, logbook)}
          className="-my-3 -mr-1 flex min-h-11 items-center gap-0.5 px-1 text-xs font-medium text-muted-foreground"
        >
          {t.seeAll}
          <ChevronRight className="size-3.5" />
        </a>
      </div>
      <Tray>
        <div className="tray-card px-4 py-3">
          {!days.length && (
            <p className="py-1 text-sm text-muted-foreground">{t.noActivity}</p>
          )}
          {days.map((day) => (
            <div key={day.label} className="not-first:mt-3">
              <h3 className="mb-1 text-xs font-medium text-muted-foreground">
                {day.label}
              </h3>
              <ol className="relative">
                <span
                  aria-hidden
                  className="absolute top-3 bottom-3 left-[3px] w-px bg-border"
                />
                {day.events.map((event) => (
                  <li key={event.id}>
                    <button
                      type="button"
                      onClick={() => onMoreInfo(event.entityId)}
                      className="flex min-h-11 w-full items-center gap-3 rounded-md py-1.5 text-left text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:bg-muted/60"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "relative size-[7px] shrink-0 rounded-full ring-2 ring-card",
                          toneDot[event.tone],
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{event.name}</span>
                        {event.area && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {event.area}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-right">
                        <span
                          className={cn(
                            "block text-xs",
                            event.tone === "alert" && "font-medium text-air-poor",
                          )}
                        >
                          {event.state}
                        </span>
                        <span className="block text-xs tabular-nums text-muted-foreground">
                          {event.time}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          ))}
          {total > collapsedEvents && (
            <Button
              variant="ghost"
              className="mt-1 min-h-11 w-full text-muted-foreground"
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? t.showLess : t.showMore(total - collapsedEvents)}
            </Button>
          )}
        </div>
      </Tray>
    </section>
  );
}

/**
 * Opens a Home Assistant page, such as the logbook, inside Home Assistant's
 * own navigation. The development server runs elsewhere, so it opens a tab.
 */
function openHomeAssistantPage(
  event: MouseEvent<HTMLAnchorElement>,
  hass: HassLike,
  path: string,
) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey) return;
  event.preventDefault();
  const url = new URL(hass.hassUrl?.(path) ?? path, location.href);
  if (url.origin === location.origin) navigate(path);
  else window.open(url.href, "_blank", "noopener");
}
