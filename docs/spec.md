# Pratique — product spec

> **pratique** /præˈtiːk/ — the licence granted to a ship to enter a port and transact business
> there, once the port authority is satisfied. Ships request it by flying the plain yellow "Q"
> flag. This extension is how we request permission to come aboard a merchant's store.

## Problem

When Shopify Partners provide merchant support for their apps, they file collaborator access
requests through the Shopify Dev Dashboard's **"Request store access"** page
(`https://dev.shopify.com/dashboard/<org>/stores/collaborations/new`).

Good practice is to request the **minimum set of permissions** needed for the job — but the form
offers ~116 individual permissions across 18 collapsible sections, and re-selecting the same
minimal set by hand for every request is slow and error-prone. The request message is likewise
retyped every time.

## Users & context

- **Primary users:** Shopify Partner team members filing support access requests.
- **Environment:** Chrome, logged into the Shopify Dev Dashboard. The dashboard is a Rails +
  Turbo + Stimulus app; navigation between dashboard pages is Turbo Drive (soft visits, no full
  page loads).
- **Trigger page:** `dev.shopify.com/dashboard/<org-id>/stores/collaborations/new`. The form has
  a Store URL field, a collaborator request code field (appears once a store is entered), the
  permissions tree, a message textarea, and a "Request access" submit button.

## V1 scope — local templates (built)

A Chrome extension (Manifest V3) that injects a small panel above the Permissions section of the
request form. No other UI surface (no toolbar popup, no options page).

### User flows

1. **Create a template.** The user selects permissions and writes a message using the page's own
   controls, then hits **Save as new** in the panel, names the template inline, and saves.
   The current permission selections *and* the message are captured together.
2. **Apply a template.** On a later visit, the user picks a template from the panel's dropdown.
   Selection applies immediately: checkboxes are set to exactly the saved set (extras are
   uncleared, missing ones are ticked) and the message textarea is filled with the saved text.
   The store URL and request code are per-request and are never touched.
3. **Update a template.** After applying, the user can adjust selections or the message on the
   page. The panel notices the drift, shows a `modified` badge, and enables **Update**, which
   writes the current form state back to the selected template.
4. **Delete a template.** Two-click confirm (`Delete` → `Confirm delete`), no browser dialogs.

### Acceptance criteria

All verified live against the real page and real extension on 2026-08-19:

- Panel appears on the request page on full loads *and* Turbo soft navigations, exactly once,
  and disappears when navigating away.
- Applying a template restores the exact saved permission set + message onto an arbitrarily
  dirty form, and the page's own UI stays consistent (section counts, submit-button state).
- Templates persist across page reloads and browser restarts, and sync across the user's Chrome
  profile (`chrome.storage.sync`).
- Editing the form after an apply flips the panel to `modified` and enables Update; Update
  persists the changes.
- No console errors; the page's form submission behavior is unaffected by the panel's presence.

## V2 scope — sharing via share codes (built)

Goal: share templates with other team members, ideally as "live" templates that stay current.

**Decision (2026-08-19): share codes.** Export a template as a compact string (JSON, base64);
a teammate pastes it into their extension to import. Zero infrastructure, works day one.
Imports are point-in-time copies, not live-synced.

Considered alternatives, in ascending order of infrastructure:

| Option | Live? | Cost | Notes |
| --- | --- | --- | --- |
| Share codes (chosen) | No — snapshot copies | None | Paste-to-import; provenance recorded in `origin` |
| URL subscription | Yes — polled | Someone maintains a JSON file (gist/repo) | Extension refreshes subscribed templates from a URL |
| Hosted backend | Yes — push/pull | Build + run a service with auth | True centralized store |

Chrome extensions have **no native cross-user data store** — `chrome.storage.sync` only syncs
within one Google account — so any sharing needs one of the above. The v1 schema is already
share-ready: every template carries a stable `id` (UUID), `schemaVersion`, and `origin`.

### User flows

5. **Export a template.** With a template selected, **Export** copies its share code to the
   clipboard; if the clipboard write is refused, an inline row shows the code pre-selected for
   a manual copy instead.
6. **Import a template.** **Import** opens an inline row. Pasting a code and confirming (Enter
   or the Import button) decodes, validates, saves, selects, and immediately applies the
   template — the same semantics as picking it from the dropdown.

### Share code format

`prq1.` + base64url-encoded UTF-8 JSON (`src/share.js`). The `prq1` prefix versions the code
format; `schemaVersion` inside the payload versions the template schema. The payload carries
only `{schemaVersion, id, name, permissions, message}` — `origin` and timestamps are stamped by
the importer. A full 116-permission template encodes to ~5.7KB, comfortably pasteable in chat.

### Import semantics

- **Upsert by id.** The template's original UUID travels in the code, so re-pasting a newer
  code for a template you already imported **updates it in place** rather than duplicating —
  refresh-by-re-paste is the closest zero-infrastructure step toward the "live template" goal.
- Imports are stamped `origin: "imported"`; `createdAt` is preserved on a re-import.
- Decoding strips all whitespace first (chat apps wrap long strings across lines), and every
  failure mode (not a code, newer format version, truncated/corrupted payload, bad field types)
  surfaces a friendly status-line message rather than throwing.
- Unknown permission ids in an imported code are skipped and counted in the status line by the
  apply step, and the desired set is closed over ancestors before applying (see apply
  algorithm) — imported sets are the case that closure guards.

### Acceptance criteria (v2)

- Export → Import on a second profile reproduces the template exactly (name, permissions,
  message) and applies it to the form on import.
- Re-importing a code for an already-imported template updates it in place — the dropdown does
  not grow a duplicate entry.
- A garbled, truncated, or non-Pratique paste produces a readable status-line error and leaves
  storage untouched.
