// DOM adapter for the "Request store access" page. The page is Rails +
// Turbo + Stimulus: every permission is an input[name="permissions[]"] with a
// stable value (e.g. "orders_edit_orders"), arranged in a tree via
// data-parent-id. The page's own permissions-tree controller reacts to real
// click/change events, so driving the native checkboxes keeps its section
// counts, group toggles, and submit-button state correct.

const PERMISSION_SELECTOR = 'input[name="permissions[]"]';
const MESSAGE_ID = "collaboration-request-message";

export function isCollabRequestPath(pathname = location.pathname) {
  return /^\/dashboard\/\d+\/stores\/collaborations\/new\/?$/.test(pathname);
}

export function getTreeRoot() {
  return document.querySelector('[data-controller~="permissions-tree"]');
}

export function getPermissionInputs() {
  return [...document.querySelectorAll(PERMISSION_SELECTOR)];
}

export function getMessageInput() {
  return document.getElementById(MESSAGE_ID);
}

export function captureState() {
  return {
    permissions: getPermissionInputs()
      .filter((cb) => cb.checked)
      .map((cb) => cb.value),
    message: getMessageInput()?.value ?? "",
  };
}

// The tree cascades: checking a node auto-checks its ancestors, unchecking a
// node unchecks all its descendants. Closing the desired set over ancestors
// means those cascades only ever produce states we want, so the apply loop
// below can't oscillate. States captured from the page are already closed;
// this guards hand-edited or imported sets.
function ancestorClosedSet(values, inputs) {
  const byValue = new Map(inputs.map((cb) => [cb.value, cb]));
  const closed = new Set();
  for (const value of values) {
    let cb = byValue.get(value);
    while (cb && !closed.has(cb.value)) {
      closed.add(cb.value);
      // Top-level nodes point at a non-permission "<section>_group" id,
      // which isn't in the map — the walk stops there.
      cb = byValue.get(cb.dataset.parentId);
    }
  }
  return closed;
}

export function applyState({ permissions, message }) {
  const inputs = getPermissionInputs();
  const known = new Set(inputs.map((cb) => cb.value));
  const unknown = permissions.filter((value) => !known.has(value));
  const desired = ancestorClosedSet(permissions.filter((value) => known.has(value)), inputs);

  let converged = false;
  for (let pass = 0; pass < 8 && !converged; pass++) {
    converged = true;
    for (const cb of inputs) {
      // Each click can cascade into other checkboxes, so always decide from
      // the live checked state — deciding from a snapshot oscillates.
      if (cb.checked !== desired.has(cb.value)) {
        cb.click();
        converged = false;
      }
    }
  }

  const messageInput = getMessageInput();
  if (messageInput && messageInput.value !== (message ?? "")) {
    messageInput.value = message ?? "";
    messageInput.dispatchEvent(new Event("input", { bubbles: true }));
    messageInput.dispatchEvent(new Event("change", { bubbles: true }));
  }

  return { unknown, converged };
}
