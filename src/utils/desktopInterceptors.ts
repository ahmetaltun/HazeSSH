/**
 * Desktop Application Browser Quirks Interceptor.
 *
 * Suppresses web browser default behaviors to provide a pure, seamless native desktop feel:
 * - Prevents default browser context menus (Back, Forward, Reload, Inspect Element) outside text fields.
 * - Prevents OS-level file drag-and-drop from triggering navigation away from the webview.
 * - Prevents accidental page reloads via Cmd+R / Ctrl+R / F5 that would disconnect active SSH sessions.
 * - Prevents accidental history navigation gestures.
 * - Suppresses macOS/WebKit automatic text correction, capitalization, spellcheck, and suggestions.
 */

export function initDesktopInterceptors() {
  if (typeof window === "undefined") return;

  // 1. Prevent default browser right-click context menu outside standard inputs
  const handleContextMenu = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    // Allow native context menu on native text inputs and editable areas
    const isTextInput =
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable ||
      Boolean(target.closest("input, textarea, [contenteditable='true']"));

    if (!isTextInput) {
      e.preventDefault();
    }
  };

  // 2. Prevent accidental file-drop navigation at the window level
  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: DragEvent) => {
    // Only prevent default if not handled by a nested drop zone
    e.preventDefault();
  };

  // 3. Prevent accidental reload and web navigation hotkeys
  const handleKeyDown = (e: KeyboardEvent) => {
    const isMetaOrCtrl = e.metaKey || e.ctrlKey;

    // Prevent accidental Cmd+R / Ctrl+R / F5 reload that would terminate active SSH connections
    if (
      (isMetaOrCtrl && e.key.toLowerCase() === "r" && !e.shiftKey) ||
      e.key === "F5"
    ) {
      // In production or normal desktop usage, prevent accidental session loss
      e.preventDefault();
    }

    // Prevent Backspace outside input fields navigating backwards
    if (e.key === "Backspace") {
      const activeEl = document.activeElement as HTMLElement | null;
      const isInput =
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.isContentEditable);

      if (!isInput) {
        // Prevent default browser behavior
        e.preventDefault();
      }
    }
  };

  // 4. Suppress macOS/WebKit automatic text correction, capitalization, spellcheck, and suggestions
  const enforceInputBehaviors = (el: HTMLElement) => {
    // Only apply to text-based inputs and textareas
    if (el instanceof HTMLInputElement) {
      const nonTextTypes = ["checkbox", "radio", "range", "color", "file", "button", "submit", "reset", "image"];
      if (nonTextTypes.includes(el.type.toLowerCase())) return;
    } else if (!(el instanceof HTMLTextAreaElement)) {
      return;
    }

    if (!el.hasAttribute("autocomplete")) el.setAttribute("autocomplete", "off");
    if (!el.hasAttribute("autocorrect")) el.setAttribute("autocorrect", "off");
    if (!el.hasAttribute("autocapitalize")) el.setAttribute("autocapitalize", "none");
    if (!el.hasAttribute("spellcheck")) el.setAttribute("spellcheck", "false");
  };

  const handleFocusIn = (e: FocusEvent) => {
    const target = e.target as HTMLElement | null;
    if (target) {
      enforceInputBehaviors(target);
    }
  };

  // Run on already mounted elements
  document.querySelectorAll("input, textarea").forEach((el) => {
    enforceInputBehaviors(el as HTMLElement);
  });

  // Observe dynamically mounted inputs
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) {
          enforceInputBehaviors(node);
          node.querySelectorAll("input, textarea").forEach((el) => {
            enforceInputBehaviors(el as HTMLElement);
          });
        }
      }
    }
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }

  window.addEventListener("contextmenu", handleContextMenu, { capture: true });
  window.addEventListener("dragover", handleDragOver, { capture: true });
  window.addEventListener("drop", handleDrop, { capture: true });
  window.addEventListener("keydown", handleKeyDown, { capture: true });
  window.addEventListener("focusin", handleFocusIn, { capture: true });

  return () => {
    observer.disconnect();
    window.removeEventListener("contextmenu", handleContextMenu, { capture: true });
    window.removeEventListener("dragover", handleDragOver, { capture: true });
    window.removeEventListener("drop", handleDrop, { capture: true });
    window.removeEventListener("keydown", handleKeyDown, { capture: true });
    window.removeEventListener("focusin", handleFocusIn, { capture: true });
  };
}
