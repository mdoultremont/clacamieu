import * as React from "react";
import { cn } from "cn";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";

/** A single-choice switch drawn like shadcn tabs: a muted track and a raised pill. */
function Segmented({
  className,
  onValueChange,
  ...props
}: Omit<
  React.ComponentProps<typeof ToggleGroupPrimitive.Root>,
  "type" | "value" | "defaultValue" | "onValueChange"
> & {
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="segmented"
      type="single"
      className={cn(
        "inline-flex w-fit items-center rounded-lg bg-muted p-[3px] text-muted-foreground",
        className,
      )}
      onValueChange={(value: string) => {
        if (value) onValueChange(value);
      }}
      {...props}
    />
  );
}

function SegmentedItem({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="segmented-item"
      className={cn(
        "inline-flex h-full min-w-0 flex-1 items-center justify-center rounded-md border border-transparent px-2.5 py-1 text-sm font-medium whitespace-nowrap transition-[color,background-color,box-shadow] outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
        "data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm dark:data-[state=on]:border-input dark:data-[state=on]:bg-input/30",
        className,
      )}
      {...props}
    />
  );
}

export { Segmented, SegmentedItem };
