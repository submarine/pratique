# Pratique

> **pratique** /præˈtiːk/ — the licence granted to a ship to enter a port and transact business
> there. Ships request it by flying the plain yellow "Q" flag — hence the icon.

Chrome extension that saves and applies **permission templates** on the Shopify Dev Dashboard's
collaborator access request page (`dev.shopify.com/dashboard/<org>/stores/collaborations/new`).

Filing a support access request means re-ticking the same minimal permission set every time.
Pratique injects a small panel above the Permissions section so you can:

- **Save** the currently selected permissions + request message as a named template
- **Apply** a template from a dropdown — checkboxes and message fill instantly
- **Update** a template after tweaking selections (the panel shows a `modified` badge)
- **Delete** templates you no longer need
- **Export** a template as a compact share code (copied to your clipboard)
- **Import** a teammate's share code — the template is saved and applied immediately

Templates sync across your Chrome profile via `chrome.storage.sync`.

### Sharing

Share codes are self-contained strings (`prq1.` + base64url JSON) — no server involved, so an
import is a point-in-time copy. The template's id travels with the code: when a teammate updates
their template, re-pasting their new code **refreshes your copy in place** instead of creating a
duplicate.

## Install (unpacked)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. **Load unpacked** → select this directory

After editing source files, hit the reload icon on the extension card, then refresh the dashboard tab.

## How it works

No build step — plain ES modules. `src/loader.js` is the registered content script (content scripts
can't be modules), and it dynamically imports the real entrypoint.

| File | Role |
| --- | --- |
| `src/content.js` | Mount/unmount lifecycle. The dashboard is a Turbo Drive app (soft navigations), so mounting is re-checked on `turbo:load`/`turbo:render`/`popstate` plus a MutationObserver backstop. |
| `src/page.js` | DOM adapter for the request form: capture and apply permission + message state. |
| `src/panel.js` | The injected UI (dropdown, Update / Save as new / Delete / Export / Import, status line). |
| `src/storage.js` | Template CRUD on `chrome.storage.sync`, one key per template (`tpl:<uuid>`); import upserts by id. |
| `src/share.js` | Share-code codec — encode/decode/validate `prq1.` + base64url(JSON). |

### Page coupling

The extension drives the page's own form controls (Rails + Stimulus, `permissions-tree` controller),
so Shopify's UI logic keeps working — section counts, group toggles, submit-button state. Selectors
relied on, verified 2026-08-19:

- `input[name="permissions[]"]` — one per permission, stable `value` IDs (e.g. `orders_edit_orders`),
  tree shape via `data-parent-id` / `data-section-id` (18 sections, 116 permissions)
- `#collaboration-request-message` — the request message textarea
- `[data-controller~="permissions-tree"]` — anchor the panel is injected above

Tree cascade rules (why `applyState` looks the way it does): checking a node auto-checks its
ancestors; unchecking a node unchecks its descendants. The apply loop clicks any checkbox whose
**live** state differs from the target set (ancestor-closed first), repeating until convergence —
deciding from a snapshot oscillates.

Templates store permission value IDs, so they survive cosmetic UI changes; if Shopify removes or
renames a permission, applying reports how many saved values no longer exist.

## Roadmap

- ~~**v2 — sharing**: export a template as a compact share code (JSON, base64) that a teammate pastes
  to import.~~ Shipped in 1.0.0.
- Possible next: URL-subscribed templates for true live sharing; message placeholders (`{{store}}`).

Full scope, plan, and decisions log: [`docs/spec.md`](docs/spec.md).

## Authors

Built and shipped by [Submarine](https://getsubmarine.com).

## License

[MIT](LICENSE).
