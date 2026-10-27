export const MODAL_FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
].join(",");

export function cycleModalFocusIndex(currentIndex: number, count: number, backwards: boolean) {
  if (count <= 0) return -1;
  if (currentIndex < 0) return backwards ? count - 1 : 0;
  return (currentIndex + (backwards ? -1 : 1) + count) % count;
}

let generatedDialogTitleId = 0;

export function isSafeSingleActionDismissal(labels: string[]): boolean {
  return labels.length === 1 && /^(OK|GOT IT|CLOSE PHOTO|CLOSE ROUTE)$/i.test(labels[0].trim());
}

export function togglePressedFromClassName(className: string): boolean {
  return className.split(/\s+/).includes("active");
}

function visibleFocusableElements(dialog: HTMLElement) {
  return Array.from(dialog.querySelectorAll<HTMLElement>(MODAL_FOCUSABLE_SELECTOR)).filter((element) => {
    if (element.getAttribute("aria-hidden") === "true" || element.closest("[inert]")) return false;
    return element.getClientRects().length > 0;
  });
}

function focusDialog(dialog: HTMLElement) {
  if (dialog.contains(document.activeElement)) return;
  dialog.tabIndex = -1;
  const target = dialog.querySelector<HTMLElement>("[data-modal-initial-focus], [autofocus]") ?? visibleFocusableElements(dialog)[0] ?? dialog;
  target.focus({ preventScroll: true });
}

function ensureDialogName(dialog: HTMLElement) {
  if (dialog.hasAttribute("aria-label") || dialog.hasAttribute("aria-labelledby")) return;
  const heading = dialog.querySelector<HTMLElement>("h1, h2, h3, h4, h5, h6");
  if (!heading) {
    const imageDescription = dialog.querySelector<HTMLImageElement>("img[alt]")?.alt.trim();
    dialog.setAttribute("aria-label", imageDescription || "Dialog");
    return;
  }
  if (!heading.id) {
    generatedDialogTitleId += 1;
    heading.id = `shift-tracker-dialog-title-${generatedDialogTitleId}`;
  }
  dialog.setAttribute("aria-labelledby", heading.id);
}

function safeEscapeDismissal(dialog: HTMLElement): HTMLElement | null {
  const explicit = dialog.querySelector<HTMLElement>("[data-modal-dismiss]");
  if (dialog.dataset.dismissOnEscape === "true" && explicit) return explicit;
  const buttons = visibleFocusableElements(dialog).filter((element) => element instanceof HTMLButtonElement) as HTMLButtonElement[];
  return isSafeSingleActionDismissal(buttons.map((button) => button.textContent ?? "")) ? buttons[0] : null;
}

function ensureToggleSemantics(root: Document) {
  root.querySelectorAll<HTMLButtonElement>("button.geofence-toggle").forEach((button) => {
    button.setAttribute("aria-pressed", String(togglePressedFromClassName(button.className)));
    if (button.hasAttribute("aria-label")) return;
    const row = button.closest<HTMLElement>(".setting-row, .android-toggle-row, .osm-road-feature-row");
    const label = row?.querySelector<HTMLElement>("label, strong, b")?.textContent?.trim();
    if (label) button.setAttribute("aria-label", label);
  });
}

function ensureIconButtonNames(root: Document) {
  root.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    if (button.textContent?.trim() !== "×" || button.hasAttribute("aria-label")) return;
    button.setAttribute("aria-label", "Close dialog");
  });
}

/**
 * Incremental focus foundation for the app's existing conditional dialogs.
 * It changes presentation/keyboard behaviour only. Escape is limited to an
 * explicit dismiss target or a single, clearly informational close action.
 */
export function installModalFocusManagement(root: Document = document) {
  type Entry = { dialog: HTMLElement; opener: HTMLElement | null };
  let stack: Entry[] = [];
  let scheduled = 0;

  const currentDialogs = () => Array.from(root.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'));
  const activeEntry = () => stack.at(-1) ?? null;
  const safeFallback = () => root.querySelector<HTMLElement>('[aria-current="page"], .main-content button, main');

  const sync = () => {
    scheduled = 0;
    const dialogs = currentDialogs();
    dialogs.forEach(ensureDialogName);
    ensureToggleSemantics(root);
    ensureIconButtonNames(root);
    const removed = stack.filter((entry) => !dialogs.includes(entry.dialog));
    const carryOpener = removed.at(-1)?.opener ?? activeEntry()?.opener ?? null;
    stack = stack.filter((entry) => dialogs.includes(entry.dialog));
    dialogs.forEach((dialog) => {
      if (stack.some((entry) => entry.dialog === dialog)) return;
      const active = root.activeElement instanceof HTMLElement ? root.activeElement : null;
      const opener = active && !dialog.contains(active) && active.isConnected ? active : carryOpener;
      stack.push({ dialog, opener });
    });
    const active = activeEntry();
    if (active) {
      const nestedOpener = removed.at(-1)?.opener;
      window.requestAnimationFrame(() => {
        if (nestedOpener?.isConnected && active.dialog.contains(nestedOpener)) nestedOpener.focus({ preventScroll: true });
        else focusDialog(active.dialog);
      });
    }
    else if (removed.length) {
      const target = removed.at(-1)?.opener?.isConnected ? removed.at(-1)!.opener : safeFallback();
      window.requestAnimationFrame(() => target?.focus({ preventScroll: true }));
    }
  };

  const scheduleSync = () => {
    if (scheduled) return;
    scheduled = window.requestAnimationFrame(sync);
  };
  const observer = new MutationObserver(scheduleSync);
  observer.observe(root.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  sync();

  const onKeyDown = (event: KeyboardEvent) => {
    const dialog = activeEntry()?.dialog;
    if (!dialog) return;
    if (event.key === "Escape") {
      const dismiss = safeEscapeDismissal(dialog);
      if (!dismiss) return;
      event.preventDefault();
      dismiss.click();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = visibleFocusableElements(dialog);
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus({ preventScroll: true });
      return;
    }
    const currentIndex = focusable.indexOf(root.activeElement as HTMLElement);
    const nextIndex = cycleModalFocusIndex(currentIndex, focusable.length, event.shiftKey);
    const atBoundary = currentIndex < 0 || (!event.shiftKey && currentIndex === focusable.length - 1) || (event.shiftKey && currentIndex === 0);
    if (!atBoundary) return;
    event.preventDefault();
    focusable[nextIndex].focus({ preventScroll: true });
  };

  const onFocusIn = (event: FocusEvent) => {
    const dialog = activeEntry()?.dialog;
    if (!dialog || dialog.contains(event.target as Node)) return;
    focusDialog(dialog);
  };

  root.addEventListener("keydown", onKeyDown, true);
  root.addEventListener("focusin", onFocusIn, true);
  return () => {
    observer.disconnect();
    if (scheduled) window.cancelAnimationFrame(scheduled);
    root.removeEventListener("keydown", onKeyDown, true);
    root.removeEventListener("focusin", onFocusIn, true);
    stack = [];
  };
}
