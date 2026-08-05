import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import css from "./index.css?inline";
import { drainPendingNotes } from "./handoff/drainPendingNotes";
import { currentPageKey } from "./utils/normalizeUrl";

let appReadyPromise: Promise<void> | null = null;

/**
 * Mount the shadow-DOM application once and resolve only after App has
 * installed the window event listeners used by this content-script bridge.
 *
 * `createRoot().render()` does not guarantee that passive effects have run
 * before it returns. Dispatching an overlay action immediately after render
 * therefore races the first mount and can make the first toolbar click appear
 * to do nothing. Returning a readiness promise makes every entry point use the
 * same deterministic handshake.
 */
function mountApp(): Promise<void> {
  if (appReadyPromise) return appReadyPromise;

  appReadyPromise = new Promise<void>((resolve) => {
    const container = document.createElement("div");
    container.id = "annotator-v2-root";
    container.style.position = "absolute";
    container.style.top = "0";
    container.style.left = "0";
    container.style.width = "100%";
    container.style.zIndex = "2147483647";
    container.style.pointerEvents = "none";

    const updateHeight = () => {
      const h = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
      container.style.height = h + "px";
    };
    updateHeight();

    let debounceTimer: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(updateHeight, 200);
    });
    ro.observe(document.body);

    const shadowRoot = container.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = css;
    shadowRoot.appendChild(style);

    const mountPoint = document.createElement("div");
    mountPoint.id = "app-mount";
    mountPoint.style.width = "100%";
    mountPoint.style.height = "100%";
    shadowRoot.appendChild(mountPoint);

    document.body.appendChild(container);

    createRoot(mountPoint).render(
      <StrictMode>
        <App onReady={() => resolve()} />
      </StrictMode>
    );
  });

  return appReadyPromise;
}

function dispatchWhenReady(action: () => void) {
  void mountApp().then(action).catch((error) => {
    console.error("[annotator] failed to mount overlay", error);
  });
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "TOGGLE_OVERLAY") {
    dispatchWhenReady(() => {
      window.dispatchEvent(new CustomEvent("annotator-toggle"));
    });
  }

  if (msg.type === "SCROLL_TO_ANNOTATION" && msg.annotationId) {
    dispatchWhenReady(() => {
      window.dispatchEvent(new CustomEvent("annotator-scroll-to", {
        detail: { annotationId: msg.annotationId },
      }));
      // Navigation requests must ensure the overlay is visible. A toggle would
      // close it when the user already had annotation mode active.
      window.dispatchEvent(new CustomEvent("annotator-open"));
    });
  }
});

// Handoff: on script load, drain any pending notes the Handoff plugin
// queued for this URL. If anything drained, auto-mount the overlay so
// the user sees the note without needing to press backtick.
(async () => {
  try {
    const drained = await drainPendingNotes(currentPageKey());
    if (drained > 0) {
      await mountApp();
      window.dispatchEvent(new CustomEvent("annotator-open"));
    }
  } catch (e) {
    console.debug("[handoff] drain failed", e);
  }
})();
