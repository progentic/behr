import { type ReactNode, useEffect, useRef, useState } from "react";

const DESKTOP_NAVIGATION = "(min-width: 60rem)";

/** Owns presentation and native dialog lifecycle, never resource authority. */
export function AdminShell({ account, context, sidebar, children }: Readonly<{
  account: ReactNode;
  context: ReactNode;
  sidebar?: (close: () => void) => ReactNode;
  children: ReactNode;
}>) {
  const navigation = useRef<HTMLDialogElement>(null);
  const menu = useRef<HTMLButtonElement>(null);
  const accountMenu = useRef<HTMLDetailsElement>(null);
  const [desktop, setDesktop] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const panel = navigation.current;
    const media = window.matchMedia(DESKTOP_NAVIGATION);
    function reconcileNavigation() {
      panel?.close();
      setDesktop(media.matches);
      setExpanded(false);
      if (accountMenu.current) accountMenu.current.open = false;
      if (media.matches) panel?.show();
    }
    reconcileNavigation();
    media.addEventListener("change", reconcileNavigation);
    return () => media.removeEventListener("change", reconcileNavigation);
  }, [Boolean(sidebar)]);

  function closeNavigation() {
    if (desktop) return;
    navigation.current?.close();
    setExpanded(false);
    menu.current?.focus();
  }

  const profile = <details ref={accountMenu} className="account-menu" onKeyDown={(event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.open = false;
      event.currentTarget.querySelector("summary")?.focus();
    }
  }}>
    <summary><NavigationIcon kind="user" />User profile</summary>
    <div className="profile-options">{account}</div>
  </details>;

  return (
    <div className={`admin-shell${sidebar ? "" : " admin-shell-empty"}`}>
      {sidebar ? (
        <dialog ref={navigation} id="workspace-sidebar" className="workspace-sidebar"
          role={desktop ? "complementary" : undefined} aria-label="Workspace navigation"
          onClose={() => setExpanded(false)}
          onClick={(event) => {
            if (event.target !== event.currentTarget) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            if (event.clientX < bounds.left || event.clientX > bounds.right ||
              event.clientY < bounds.top || event.clientY > bounds.bottom) closeNavigation();
          }}>
          <div className="sidebar-brand"><strong>BeHR</strong>
            <button className="sidebar-close" type="button" onClick={closeNavigation}>Close menu</button>
          </div>
          {profile}
          {sidebar(closeNavigation)}
        </dialog>
      ) : null}
      <header className="app-header">
        {sidebar ? <button ref={menu} className="sidebar-toggle" type="button"
          aria-controls="workspace-sidebar" aria-expanded={expanded}
          onClick={() => { navigation.current?.showModal(); setExpanded(true); }}>Menu</button>
          : <strong className="header-brand">BeHR</strong>}
        <div className="header-context">{context}</div>
        {!sidebar ? profile : null}
      </header>
      <main className="workspace-content">{children}</main>
    </div>
  );
}

/* Lucide icons, ISC License. Copyright (c) 2026 Lucide Icons and Contributors.
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */
export function NavigationIcon({ kind }: { kind: "user" | "site" | "settings" | "overview" }) {
  return <svg className="navigation-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    {kind === "user" ? <><circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 0 0-16 0" /></> : null}
    {kind === "site" ? <><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20" /></> : null}
    {kind === "settings" ? <><path d="M14 17H5M19 7h-9" /><circle cx="17" cy="17" r="3" /><circle cx="7" cy="7" r="3" /></> : null}
    {kind === "overview" ? <><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18M9 21V9" /></> : null}
  </svg>;
}
