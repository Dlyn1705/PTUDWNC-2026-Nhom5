export function focusMainContent() {
  const target = document.querySelector<HTMLElement>("#main-content h1, main h1")
    ?? document.querySelector<HTMLElement>("#main-content, main");
  if (target) {
    if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
    target.focus();
  }
}

export function canRestoreFocus(target: HTMLElement | null): target is HTMLElement {
  return target !== document.body && !!target?.isConnected && target.getClientRects().length > 0
    && !target.closest("[hidden], [inert], [aria-hidden='true']")
    && !target.matches(":disabled");
}
