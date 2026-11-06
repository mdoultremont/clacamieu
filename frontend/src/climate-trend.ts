import { numeric } from "./home-view";
import { locale } from "./i18n";
import type { ClimateLabel } from "./room-view";

/** One point from `history/history_during_period` with `minimal_response`. */
export interface HistoryPoint {
  s: string;
  lu: number;
}

export type TrendDirection = "up" | "down" | "steady";

export interface ClimateTrend {
  direction: TrendDirection;
  /** Signed change over the window, formatted, such as "+0,4". */
  delta: string;
}

export const trendWindowMinutes = 60;

// Below these changes over the window, a reading counts as steady.
const steadyBelow: Record<ClimateLabel, number> = {
  temperature: 0.3,
  humidity: 2,
  co2: 50,
  pm25: 3,
};

export function climateTrend(
  label: ClimateLabel,
  history: HistoryPoint[] | undefined,
  current: number,
  language: string,
): ClimateTrend | null {
  // The first point is the state at the start of the window.
  const past = numeric(history?.[0]?.s);
  if (past === null) return null;
  const change = current - past;
  const digits = label === "temperature" ? 1 : 0;
  return {
    direction:
      Math.abs(change) < steadyBelow[label]
        ? "steady"
        : change > 0
          ? "up"
          : "down",
    delta: new Intl.NumberFormat(locale(language), {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      signDisplay: "exceptZero",
    }).format(change),
  };
}
