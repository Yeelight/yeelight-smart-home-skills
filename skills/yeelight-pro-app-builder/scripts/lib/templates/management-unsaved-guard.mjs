export function unsavedNavigationGuardHookSource() {
  return `import { useEffect, useRef, useState } from "react";

type Options = {
  dirty: boolean;
  onCancel: () => void;
  onNavigate: (route: string) => void;
  fallbackFocusSelector: string;
};

export function useUnsavedNavigationGuard({ dirty, onCancel, onNavigate, fallbackFocusSelector }: Options) {
  const [open, setOpen] = useState(false);
  const [pendingRoute, setPendingRoute] = useState("");
  const bypass = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLElement>(null);

  const captureOpener = () => {
    const candidate = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    opener.current = candidate?.closest("[data-unsaved-editor]") ? candidate : null;
  };
  const restoreFocus = () => requestAnimationFrame(() => {
    const fallback = fallbackFocusSelector.split(",").map((selector) => document.querySelector<HTMLElement>(selector.trim())).find(Boolean);
    const target = opener.current?.isConnected ? opener.current : fallback;
    target?.focus();
  });
  const continueEditing = () => {
    setPendingRoute("");
    setOpen(false);
    restoreFocus();
  };
  const discard = () => {
    const route = pendingRoute;
    bypass.current = true;
    setPendingRoute("");
    setOpen(false);
    if (route) onNavigate(route); else onCancel();
  };
  const requestCancel = () => {
    if (!dirty) return onCancel();
    captureOpener();
    setOpen(true);
  };
  const allowNavigate = (route: string) => {
    bypass.current = true;
    onNavigate(route);
  };

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const navigation = (event: Event) => {
      const route = (event as CustomEvent<{ route?: string }>).detail?.route;
      if (!dirty || bypass.current || !route) return;
      event.preventDefault();
      captureOpener();
      setPendingRoute((current) => current || route);
      setOpen(true);
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("app:navigate-request", navigation);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("app:navigate-request", navigation);
    };
  }, [dirty]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => {
      const first = dialogRef.current?.querySelector<HTMLElement>("[data-autofocus], button:not(:disabled), input:not(:disabled)");
      (first || dialogRef.current)?.focus();
    });
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") return continueEditing();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const controls = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')];
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return { open, dialogRef, requestCancel, continueEditing, discard, allowNavigate };
}
`;
}
