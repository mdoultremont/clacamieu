import type { ComponentProps } from "react";
import { navigate, routePath, type Route } from "../navigation";

export function RouteLink({
  route,
  ...props
}: { route: Route } & ComponentProps<"a">) {
  const href = routePath(route);
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        props.onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        navigate(href);
      }}
    />
  );
}
