import type { ReactNode, Ref } from "react";
import { cn } from "cn";

/**
 * A grey tray around a card. An alert line sits above the card in
 * destructive text; an informational line sits below it in muted text.
 */
export function Tray({
  alert,
  info,
  className,
  children,
}: {
  alert?: ReactNode;
  info?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("tray", className)}>
      {alert && (
        <TrayLine className="text-destructive">
          <span className="size-1.5 shrink-0 rounded-full bg-destructive" />
          {alert}
        </TrayLine>
      )}
      {children}
      {info && <TrayLine>{info}</TrayLine>}
    </div>
  );
}

export function TrayLine({
  ref,
  className,
  children,
}: {
  ref?: Ref<HTMLDivElement>;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      ref={ref}
      className={cn(
        "flex min-h-8 min-w-0 items-center gap-1.5 overflow-hidden px-2.5 py-1.5 text-[0.8125rem] whitespace-nowrap text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}
