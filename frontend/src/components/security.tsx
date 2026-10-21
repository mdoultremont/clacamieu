import { Camera, DoorClosed, Droplets, Shield, Siren } from "lucide-react";
import {
  Fragment,
  useEffect,
  useId,
  useState,
  type ComponentType,
} from "react";
import { messages } from "../i18n";
import type {
  AlarmMode,
  SecuritySensorGroup,
  SecurityView,
} from "../security-view";
import type { HassLike } from "../types";
import { ItemSection } from "./item-section";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "./ui/item";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

export function Security({
  view,
  hass,
  onCamera,
}: {
  view: SecurityView;
  hass: HassLike;
  onCamera: (entityId: string) => void;
}) {
  const t = messages(hass.language);
  return (
    <>
      <header>
        <h1 className="text-xl font-semibold tracking-tight">{t.security}</h1>
      </header>
      {view.alarm && (
        <Alarm key={view.alarm.id} alarm={view.alarm} hass={hass} />
      )}
      {view.cameras.length > 0 && (
        <ItemSection title={t.cameras}>
          <div className="grid grid-cols-2 gap-4 p-4">
            {view.cameras.map((camera) => (
              <CameraStill
                key={camera.id}
                camera={camera}
                hass={hass}
                onOpen={() => onCamera(camera.id)}
              />
            ))}
          </div>
        </ItemSection>
      )}
      <SensorGroup title={t.openings} group={view.openings} icon={DoorClosed} />
      <SensorGroup title={t.leaks} group={view.leaks} icon={Droplets} />
      {view.detectors.sensors.length > 0 && (
        <SensorGroup title={t.detectors} group={view.detectors} icon={Siren} />
      )}
    </>
  );
}

function Alarm({
  alarm,
  hass,
}: {
  alarm: NonNullable<SecurityView["alarm"]>;
  hass: HassLike;
}) {
  const t = messages(hass.language);
  const [selection, setSelection] = useState<AlarmMode | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeId = useId();
  async function confirm() {
    if (!selection || busy || !alarm.available) return;
    setBusy(true);
    setError(null);
    try {
      await hass.callService(
        "alarm_control_panel",
        selection.service,
        selection.needsCode ? { code } : {},
        { entity_id: alarm.id },
      );
      setSelection(null);
      setCode("");
    } catch (reason) {
      setError(
        reason instanceof Error && reason.name === "DevelopmentWriteBlocked"
          ? t.blockedError
          : t.securityAlarmError,
      );
    } finally {
      setBusy(false);
    }
  }
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
        <ToggleGroup
          type="single"
          value={alarm.state}
          variant="outline"
          spacing={2}
          aria-label={t.alarmLabel}
          disabled={busy || !alarm.available}
          className="flex w-full flex-wrap justify-start gap-2"
          onValueChange={(state) => {
            const mode = alarm.modes.find((mode) => mode.state === state);
            if (mode && mode.state !== alarm.state) {
              setSelection(mode);
              setError(null);
              setCode("");
            }
          }}
        >
          {alarm.modes.map((mode) => (
            <ToggleGroupItem
              key={mode.state}
              value={mode.state}
              className="min-h-11"
            >
              {mode.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <AlertDialog
        open={!!selection}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setSelection(null);
            setCode("");
            setError(null);
          }
        }}
      >
        <AlertDialogContent>
          <form
            className="grid min-w-0 gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void confirm();
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>{selection?.confirmation}</AlertDialogTitle>
              <AlertDialogDescription>
                {t.securityConfirmDescription}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {selection?.needsCode && (
              <div className="grid gap-2">
                <label htmlFor={codeId}>{t.securityCode}</label>
                <Input
                  id={codeId}
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  required
                  className="min-h-11 text-base"
                  value={code}
                  disabled={busy}
                  onChange={(event) => setCode(event.target.value)}
                />
              </div>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>{t.cancel}</AlertDialogCancel>
              <Button
                type="submit"
                disabled={
                  busy || !alarm.available || (!!selection?.needsCode && !code)
                }
              >
                {busy ? t.securityWorking : t.securityConfirm}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
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
    const updateVisibility = () => {
      window.clearInterval(timer);
      if (document.visibilityState !== "hidden") {
        setRefresh(Date.now());
        timer = window.setInterval(() => setRefresh(Date.now()), 10_000);
      }
    };
    updateVisibility();
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
    <button
      type="button"
      className="min-w-0 space-y-2 text-left focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4"
      onClick={onOpen}
    >
      <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground">
        {image && failedSource !== image && (
          <img
            src={image}
            alt={camera.name}
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
      </div>
      <p className="break-words text-sm font-medium">{camera.name}</p>
    </button>
  );
}

function SensorGroup({
  title,
  group,
  icon: Icon,
}: {
  title: string;
  group: SecuritySensorGroup;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <ItemSection title={title}>
      <Item role="listitem" size="sm">
        <ItemContent>
          {group.alert ? (
            <Badge
              variant="outline"
              className="border-destructive/50 text-destructive"
            >
              {group.summary}
            </Badge>
          ) : (
            <ItemDescription>{group.summary}</ItemDescription>
          )}
        </ItemContent>
      </Item>
      {group.sensors.map((sensor) => (
        <Fragment key={sensor.id}>
          <ItemSeparator />
          <Item role="listitem" size="sm">
            <ItemMedia className="text-muted-foreground">
              <Icon className="size-4" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{sensor.name}</ItemTitle>
              {sensor.description && (
                <ItemDescription>{sensor.description}</ItemDescription>
              )}
            </ItemContent>
            <ItemActions className="max-w-24 shrink-0 text-right text-muted-foreground">
              {sensor.active ? (
                <Badge
                  variant="outline"
                  className="whitespace-normal border-destructive/50 text-destructive"
                >
                  {sensor.state}
                </Badge>
              ) : (
                <span>{sensor.state}</span>
              )}
            </ItemActions>
          </Item>
        </Fragment>
      ))}
    </ItemSection>
  );
}
