import {
  Bot,
  Check,
  CircleAlert,
  CircleCheck,
  Home,
  LocateFixed,
  MapPin,
  Pause,
  Play,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { cn } from "cn";
import { energyTimeZone } from "../energy-view";
import { messages } from "../i18n";
import type { DashboardConfig, HassLike, ServiceAction } from "../types";
import { useRoomHistory } from "../use-room-history";
import {
  buildVacuumView,
  cleaningAction,
  roomLastCleaned,
  roomSelection,
  type MaintenanceItem,
  type ServiceCatalog,
  type VacuumRoom,
  type VacuumView,
} from "../vacuum-view";
import { areaIcon } from "./area-icon";
import { BackLink } from "./back-link";
import { toneClass } from "./home-status";
import { Tray } from "./tray";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

type Act = (action: ServiceAction) => Promise<boolean>;

export function Vacuum({
  hass,
  config,
  now,
  busy,
  onAction,
  error,
  onMoreInfo,
}: {
  hass: HassLike;
  config: DashboardConfig;
  now: Date;
  busy: boolean;
  onAction: Act;
  error: string | null;
  onMoreInfo: (entityId: string) => void;
}) {
  const t = messages(hass.language);
  const [services, setServices] = useState<ServiceCatalog>({});
  const [servicesError, setServicesError] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [tab, setTab] = useState<"list" | "map">("list");
  useEffect(() => {
    let current = true;
    hass
      .callWS<ServiceCatalog>({ type: "get_services" })
      .then((value) => {
        if (current) setServices(value);
      })
      .catch(() => {
        if (current) setServicesError(true);
      });
    return () => {
      current = false;
    };
  }, [hass.callWS]);
  const view = buildVacuumView(hass, config, { services, now });
  const history = useRoomHistory(
    hass,
    view?.roomHistoryId ?? null,
    view?.phase ?? "",
  );
  const lastCleaned = roomLastCleaned(
    history,
    now,
    energyTimeZone(hass),
    hass.language,
  );
  const chosen = view ? roomSelection(view.rooms, selected) : [];
  const ranks = new Map(chosen.map((room, index) => [room.id, index + 1]));
  const toggle = (id: number) =>
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  return (
    <>
      <header className="space-y-2">
        <BackLink fallback={{ screen: "more" }} language={hass.language} />
        <h1 className="text-xl font-semibold tracking-tight">
          {view?.name ?? t.vacuumPage}
        </h1>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {servicesError && (
        <p className="error" role="alert">
          {t.vacuumServicesError}
        </p>
      )}
      {!view ? (
        <p className="text-muted-foreground">{t.noVacuum}</p>
      ) : (
        <>
          <StatusTray
            view={view}
            language={hass.language}
            busy={busy}
            onAction={onAction}
          />
          {view.shortcuts.length > 0 && (
            <Section title={t.shortcuts}>
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                {view.shortcuts.map((shortcut) => (
                  <Tray
                    key={shortcut.id}
                    className="w-40 shrink-0"
                    info={
                      <span className="truncate">
                        {shortcut.summary ?? "—"}
                      </span>
                    }
                  >
                    <div className="tray-card flex flex-1 flex-col gap-2 p-3">
                      <div className="flex items-center justify-between">
                        <IconSquare icon={Zap} />
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-9"
                          aria-label={shortcut.action.label}
                          disabled={busy || !shortcut.available}
                          onClick={() => onAction(shortcut.action)}
                        >
                          <Play />
                        </Button>
                      </div>
                      <p className="truncate font-medium">{shortcut.name}</p>
                    </div>
                  </Tray>
                ))}
              </div>
            </Section>
          )}
          {(view.task || view.rooms.length > 0) && (
            <Section
              title={view.task ? t.taskRooms : t.rooms}
              aside={
                view.pins && (
                  <RoomViewSwitch
                    tab={tab}
                    onTab={setTab}
                    language={hass.language}
                  />
                )
              }
            >
              {tab === "map" && view.camera && view.pins ? (
                <RoomMap camera={view.camera} language={hass.language}>
                  {(size) =>
                    !view.task && (
                      <RoomPins
                        pins={view.pins!}
                        size={size}
                        ranks={ranks}
                        disabled={!view.available}
                        onToggle={toggle}
                      />
                    )
                  }
                </RoomMap>
              ) : view.task ? (
                <TaskList view={view} language={hass.language} />
              ) : (
                <RoomList
                  view={view}
                  ranks={ranks}
                  lastCleaned={lastCleaned}
                  language={hass.language}
                  onToggle={toggle}
                />
              )}
            </Section>
          )}
          {view.camera && !view.pins && (
            <PlainMap
              camera={view.camera}
              language={hass.language}
              onMoreInfo={onMoreInfo}
            />
          )}
          {!view.underway && (
            <CleaningTray
              view={view}
              chosen={chosen}
              language={hass.language}
              busy={busy}
              onAction={onAction}
              onClear={() => setSelected(new Set())}
            />
          )}
          {view.maintenance.items.length > 0 && (
            <Section title={t.maintenance}>
              <MaintenanceTray
                maintenance={view.maintenance}
                language={hass.language}
                busy={busy}
                onAction={onAction}
              />
            </Section>
          )}
          {view.station && (
            <Section title={t.station}>
              <Tray
                alert={
                  view.station.alert && (
                    <span className="truncate">{view.station.alert}</span>
                  )
                }
                info={
                  view.station.info && (
                    <span className="truncate">{view.station.info}</span>
                  )
                }
              >
                <div className="tray-card flex items-center gap-3 p-3">
                  <IconSquare
                    icon={view.station.ready ? CircleCheck : CircleAlert}
                    className={cn(
                      !view.station.ready && "bg-destructive text-white",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {view.station.ready ? t.stationReady : t.stationCheck}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {view.station.parts}
                    </p>
                  </div>
                </div>
              </Tray>
            </Section>
          )}
          {view.statistics.length > 0 && (
            <Section title={t.statistics}>
              <Tray>
                <div className="tray-card divide-y">
                  {view.statistics.map((stat) => (
                    <div
                      key={stat.id}
                      className="flex min-h-12 items-center justify-between gap-3 px-4 py-2.5"
                    >
                      <span className="min-w-0 truncate">{stat.name}</span>
                      <span className="shrink-0 tabular-nums">
                        {stat.value}
                      </span>
                    </div>
                  ))}
                </div>
              </Tray>
            </Section>
          )}
        </>
      )}
    </>
  );
}

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-2">
      <div className="flex min-h-6 items-center justify-between gap-3 px-1 text-xs text-muted-foreground">
        <h2 id={id} className="font-medium">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function IconSquare({
  icon: Icon,
  className,
}: {
  icon: LucideIcon;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground",
        className,
      )}
    >
      <Icon className="size-[1.125rem]" />
    </span>
  );
}

const controlIcons: Record<
  VacuumView["controls"][number]["service"],
  LucideIcon
> = {
  start: Play,
  pause: Pause,
  return_to_base: Home,
  locate: LocateFixed,
};

function StatusTray({
  view,
  language,
  busy,
  onAction,
}: {
  view: VacuumView;
  language: string;
  busy: boolean;
  onAction: Act;
}) {
  const t = messages(language);
  const control = (action: VacuumView["controls"][number], index: number) => {
    const Icon = controlIcons[action.service];
    return view.underway ? (
      <Button
        key={action.service}
        variant={index === 0 ? "default" : "outline"}
        className="h-11 flex-1"
        disabled={busy || !view.available}
        onClick={() => onAction(action)}
      >
        <Icon />
        {action.label}
      </Button>
    ) : (
      <Button
        key={action.service}
        variant="outline"
        size="icon"
        className="size-11"
        aria-label={action.label}
        disabled={busy || !view.available}
        onClick={() => onAction(action)}
      >
        <Icon />
      </Button>
    );
  };
  return (
    <Tray alert={view.error && <span className="truncate">{view.error}</span>}>
      <div className="tray-card space-y-3 p-4">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "grid size-11 shrink-0 place-items-center rounded-lg",
              toneClass[view.tone],
            )}
          >
            <Bot className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{view.state}</p>
            {view.details && (
              <p className="truncate text-sm text-muted-foreground tabular-nums">
                {view.details}
              </p>
            )}
          </div>
          {!view.underway && view.controls.map(control)}
        </div>
        {view.progress !== null && (
          <div className="space-y-1.5">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500"
                style={{ width: `${view.progress}%` }}
              />
            </div>
            <p className="text-xs tabular-nums text-muted-foreground">
              {t.taskProgress(view.progress)}
            </p>
          </div>
        )}
        {view.underway && view.controls.length > 0 && (
          <div className="flex gap-2">{view.controls.map(control)}</div>
        )}
      </div>
    </Tray>
  );
}

