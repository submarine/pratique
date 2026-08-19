// Share codes: "prq1." + base64url(JSON payload). The payload carries only
// what a teammate needs (id, name, permissions, message) — origin and
// timestamps are stamped by the importer. The template id travels with the
// code so re-pasting a newer code from the same teammate updates the imported
// copy in place instead of duplicating it. "prq1" versions the code format
// itself; schemaVersion inside the payload versions the template schema.

import { SCHEMA_VERSION } from "./storage.js";

const PREFIX = "prq1.";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// btoa/atob only speak Latin-1, so UTF-8 bytes are threaded through manually.
// base64url (no + / =) keeps codes safe to paste anywhere.
function bytesToBase64Url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlToBytes(s) {
  const bin = atob(s.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function encodeShareCode(template) {
  const payload = {
    schemaVersion: template.schemaVersion ?? SCHEMA_VERSION,
    id: template.id,
    name: template.name,
    permissions: template.permissions,
    message: template.message ?? "",
  };
  return PREFIX + bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}

// Returns {id, name, permissions, message} or throws with a message fit for
// the panel's status line. Whitespace is stripped first — codes pasted from
// chat apps often arrive wrapped across lines.
export function decodeShareCode(raw) {
  const code = (raw ?? "").replace(/\s+/g, "");
  if (!code) throw new Error("Paste a share code first");
  if (!code.startsWith(PREFIX)) throw new Error("That doesn't look like a Pratique share code");

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(code.slice(PREFIX.length))));
  } catch {
    throw new Error("Share code is damaged — copy it again in full");
  }

  if (typeof payload?.schemaVersion !== "number" || payload.schemaVersion > SCHEMA_VERSION) {
    throw new Error("Share code needs a newer version of Pratique");
  }

  const id = typeof payload.id === "string" && UUID_RE.test(payload.id) ? payload.id : null;
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const permissions =
    Array.isArray(payload.permissions) && payload.permissions.every((p) => typeof p === "string" && p)
      ? [...new Set(payload.permissions)]
      : null;
  const message = typeof (payload.message ?? "") === "string" ? (payload.message ?? "") : null;
  if (!id || !name || !permissions || message === null) {
    throw new Error("Share code is damaged — copy it again in full");
  }

  return { id, name, permissions, message };
}
