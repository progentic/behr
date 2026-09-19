import type { ComponentPropsWithoutRef } from "react";

type ActionButtonProps = Omit<ComponentPropsWithoutRef<"button">, "type"> & {
  type: "button" | "submit" | "reset";
  variant: "primary" | "secondary";
};

export function ActionButton({ variant, type, className, ...props }: ActionButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={`button-${variant}${className ? ` ${className}` : ""}`}
    />
  );
}