function RoomViewSwitch({
  tab,
  onTab,
  language,
}: {
  tab: "list" | "map";
  onTab: (tab: "list" | "map") => void;
  language: string;
}) {
  const t = messages(language);
  return (
    <ToggleGroup
      type="single"
      size="sm"
      value={tab}
      aria-label={t.roomView}
      className="rounded-lg bg-muted p-0.5"
      onValueChange={(value) => {
        if (value) onTab(value as "list" | "map");
      }}
    >
      {(["list", "map"] as const).map((value) => (
        <ToggleGroupItem
          key={value}
          value={value}
          className="h-7 rounded-md px-3 text-xs data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm"
        >
          {value === "list" ? t.roomList : t.vacuumMap}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function OrderBadge({
  rank,
  filled,
}: {
  rank: number | null;
  filled: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-full border-[1.5px] text-xs font-semibold tabular-nums",
        filled
          ? "border-primary bg-primary text-primary-foreground"
          : rank !== null
            ? "border-primary text-foreground"
            : "border-border",
      )}
    >
      {rank}
    </span>
  );
}

function RoomRow({
  room,
  subtitle,
  muted,
  iconClassName,
  children,
}: {
  room: VacuumRoom;
  subtitle: string | null;
  muted?: boolean;
  iconClassName?: string;
  children?: ReactNode;
}) {
  return (
    <>
      <IconSquare icon={areaIcon(room.icon)} className={iconClassName} />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate font-medium",
            muted && "text-muted-foreground",
          )}
        >
          {room.name}
        </span>
        <span className="block min-h-5 truncate text-sm text-muted-foreground">
          {subtitle}
        </span>
      </span>
      {children}
    </>
  );
}

function RoomList({
  view,
  ranks,
  lastCleaned,
  language,
  onToggle,
}: {
  view: VacuumView;
  ranks: ReadonlyMap<number, number>;
  lastCleaned: (room: string) => string;
  language: string;
  onToggle: (id: number) => void;
}) {
  const t = messages(language);
  return (
    <Tray info={ranks.size === 0 && t.chooseRooms}>
      <div className="tray-card divide-y overflow-hidden">
        {view.rooms.map((room) => {
          const rank = ranks.get(room.id) ?? null;
          return (
            <button
              key={room.id}
              type="button"
              aria-pressed={rank !== null}
              disabled={!view.available}
              onClick={() => onToggle(room.id)}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset active:bg-muted/60 disabled:opacity-60"
            >
              <RoomRow room={room} subtitle={lastCleaned(room.name)}>
                <OrderBadge rank={rank} filled={rank !== null} />
              </RoomRow>
            </button>
          );
        })}
      </div>
    </Tray>
  );
}

function TaskList({ view, language }: { view: VacuumView; language: string }) {
  const t = messages(language);
  return (
    <Tray>
      <ul className="tray-card divide-y overflow-hidden">
        {view.task!.map((room) => (
          <li key={room.id} className="flex items-center gap-3 px-3 py-2.5">
            <RoomRow
              room={room}
              muted={room.status === "done"}
              iconClassName={cn(
                room.status === "current" &&
                  "bg-primary text-primary-foreground",
              )}
              subtitle={
                room.status === "done"
                  ? t.roomDone
                  : room.status === "current"
                    ? t.roomCleaningNow
                    : room.status === "next"
                      ? t.roomNext
                      : null
              }
            >
              {room.status === "done" ? (
                <Check className="size-5 shrink-0 text-muted-foreground" />
              ) : room.status === "current" ? null : (
                <OrderBadge rank={room.rank} filled={false} />
              )}
            </RoomRow>
          </li>
        ))}
      </ul>
    </Tray>
  );
}

/** Reloads the camera picture every ten seconds while it is on screen. */
function useCameraPicture(
  camera: NonNullable<VacuumView["camera"]>,
  ref: RefObject<HTMLElement | null>,
) {
  const [stamp, setStamp] = useState(Date.now());
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let visible = false;
    let timer: number | undefined;
    const refresh = () => {
      setFailed(false);
      setStamp(Date.now());
    };
    const schedule = () => {
      window.clearInterval(timer);
      if (visible && document.visibilityState === "visible") {
        refresh();
        timer = window.setInterval(refresh, 10_000);
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      schedule();
    });
    observer.observe(element);
    document.addEventListener("visibilitychange", schedule);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [camera.id]);
  const src = camera.picture
    ? `${camera.picture}${camera.picture.includes("?") ? "&" : "?"}_maison=${stamp}`
    : null;
  return { src: failed ? null : src, onError: () => setFailed(true) };
}

