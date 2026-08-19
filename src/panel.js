import { h, debounce, setsEqual } from "./util.js";
import * as page from "./page.js";
import * as storage from "./storage.js";
import * as share from "./share.js";

export const PANEL_ID = "prq-panel";
const NOTE_MS = 4000;

// The plain yellow "Q" signal flag — flown to request free pratique.
const FLAG_SVG = `
<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none">
  <rect x="2.4" y="1.4" width="1.4" height="13.2" rx="0.7" fill="currentColor" opacity="0.55"/>
  <rect x="4.6" y="2.4" width="9.2" height="6.8" rx="1" fill="#f4c81d"/>
</svg>`;

export function createPanel() {
  let templates = [];
  let selectedId = null;
  let dirty = false;
  let confirmingDelete = false;
  let note = null;
  let noteTimer = null;
  let confirmTimer = null;

  const select = h("select", { class: "prq-select", onchange: onSelect });
  const updateBtn = h("button", { type: "button", class: "prq-btn prq-btn-primary", onclick: onUpdate }, "Update");
  const saveNewBtn = h("button", { type: "button", class: "prq-btn", onclick: startNaming }, "Save as new");
  const deleteBtn = h("button", { type: "button", class: "prq-btn prq-btn-danger", onclick: onDelete }, "Delete");
  const nameInput = h("input", {
    type: "text",
    class: "prq-input",
    placeholder: "Template name",
    onkeydown: (e) => {
      // The panel lives inside the page's form — swallow Enter so it can't
      // trigger an implicit "Request access" submission.
      if (e.key === "Enter") {
        e.preventDefault();
        onSaveNew();
      } else if (e.key === "Escape") {
        stopNaming();
      }
    },
  });
  const namingRow = h(
    "div",
    { class: "prq-row prq-naming", hidden: true },
    nameInput,
    h("button", { type: "button", class: "prq-btn prq-btn-primary", onclick: onSaveNew }, "Save"),
    h("button", { type: "button", class: "prq-btn", onclick: stopNaming }, "Cancel")
  );
  const exportBtn = h("button", { type: "button", class: "prq-btn", onclick: onExport }, "Export");
  const importBtn = h("button", { type: "button", class: "prq-btn", onclick: startImport }, "Import");
  const importInput = h("input", {
    type: "text",
    class: "prq-input prq-code",
    placeholder: "Paste a share code…",
    onkeydown: (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onImport();
      } else if (e.key === "Escape") {
        closeRows();
        render();
      }
    },
  });
  const importRow = h(
    "div",
    { class: "prq-row prq-naming", hidden: true },
    importInput,
    h("button", { type: "button", class: "prq-btn prq-btn-primary", onclick: onImport }, "Import"),
    h("button", { type: "button", class: "prq-btn", onclick: () => { closeRows(); render(); } }, "Cancel")
  );
  // Fallback surface when the clipboard write is refused — the code is shown
  // for a manual copy instead.
  const exportInput = h("input", {
    type: "text",
    class: "prq-input prq-code",
    readonly: true,
    onfocus: (e) => e.target.select(),
    onclick: (e) => e.target.select(),
  });
  const exportRow = h(
    "div",
    { class: "prq-row prq-naming", hidden: true },
    exportInput,
    h("button", { type: "button", class: "prq-btn", onclick: () => { closeRows(); render(); } }, "Close")
  );
  const status = h("div", { class: "prq-status" });

  const brand = h("span", { class: "prq-brand" });
  brand.innerHTML = FLAG_SVG;
  brand.append("Pratique");

  const el = h(
    "div",
    {
      id: PANEL_ID,
      class: "prq-panel",
      "data-turbo-temporary": true,
      "data-turbo-cache": "false",
    },
    h(
      "div",
      { class: "prq-row" },
      brand,
      select,
      h(
        "div",
        { class: "prq-actions" },
        updateBtn,
        saveNewBtn,
        deleteBtn,
        h("span", { class: "prq-divider" }),
        exportBtn,
        importBtn
      )
    ),
    namingRow,
    importRow,
    exportRow,
    status
  );

  // Keep the panel's own change/input events away from the page's Stimulus
  // controllers (and the page's from re-processing ours).
  for (const type of ["change", "input"]) {
    el.addEventListener(type, (e) => e.stopPropagation());
  }

  function selectedTemplate() {
    return templates.find((t) => t.id === selectedId) ?? null;
  }

  function setNote(text) {
    note = text;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => {
      note = null;
      render();
    }, NOTE_MS);
    render();
  }

  function resetDeleteConfirm() {
    confirmingDelete = false;
    clearTimeout(confirmTimer);
  }

  // Only one secondary row (naming / import / export) is open at a time.
  function closeRows() {
    namingRow.hidden = true;
    importRow.hidden = true;
    exportRow.hidden = true;
  }

  function recomputeDirty() {
    const tpl = selectedTemplate();
    if (!tpl) {
      dirty = false;
      return;
    }
    const current = page.captureState();
    dirty =
      !setsEqual(new Set(tpl.permissions), new Set(current.permissions)) ||
      (tpl.message ?? "") !== current.message;
  }

  function render() {
    select.replaceChildren(
      h("option", { value: "" }, templates.length ? "Select a template…" : "No templates saved yet"),
      ...templates.map((t) => h("option", { value: t.id }, t.name))
    );
    select.value = selectedId ?? "";

    const tpl = selectedTemplate();
    updateBtn.disabled = !tpl || !dirty;
    deleteBtn.disabled = !tpl;
    exportBtn.disabled = !tpl;
    deleteBtn.textContent = confirmingDelete ? "Confirm delete" : "Delete";
    deleteBtn.classList.toggle("prq-btn-confirming", confirmingDelete);

    let text;
    if (note) {
      text = note;
    } else if (!namingRow.hidden) {
      text = "Name this template, then save.";
    } else if (!importRow.hidden) {
      text = "Paste a share code from a teammate, then import.";
    } else if (!exportRow.hidden) {
      text = "Copy the share code and send it to a teammate.";
    } else if (tpl) {
      const messagePart = (tpl.message ?? "").trim() ? " + message" : "";
      text = `“${tpl.name}” · ${tpl.permissions.length} permission${tpl.permissions.length === 1 ? "" : "s"}${messagePart}${dirty ? " · modified" : ""}`;
    } else if (!templates.length) {
      text = "No templates yet — pick permissions, add a message, then “Save as new”.";
    } else {
      text = "Select a template to fill the form.";
    }
    status.textContent = text;
  }

  function onSelect() {
    resetDeleteConfirm();
    selectedId = select.value || null;
    const tpl = selectedTemplate();
    if (!tpl) {
      recomputeDirty();
      render();
      return;
    }
    const result = page.applyState(tpl);
    recomputeDirty();
    setNote(`Applied “${tpl.name}”${applyWarnings(result)}`);
  }

  function applyWarnings(result) {
    const warnings = [];
    if (result.unknown.length) {
      warnings.push(`${result.unknown.length} saved permission${result.unknown.length === 1 ? "" : "s"} no longer exist on this page`);
    }
    if (!result.converged) warnings.push("some selections could not be applied");
    return warnings.length ? ` — ${warnings.join("; ")}` : "";
  }

  async function onUpdate() {
    const tpl = selectedTemplate();
    if (!tpl) return;
    resetDeleteConfirm();
    const current = page.captureState();
    try {
      await storage.saveTemplate({
        ...tpl,
        permissions: current.permissions,
        message: current.message,
        updatedAt: Date.now(),
      });
      await refreshTemplates();
      recomputeDirty();
      setNote(`Saved changes to “${tpl.name}”`);
    } catch (error) {
      setNote(`Couldn't save: ${error.message}`);
    }
  }

  function startNaming() {
    resetDeleteConfirm();
    closeRows();
    namingRow.hidden = false;
    nameInput.value = "";
    render();
    nameInput.focus();
  }

  function stopNaming() {
    namingRow.hidden = true;
    render();
  }

  async function onExport() {
    const tpl = selectedTemplate();
    if (!tpl) return;
    resetDeleteConfirm();
    const code = share.encodeShareCode(tpl);
    try {
      await navigator.clipboard.writeText(code);
      closeRows();
      setNote(`Share code for “${tpl.name}” copied — send it to a teammate`);
    } catch {
      // Clipboard refused (page unfocused, permissions policy) — show the
      // code pre-selected for a manual copy instead.
      closeRows();
      exportRow.hidden = false;
      exportInput.value = code;
      render();
      exportInput.focus();
    }
  }

  function startImport() {
    resetDeleteConfirm();
    closeRows();
    importRow.hidden = false;
    importInput.value = "";
    render();
    importInput.focus();
  }

  async function onImport() {
    let payload;
    try {
      payload = share.decodeShareCode(importInput.value);
    } catch (error) {
      setNote(error.message);
      importInput.focus();
      return;
    }
    resetDeleteConfirm();
    try {
      const { template, updated } = await storage.importTemplate(payload);
      closeRows();
      importInput.value = "";
      await refreshTemplates();
      selectedId = template.id;
      // Same semantics as picking it from the dropdown: apply immediately.
      const result = page.applyState(template);
      recomputeDirty();
      setNote(
        `${updated ? "Updated" : "Imported"} “${template.name}” · ${template.permissions.length} permission${template.permissions.length === 1 ? "" : "s"} · applied${applyWarnings(result)}`
      );
    } catch (error) {
      setNote(`Couldn't import: ${error.message}`);
    }
  }

  async function onSaveNew() {
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      return;
    }
    const current = page.captureState();
    try {
      const tpl = await storage.saveTemplate(storage.newTemplate({ name, ...current }));
      namingRow.hidden = true;
      await refreshTemplates();
      selectedId = tpl.id;
      recomputeDirty();
      setNote(`Saved “${tpl.name}” · ${tpl.permissions.length} permissions`);
    } catch (error) {
      setNote(`Couldn't save: ${error.message}`);
    }
  }

  async function onDelete() {
    const tpl = selectedTemplate();
    if (!tpl) return;
    if (!confirmingDelete) {
      confirmingDelete = true;
      confirmTimer = setTimeout(() => {
        confirmingDelete = false;
        render();
      }, 3000);
      render();
      return;
    }
    resetDeleteConfirm();
    try {
      await storage.deleteTemplate(tpl.id);
      selectedId = null;
      await refreshTemplates();
      recomputeDirty();
      setNote(`Deleted “${tpl.name}”`);
    } catch (error) {
      setNote(`Couldn't delete: ${error.message}`);
    }
  }

  async function refreshTemplates() {
    templates = await storage.listTemplates();
    if (selectedId && !templates.some((t) => t.id === selectedId)) selectedId = null;
    render();
  }

  // Mark the form "modified" when the user tweaks checkboxes or the message
  // after applying a template. Capture phase on document so we hear the
  // page's events without touching its handlers.
  const onFormMutation = debounce(() => {
    if (!selectedId) return;
    recomputeDirty();
    render();
  }, 150);
  const formListener = (e) => {
    if (el.contains(e.target)) return;
    onFormMutation();
  };
  document.addEventListener("change", formListener, true);
  document.addEventListener("input", formListener, true);

  const unsubscribe = storage.onTemplatesChanged(() => {
    refreshTemplates().then(() => {
      recomputeDirty();
      render();
    });
  });

  el.__prqLive = true; // property doesn't survive Turbo's snapshot clone → stale copies are detectable
  el.__prqDestroy = () => {
    document.removeEventListener("change", formListener, true);
    document.removeEventListener("input", formListener, true);
    unsubscribe();
    clearTimeout(noteTimer);
    clearTimeout(confirmTimer);
    el.remove();
  };

  render();
  refreshTemplates();
  return el;
}
