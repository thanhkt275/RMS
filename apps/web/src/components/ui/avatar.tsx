import { Avatar } from "radix-ui";
import { memo } from "react";
import { cn } from "@/lib/utils";

const { Root, Image, Fallback } = Avatar;

type AvatarProps = React.ComponentPropsWithoutRef<typeof Root>;

const AvatarComponent = memo(({ className, ...props }: AvatarProps) => (
  <Root
    className={cn(
      "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
      className
    )}
    {...props}
  />
));
AvatarComponent.displayName = Root.displayName;

type AvatarImageProps = React.ComponentPropsWithoutRef<typeof Image>;

const AvatarImageComponent = memo(
  ({ className, ...props }: AvatarImageProps) => (
    <Image
      className={cn("aspect-square h-full w-full", className)}
      {...props}
    />
  )
);
AvatarImageComponent.displayName = Image.displayName;

type AvatarFallbackProps = React.ComponentPropsWithoutRef<typeof Fallback>;

const AvatarFallbackComponent = memo(
  ({ className, ...props }: AvatarFallbackProps) => (
    <Fallback
      className={cn(
        "flex h-full w-full items-center justify-center rounded-full bg-muted",
        className
      )}
      {...props}
    />
  )
);
AvatarFallbackComponent.displayName = Fallback.displayName;

export {
  AvatarComponent as Avatar,
  AvatarImageComponent as AvatarImage,
  AvatarFallbackComponent as AvatarFallback,
};
