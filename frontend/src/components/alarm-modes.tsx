import { useId, useState } from "react";
import { cn } from "cn";
import { messages } from "../i18n";
import type { AlarmMode, SecurityView } from "../security-view";
import type { HassLike } from "../types";
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
import { Input } from "./ui/input";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

export function AlarmModes({
  alarm,
  hass,
  className,
}: {
  alarm: NonNullable<SecurityView["alarm"]>;
  hass: HassLike;
  className?: string;
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
    <>
      <ToggleGroup
        type="single"
        value={alarm.state}
        variant="outline"
        spacing={2}
        aria-label={t.alarmLabel}
        disabled={busy || !alarm.available}
        className={cn("flex w-full flex-wrap justify-start gap-2", className)}
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
            className="min-h-11 flex-1"
          >
            {mode.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
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
    </>
  );
}
