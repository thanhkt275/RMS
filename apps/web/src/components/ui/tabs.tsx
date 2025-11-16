import { Tabs as TabsPrimitive } from "radix-ui";
import { memo } from "react";
import { cn } from "@/lib/utils";

const { Root, List, Trigger, Content } = TabsPrimitive;

type TabsProps = React.ComponentPropsWithoutRef<typeof Root>;

const Tabs = memo(({ className, ...props }: TabsProps) => (
  <Root className={cn("", className)} {...props} />
));
Tabs.displayName = Root.displayName;

type TabsListProps = React.ComponentPropsWithoutRef<typeof List>;

const TabsList = memo(({ className, ...props }: TabsListProps) => (
  <List
    className={cn(
      "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
      className
    )}
    {...props}
  />
));
TabsList.displayName = List.displayName;

type TabsTriggerProps = React.ComponentPropsWithoutRef<typeof Trigger>;

const TabsTrigger = memo(({ className, ...props }: TabsTriggerProps) => (
  <Trigger
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 font-medium text-sm ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = Trigger.displayName;

type TabsContentProps = React.ComponentPropsWithoutRef<typeof Content>;

const TabsContent = memo(({ className, ...props }: TabsContentProps) => (
  <Content
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
));
TabsContent.displayName = Content.displayName;

export { Tabs, TabsContent, TabsList, TabsTrigger };
