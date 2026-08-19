import { debounce } from "./util.js";
import * as page from "./page.js";
import { createPanel, PANEL_ID } from "./panel.js";

// The dev dashboard is a Turbo Drive app: sidebar navigation swaps the body
// without a full page load, so this script mounts/unmounts the panel as the
// user moves around. A MutationObserver backstops the turbo:* events for any
// render path that doesn't fire them.

let active = null;

function unmount() {
  active?.__prqDestroy?.();
  active = null;
}

function ensureMounted() {
  if (!page.isCollabRequestPath()) {
    unmount();
    return;
  }
  const tree = page.getTreeRoot();
  if (!tree) return; // page shell present but form not rendered yet — observer will re-run us

  const existing = document.getElementById(PANEL_ID);
  if (existing?.__prqLive) return;
  // A Turbo cache restore can resurrect a listener-less clone of the panel;
  // replace it with a live one.
  if (existing) existing.remove();
  if (active) unmount();

  const card = tree.closest(".card") ?? tree.parentElement;
  active = createPanel();
  card.parentElement.insertBefore(active, card);
}

const scheduleEnsure = debounce(ensureMounted, 150);

document.addEventListener("turbo:load", scheduleEnsure);
document.addEventListener("turbo:render", scheduleEnsure);
window.addEventListener("popstate", scheduleEnsure);
new MutationObserver(scheduleEnsure).observe(document.documentElement, {
  childList: true,
  subtree: true,
});

ensureMounted();
