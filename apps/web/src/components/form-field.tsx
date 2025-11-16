import type * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FieldError = { message?: string } | undefined;

type FormFieldProps = {
  children: React.ReactNode;
  label: string;
  description?: React.ReactNode;
  disabled?: boolean;
  required?: boolean;
  htmlFor?: string;
  className?: string;
};

function FormField({
  children,
  label,
  description,
  disabled,
  required,
  htmlFor,
  className,
}: FormFieldProps) {
  return (
    <div className={cn("space-y-2", disabled && "opacity-70", className)}>
      <Label className="font-medium" htmlFor={htmlFor}>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {description && (
        <p className="text-muted-foreground text-sm">{description}</p>
      )}
      {children}
    </div>
  );
}

function FieldErrors({ errors }: { errors?: FieldError[] }) {
  if (!errors || errors.length === 0) {
    return null;
  }
  return (
    <div className="space-y-1 text-destructive text-sm">
      {errors.map((error, index) => (
        <p key={error?.message ?? index}>{error?.message}</p>
      ))}
    </div>
  );
}

export { FieldErrors, FormField, type FieldError };