function MapUnavailable({ language }: { language: string }) {
  return (
    <span className="flex min-h-40 items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
      <MapPin className="size-4 shrink-0" />
      {messages(language).vacuumMapUnavailable}
    </span>
  );
}

function PlainMap({
  camera,
  language,
  onMoreInfo,
}: {
  camera: NonNullable<VacuumView["camera"]>;
  language: string;
  onMoreInfo: (id: string) => void;
}) {
  const t = messages(language);
  const ref = useRef<HTMLButtonElement>(null);
  const picture = useCameraPicture(camera, ref);
  return (
    <Section title={t.vacuumMap}>
      <Tray>
        <button
          ref={ref}
          type="button"
          className="tray-card flex w-full items-center justify-center overflow-hidden outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          onClick={() => onMoreInfo(camera.id)}
          aria-label={t.vacuumMap}
        >
          {picture.src ? (
            <img
              src={picture.src}
              alt={t.vacuumMap}
              className="max-h-80 w-full object-contain"
              onError={picture.onError}
            />
          ) : (
            <MapUnavailable language={language} />
          )}
        </button>
      </Tray>
    </Section>
  );
}

type NaturalSize = { width: number; height: number };

function RoomMap({
  camera,
  language,
  children,
}: {
  camera: NonNullable<VacuumView["camera"]>;
  language: string;
  children: (size: NaturalSize) => ReactNode;
}) {
  const t = messages(language);
  const ref = useRef<HTMLDivElement>(null);
  const picture = useCameraPicture(camera, ref);
  const [size, setSize] = useState<NaturalSize | null>(null);
  return (
    <Tray>
      <div ref={ref} className="tray-card relative overflow-hidden">
        {picture.src ? (
          <>
            <img
              src={picture.src}
              alt={t.vacuumMap}
              className="block w-full"
              onError={picture.onError}
              onLoad={(event) => {
                const { naturalWidth: width, naturalHeight: height } =
                  event.currentTarget;
                setSize((current) =>
                  current?.width === width && current.height === height
                    ? current
                    : { width, height },
                );
              }}
            />
            {size && children(size)}
          </>
        ) : (
          <MapUnavailable language={language} />
        )}
      </div>
    </Tray>
  );
}

