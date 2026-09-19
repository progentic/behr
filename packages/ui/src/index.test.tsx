import type { MouseEventHandler } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ActionButton, AlertMessage, SelectableResourceItem, StatusMessage } from "./index";

declare function test(name: string, body: () => void): void;
declare function expect<T>(actual: T): {
  toBe(expected: unknown): void;
  toContain(expected: string): void;
  not: { toContain(expected: string): void };
};

test("action buttons preserve explicit native type, attributes and caller handler", () => {
  const onClick: MouseEventHandler<HTMLButtonElement> = () => {};
  const button = ActionButton({
    type: "submit", variant: "primary", className: "consumer-action",
    disabled: true, "aria-describedby": "details", draggable: true, onClick,
    children: "Save",
  });
  expect(button.type).toBe("button");
  expect(button.props.onClick).toBe(onClick);
  const markup = renderToStaticMarkup(button);
  expect(markup).toContain('type="submit"');
  expect(markup).toContain('class="button-primary consumer-action"');
  expect(markup).toContain('disabled=""');
  expect(markup).toContain('aria-describedby="details"');
  expect(markup).toContain('draggable="true"');
  expect(markup).toContain(">Save</button>");
});

test("secondary actions do not inherit primary or submit semantics", () => {
  const markup = renderToStaticMarkup(<ActionButton type="button" variant="secondary">Log out</ActionButton>);
  expect(markup).toContain('type="button"');
  expect(markup).toContain('class="button-secondary"');
  expect(markup).not.toContain("button-primary");
  expect(markup).not.toContain("disabled");
  // @ts-expect-error Button type is a required caller decision.
  const missingType = <ActionButton variant="primary">Invalid</ActionButton>;
  // @ts-expect-error Priority is never inferred from a form or label.
  const missingVariant = <ActionButton type="submit">Invalid</ActionButton>;
  void missingType;
  void missingVariant;
});

test("alerts preserve persistent failure semantics and escaped children", () => {
  const markup = renderToStaticMarkup(<AlertMessage>Could not save &lt;draft&gt;.</AlertMessage>);
  expect(markup).toContain('<p class="alert-message" role="alert">');
  expect(markup).toContain("Could not save &lt;draft&gt;.");
});

test("statuses distinguish neutral progress from confirmed success", () => {
  const neutral = renderToStaticMarkup(<StatusMessage>Loading…</StatusMessage>);
  const success = renderToStaticMarkup(<StatusMessage tone="success">Saved.</StatusMessage>);
  expect(neutral).toContain('class="status-message" role="status"');
  expect(neutral).not.toContain("status-success");
  expect(success).toContain('class="status-message status-success" role="status"');
  expect(success).toContain("Saved.");
});

test("resource items preserve native structure, selection and caller authority", () => {
  const onSelect: MouseEventHandler<HTMLButtonElement> = () => {};
  for (const selected of [false, true]) {
    const item = SelectableResourceItem({ selected, onSelect, children: <strong>Page</strong> });
    expect(item.type).toBe("li");
    expect(item.props.children.type).toBe("button");
    expect(item.props.children.props.onClick).toBe(onSelect);
    const markup = renderToStaticMarkup(item);
    expect(markup).toContain('<li class="selectable-resource-item"><button type="button"');
    expect(markup).toContain(`aria-pressed="${selected}"`);
    expect(markup).toContain("<strong>Page</strong></button></li>");
  }
});
