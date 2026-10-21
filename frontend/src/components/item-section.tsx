import { useId, type ReactNode } from "react";
import { ItemGroup } from "./ui/item";

export function ItemSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-2">
      <div className="flex items-baseline justify-between gap-3 px-4 text-xs text-muted-foreground">
        <h2 id={id} className="font-medium">
          {title}
        </h2>
        {description && <p className="text-right">{description}</p>}
      </div>
      <ItemGroup className="overflow-hidden rounded-xl border bg-card text-card-foreground [&_[data-slot=item]]:min-h-14 [&_[data-slot=item]]:flex-nowrap [&_[data-slot=item]]:gap-3 [&_[data-slot=item]]:rounded-none [&_[data-slot=item]]:px-4 [&_[data-slot=item]]:py-3 [&_[data-slot=item-content]]:min-w-0 [&_[data-slot=item-title]]:break-words [&_[data-slot=item-description]]:line-clamp-none [&_[data-slot=item-description]]:text-pretty">
        {children}
      </ItemGroup>
    </section>
  );
}