function RoomPins({
  pins,
  size,
  ranks,
  disabled,
  onToggle,
}: {
  pins: NonNullable<VacuumView["pins"]>;
  size: NaturalSize;
  ranks: ReadonlyMap<number, number>;
  disabled: boolean;
  onToggle: (id: number) => void;
}) {
  return pins.map((pin) => {
    const rank = ranks.get(pin.id);
    return (
      <button
        key={pin.id}
        type="button"
        aria-label={pin.name}
        aria-pressed={rank !== undefined}
        disabled={disabled}
        onClick={() => onToggle(pin.id)}
        style={{
          left: `${(pin.x / size.width) * 100}%`,
          top: `${(pin.y / size.height) * 100}%`,
        }}
        className="absolute grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center outline-none focus-visible:[&>span]:ring-[3px] focus-visible:[&>span]:ring-ring/50"
      >
        <span
          className={cn(
            "grid place-items-center rounded-full text-xs font-semibold tabular-nums shadow-[0_1px_4px_oklch(0.2_0.01_60/0.35)] transition-[width,height,background-color] duration-150",
            rank !== undefined
              ? "size-7 border-2 border-white bg-primary text-primary-foreground"
              : ranks.size
                ? "size-3.5 border-[1.5px] border-neutral-300 bg-white"
                : "size-6 border-[1.5px] border-neutral-300 bg-white text-neutral-600",
          )}
        >
          {rank ?? (ranks.size ? null : pin.sequence)}
        </span>
      </button>
    );
  });
}

