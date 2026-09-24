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
      if (accountMenu.current) accountMenu.current.open = media.matches;
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
          {sidebar(closeNavigation)}
        </dialog>
      ) : null}
      <header className="app-header">
        {sidebar ? <button ref={menu} className="sidebar-toggle" type="button"
          aria-controls="workspace-sidebar" aria-expanded={expanded}
          onClick={() => { navigation.current?.showModal(); setExpanded(true); }}>Menu</button>
          : <strong className="header-brand">BeHR</strong>}
        <div className="header-context">{context}</div>
        <details ref={accountMenu} className="account-menu">
          <summary>Account</summary>
          {account}
        </details>
      </header>
      <main className="workspace-content">{children}</main>
    </div>
  );
}