- Export needs no new manifest permissions (clipboard write rides the user gesture; the inline
  fallback row covers refusal).

## Non-goals (v1)

- Filling the store URL or collaborator request code (per-request values).
- Submitting the form or anything else on the user's behalf.
- Toolbar popup / template management outside the request page.
- Message placeholders/variables (e.g. `{{store}}`) — possible future enhancement.
- Firefox/Safari support.

## Technical design

Vanilla JS, no build step (decision 2026-08-19): plain ES modules loaded via a dynamic-import
stub, because MV3 content scripts can't be ES modules directly. Load unpacked from the repo root.

| File | Role |
| --- | --- |
| `manifest.json` | MV3; matches `https://dev.shopify.com/*`; `storage` permission only |
| `src/loader.js` | Registered content script; dynamically imports `content.js` (src files are `web_accessible_resources`) |
| `src/content.js` | Mount/unmount lifecycle across Turbo navigations |
| `src/page.js` | DOM adapter: capture and apply form state |
| `src/panel.js` | Injected panel UI and its state machine |
| `src/storage.js` | Template CRUD on `chrome.storage.sync`, plus upsert-by-id import |
| `src/share.js` | Share-code codec: encode, decode, validate |
| `src/panel.css` | Panel styles, all selectors namespaced |

### Page integration contract

Selectors and behaviors the extension relies on (verified 2026-08-19; the main drift risk):

- `input[name="permissions[]"]` — one per permission (116 at time of writing), with **stable
  value IDs** (e.g. `orders_edit_orders`) and tree shape via `data-parent-id` /
  `data-section-id` (18 sections). Group header toggles are separate, name-less checkboxes.
- `#collaboration-request-message` — the message textarea.
- `[data-controller~="permissions-tree"]` — the permissions card; the panel is injected before
  its containing `.card`.
- **Cascade semantics** (Stimulus `permissions-tree#toggleNode`): checking a node auto-checks
  its ancestors; unchecking a node unchecks all its descendants.
- The page reacts to real `click`/`change` events, so the extension drives the **native
  checkboxes with `.click()`** and the page's own counts/submit logic stay correct.

**Apply algorithm:** compute the desired value set, close it over ancestors (guards imported
sets; captured sets are closed already), then loop: click every checkbox whose **live** checked
state differs from desired; repeat until a full pass makes no clicks (cap 8 passes). Deciding
from a snapshot instead of live state oscillates against the cascades and never converges.
Values in a template that no longer exist on the page are skipped and surfaced in the status
line. The message is set by assigning `.value` and dispatching `input` + `change`.

**Turbo lifecycle:** re-check mounting on `turbo:load`, `turbo:render`, `popstate`, plus a
debounced MutationObserver backstop. The panel carries `data-turbo-temporary` /
`data-turbo-cache="false"` so Turbo won't snapshot it; a restored stale clone is additionally
detectable because JS properties (`__prqLive`) don't survive Turbo's DOM cloning, and is
replaced with a live instance.

**Form-safety details:** the panel sits inside the page's `<form>`, so every panel button is
`type="button"`, panel inputs are name-less (excluded from submission), Enter in the naming
input is swallowed, and the panel stops propagation of its own `change`/`input` events so the
page's controllers never see them.

### Storage schema

One `chrome.storage.sync` key per template — `tpl:<uuid>` — keeping each item well under the
8KB per-item sync quota (a full 116-permission template is ~3.5KB):

```json
{
  "schemaVersion": 1,
  "id": "<uuid>",
  "name": "Submarine support",
  "permissions": ["home_dashboard", "orders_orders", "..."],
  "message": "Hi! ...",
  "origin": "local",
  "createdAt": 1755561600000,
  "updatedAt": 1755561600000
}
```

`origin` is `"local"` for templates saved from the form and `"imported"` for templates that
arrived via share code. `chrome.storage.onChanged` keeps the dropdown in sync across multiple
open dashboard tabs.

### Panel UI

One row: flag glyph + "Pratique" brand · template dropdown · **Update** (enabled only when a
template is selected and the form has drifted) · **Save as new** (opens inline naming row) ·
**Delete** (two-click confirm) · divider · **Export** (needs a selection) · **Import** (opens
inline paste row). Only one inline row (naming / import / export-fallback) is open at a time.
Status line beneath shows the selected template summary
(`"name" · N permissions + message · modified`) or transient action notes. Styled to match the
dashboard's dark card UI; all class names prefixed `prq-`.

## Decisions log

| Date | Decision |
| --- | --- |
| 2026-08-19 | Vanilla JS, no build step (over TS+Vite) |
| 2026-08-19 | Panel placement: inline card above Permissions (over floating side panel) |
| 2026-08-19 | Templates in `chrome.storage.sync`, one key per template |
| 2026-08-19 | Applying a template replaces selections exactly (not additive) and always includes the message |
| 2026-08-19 | v2 sharing via share codes; URL subscription / backend deferred |
| 2026-08-19 | Named **Pratique** (placeholder "Binnacle" retired); yellow Q-flag iconography |
| 2026-08-19 | Share code format: `prq1.` + base64url(JSON payload); no compression |
| 2026-08-19 | Import upserts by template id — re-paste a code to refresh an imported copy |
| 2026-08-19 | Import applies immediately (matches dropdown-select semantics) |

## Risks

- **Shopify DOM drift** — the biggest one. Mitigations: templates store stable permission value
  IDs (not labels/positions); the apply loop reports unknown values instead of failing; all
  page coupling is isolated in `src/page.js`; the integration contract above documents exactly
  what to re-verify.
- **Sync quota** — 100KB total / 8KB per item / 512 items. One key per template keeps items
  small; storage errors surface in the panel status line rather than failing silently.
