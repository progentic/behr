import type { MouseEventHandler, ReactNode } from "react";

export function SelectableResourceItem({
  selected,
  onSelect,
  children,
}: Readonly<{
  selected: boolean;
  onSelect: MouseEventHandler<HTMLButtonElement>;
  children: ReactNode;
}>) {
  return (
    <li className="selectable-resource-item">
      <button type="button" aria-pressed={selected} onClick={onSelect}>
        {children}
      </button>
    </li>
  );
}
