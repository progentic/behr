import type { ReactNode } from "react";

export function AlertMessage({ children }: Readonly<{ children: ReactNode }>) {
  return <p className="alert-message" role="alert">{children}</p>;
}

export function StatusMessage({
  children,
  tone = "neutral",
}: Readonly<{ children: ReactNode; tone?: "neutral" | "success" }>) {
  return (
    <p className={tone === "success" ? "status-message status-success" : "status-message"} role="status">
      {children}
    </p>
  );
}
