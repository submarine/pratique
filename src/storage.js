// Templates live in chrome.storage.sync, one key per template so each stays
// well under the 8KB per-item sync quota (a full 116-permission template is
// ~3.5KB). Schema is future-proofed for sharing: stable UUID, schemaVersion,
// and origin ("local" now; imported share codes can stamp their provenance).

const TPL_PREFIX = "tpl:";
export const SCHEMA_VERSION = 1;

function area() {
  return chrome.storage.sync ?? chrome.storage.local;
}

export function newTemplate({ name, permissions, message }) {
  const now = Date.now();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: crypto.randomUUID(),
    name,
    permissions,
    message,
    origin: "local",
    createdAt: now,
    updatedAt: now,
  };
}

export async function listTemplates() {
  const all = await area().get(null);
  return Object.entries(all)
    .filter(([key]) => key.startsWith(TPL_PREFIX))
    .map(([, value]) => value)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveTemplate(template) {
  await area().set({ [TPL_PREFIX + template.id]: template });
  return template;
}

export async function deleteTemplate(id) {
  await area().remove(TPL_PREFIX + id);
}

// Share-code import. Upserts by the template's original id: pasting a newer
// code for a template you already imported refreshes it in place rather than
// duplicating. Returns whether it was an update so the panel can say so.
export async function importTemplate({ id, name, permissions, message }) {
  const key = TPL_PREFIX + id;
  const existing = (await area().get(key))[key];
  const now = Date.now();
  const template = {
    schemaVersion: SCHEMA_VERSION,
    id,
    name,
    permissions,
    message,
    origin: "imported",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await area().set({ [key]: template });
  return { template, updated: Boolean(existing) };
}

// Fires on any template change, including ones made from other tabs — keeps
// every open dashboard tab's dropdown in sync. Returns an unsubscribe fn.
export function onTemplatesChanged(callback) {
  const listener = (changes) => {
    if (Object.keys(changes).some((key) => key.startsWith(TPL_PREFIX))) callback();
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
