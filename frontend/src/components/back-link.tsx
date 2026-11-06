import { ChevronLeft } from "lucide-react";
import { messages } from "../i18n";
import { parseRoute, previousPath, type Route } from "../navigation";
import { RouteLink } from "./route-link";
import { Button } from "./ui/button";

/**
 * Returns to the panel page that opened this one, such as Home, or to
 * `fallback` when the page was opened directly.
 */
export function BackLink({
  fallback,
  language,
}: {
  fallback: Route;
  language: string;
}) {
  const t = messages(language);
  const from = previousPath();
  const route = from?.startsWith("/clacamieu") ? parseRoute(from) : fallback;
  const labels: Partial<Record<Route["screen"], string>> = {
    home: t.home,
    rooms: t.rooms,
    security: t.security,
    energy: t.energy,
    more: t.more,
    vacuum: t.vacuumPage,
    comfort: t.comfort,
    garden: t.garden,
  };
  return (
    <Button variant="ghost" className="-ml-3 min-h-11" asChild>
      <RouteLink
        route={route}
        onClick={(event) => {
          if (!from || event.button !== 0 || event.metaKey || event.ctrlKey)
            return;
          event.preventDefault();
          history.back();
        }}
      >
        <ChevronLeft />
        {labels[route.screen] ?? t.back}
      </RouteLink>
    </Button>
  );
}
