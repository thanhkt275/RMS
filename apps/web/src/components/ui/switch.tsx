import { Switch as SwitchPrimitive } from "radix-ui";
import type { ComponentProps, ElementRef, RefObject } from "react";

import { cn } from "@/lib/utils";

const Switch = ({
  className,
  ref,
  ...props
}: ComponentProps<typeof SwitchPrimitive.Root> & {
  ref?: RefObject<ElementRef<typeof SwitchPrimitive.Root> | null>;
}) => (
  <SwitchPrimitive.Root
    className={cn(
      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-input bg-muted transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=checked]:border-primary data-[state=unchecked]:border-input data-[state=checked]:bg-primary dark:border-input dark:bg-input/80",
      className
    )}
    data-slot="switch"
    ref={ref}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        "pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow transition-transform duration-100 dark:bg-input",
        "data-[state=checked]:translate-x-5"
      )}
    />
  </SwitchPrimitive.Root>
);

Switch.displayName = "Switch";

export { Switch };
