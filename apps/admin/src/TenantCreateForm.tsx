import { ActionButton, AlertMessage, StatusMessage } from "@bher/ui";
import {
  type CreateTenantRequest,
  type TenantAccess,
  createTenantRequestSchema,
  tenantAccessSchema,
} from "@bher/contracts";
import type { FormEvent } from "react";
import { useRef, useState } from "react";

import { requestApi } from "./lib/api";

export function TenantCreateForm({ onCreated }: Readonly<{
  onCreated: (tenant: TenantAccess) => void;
}>) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdName, setCreatedName] = useState<string | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);

  async function submitTenant(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setCreatedName(null);
    const request = prepareTenantCreation(name);
    setNameError(request ? null : "Enter a valid tenant name.");
    if (!request) {
      nameInput.current?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const tenant = await requestTenantCreation(request);
      setName("");
      setCreatedName(tenant.name);
      onCreated(tenant);
    } catch {
      setError("The tenant could not be created.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={(event) => void submitTenant(event)}>
      <label htmlFor="tenant-name">Tenant name</label>
      <input
        ref={nameInput}
        autoFocus
        id="tenant-name"
        name="name"
        maxLength={200}
        value={name}
        disabled={submitting}
        aria-invalid={nameError ? true : undefined}
        aria-describedby={nameError ? "tenant-name-error" : undefined}
        onChange={(event) => {
          setName(event.currentTarget.value);
          setNameError(null);
        }}
      />
      {nameError ? <p className="field-error" id="tenant-name-error">{nameError}</p> : null}
      {error ? <AlertMessage>{error}</AlertMessage> : null}
      {createdName ? <StatusMessage tone="success">Created “{createdName}”.</StatusMessage> : null}
      <ActionButton variant="primary" type="submit" disabled={submitting}>
        {submitting ? "Creating…" : "Create tenant"}
      </ActionButton>
    </form>
  );
}

export function prepareTenantCreation(name: string): CreateTenantRequest | null {
  const request = createTenantRequestSchema.safeParse({ name });
  return request.success ? request.data : null;
}

export async function requestTenantCreation(request: CreateTenantRequest): Promise<TenantAccess> {
  const response = await requestApi("/tenants", {
    method: "POST",
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error("Tenant creation failed.");
  }
  return tenantAccessSchema.parse(await response.json());
}