function CleaningTray({
  view,
  chosen,
  language,
  busy,
  onAction,
  onClear,
}: {
  view: VacuumView;
  chosen: VacuumRoom[];
  language: string;
  busy: boolean;
  onAction: Act;
  onClear: () => void;
}) {
  const t = messages(language);
  const action = cleaningAction(view, chosen, language);
  if (!action && !view.settings.length) return null;
  return (
    <Tray
      info={
        chosen.length > 0 && (
          <>
            <span className="min-w-0 flex-1 truncate">
              {chosen
                .map((room, index) => `${index + 1} ${room.name}`)
                .join(", ")}
            </span>
            <button
              type="button"
              className="-my-1.5 -mr-1 shrink-0 rounded-md px-1.5 py-1.5 font-medium text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              onClick={onClear}
            >
              {t.clearSelection}
            </button>
          </>
        )
      }
    >
      <div className="tray-card space-y-2.5 p-3">
        {view.settings.map((setting) => (
          <ToggleGroup
            key={setting.id}
            type="single"
            value={setting.value}
            aria-label={setting.label}
            disabled={busy || !setting.available}
            className="flex w-full rounded-lg bg-muted p-0.5"
            onValueChange={(value) => {
              const option = setting.options.find(
                (option) => option.value === value,
              );
              if (option) onAction(option.action);
            }}
          >
            {setting.options.map((option) => (
              <ToggleGroupItem
                key={option.value}
                value={option.value}
                className="h-auto min-h-9 flex-1 shrink rounded-md px-1.5 py-1 text-xs leading-tight whitespace-normal data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm"
              >
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        ))}
        {action && (
          <Button
            className="h-11 w-full"
            disabled={busy || !view.available}
            onClick={async () => {
              if ((await onAction(action)) && chosen.length) onClear();
            }}
          >
            <Play />
            {action.label}
          </Button>
        )}
      </div>
    </Tray>
  );
}

function MaintenanceTray({
  maintenance,
  language,
  busy,
  onAction,
}: {
  maintenance: VacuumView["maintenance"];
  language: string;
  busy: boolean;
  onAction: Act;
}) {
  const t = messages(language);
  const [confirm, setConfirm] = useState<MaintenanceItem | null>(null);
  return (
    <>
      <Tray
        alert={
          maintenance.flagged > 0 && t.maintenanceAttention(maintenance.flagged)
        }
        info={
          maintenance.next && (
            <span className="truncate">{maintenance.next}</span>
          )
        }
      >
        <ul className="tray-card divide-y overflow-hidden">
          {maintenance.items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                <div>
                  <p className="truncate font-medium">{item.name}</p>
                  <p className="truncate text-sm text-muted-foreground tabular-nums">
                    {[
                      item.flagged && item.reset ? item.value : null,
                      item.timeLeft,
                    ]
                      .filter(Boolean)
                      .join(" · ") || " "}
                  </p>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      item.flagged ? "bg-destructive" : "bg-primary",
                    )}
                    style={{ width: `${item.percent}%` }}
                  />
                </div>
              </div>
              {item.flagged && item.reset ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0"
                  aria-label={item.reset.label}
                  disabled={busy}
                  onClick={() => setConfirm(item)}
                >
                  <Check />
                  {t.maintenanceDone}
                </Button>
              ) : (
                <span
                  className={cn(
                    "w-12 shrink-0 text-right text-sm tabular-nums",
                    item.flagged && "font-medium text-destructive",
                  )}
                >
                  {item.value}
                </span>
              )}
            </li>
          ))}
        </ul>
      </Tray>
      <AlertDialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.name}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.maintenanceResetDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t.cancel}</AlertDialogCancel>
            <Button
              disabled={busy}
              onClick={async () => {
                if (confirm?.reset && (await onAction(confirm.reset)))
                  setConfirm(null);
              }}
            >
              {t.maintenanceReset}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
