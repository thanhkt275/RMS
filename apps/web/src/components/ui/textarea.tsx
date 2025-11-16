import type { ComponentProps, RefObject } from "react";

import { cn } from "@/lib/utils";

const Textarea = ({
  className,
  rows = 4,
  ref,
  ...props
}: ComponentProps<"textarea"> & {
  rows?: number;
  ref?: RefObject<HTMLTextAreaElement | null>;
}) => (
  <textarea
    className={cn(
      "flex w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none transition-[color,box-shadow] selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
      "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
      "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
      className
    )}
    data-slot="textarea"
    ref={ref}
    rows={rows}
    {...props}
  />
);

Textarea.displayName = "Textarea";

export { Textarea };
