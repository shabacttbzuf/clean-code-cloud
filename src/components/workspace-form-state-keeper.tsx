import { useLayoutEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { useAuthSession } from "@/hooks/use-auth-session";
import { createWorkspaceTabScope, normalizeWorkspacePath } from "@/lib/workspace-tabs-logic.mjs";

type SavedField = {
  key: string;
  tag: string;
  type: string;
  value?: string;
  checked?: boolean;
};

type SavedScrollContainer = { key: string; left: number; top: number };
type SavedPageSnapshot = {
  version: 4;
  dirty: boolean;
  dirtyForms: string[];
  fields: SavedField[];
  scrollX: number;
  scrollY: number;
  scrollContainers: SavedScrollContainer[];
  focusedField?: string;
  selectionStart?: number | null;
  selectionEnd?: number | null;
  openDetails: string[];
};

const STORAGE_PREFIX = "ras-workspace-form-state-v1";
const FIELD_SELECTOR = "input, textarea, select, [contenteditable='true']";

function isSensitiveField(element: HTMLElement): boolean {
  const input = element as HTMLInputElement;
  const identity = `${input.name ?? ""} ${element.id} ${input.getAttribute("autocomplete") ?? ""} ${element.getAttribute("aria-label") ?? ""}`.toLowerCase();
  return element.hasAttribute("data-sensitive") ||
    /password|token|secret|otp|one-time-code|cvv|cvc|card-number|credit-card|authorization/.test(identity);
}

function fieldKey(element: HTMLElement, index: number): string {
  return element.dataset.workspaceKey ||
    (element as HTMLInputElement).name ||
    element.id ||
    `field-${index}`;
}

function collectFields(root: ParentNode): SavedField[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FIELD_SELECTOR)).flatMap<SavedField>((element, index): SavedField[] => {
    if (element.closest("[data-workspace-restore='off']") || isSensitiveField(element)) return [];
    if (element instanceof HTMLInputElement) {
      const type = element.type.toLowerCase();
      if (["password", "file", "hidden", "button", "submit", "reset", "image"].includes(type)) return [];
      return [{
        key: fieldKey(element, index), tag: "input", type,
        value: type === "checkbox" || type === "radio" ? undefined : element.value,
        checked: type === "checkbox" || type === "radio" ? element.checked : undefined,
      }];
    }
    if (element instanceof HTMLTextAreaElement) {
      return [{ key: fieldKey(element, index), tag: "textarea", type: "textarea", value: element.value }];
    }
    if (element instanceof HTMLSelectElement) {
      return [{ key: fieldKey(element, index), tag: "select", type: "select", value: element.multiple
        ? JSON.stringify(Array.from(element.selectedOptions, option => option.value))
        : element.value }];
    }
    return [{ key: fieldKey(element, index), tag: "contenteditable", type: "contenteditable", value: element.textContent ?? "" }];
  });
}

function applyFields(root: ParentNode, fields: SavedField[]) {
  const elements = Array.from(root.querySelectorAll<HTMLElement>(FIELD_SELECTOR));
  const used = new Set<HTMLElement>();
  for (const saved of fields) {
    const index = Number(saved.key.startsWith("field-") ? saved.key.slice(6) : NaN);
    const element = elements.find((candidate, elementIndex) =>
      !used.has(candidate) && fieldKey(candidate, elementIndex) === saved.key &&
      (saved.tag !== "input" || candidate instanceof HTMLInputElement && candidate.type.toLowerCase() === saved.type)
    ) ?? (Number.isInteger(index) ? elements[index] : undefined);
    if (!element || used.has(element) || isSensitiveField(element)) continue;
    used.add(element);
    if (element instanceof HTMLInputElement) {
      if (saved.checked !== undefined) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked")?.set;
        setter?.call(element, saved.checked);
        element.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(element, saved.value ?? "");
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      }
    } else if (element instanceof HTMLTextAreaElement) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(element, saved.value ?? "");
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (element instanceof HTMLSelectElement) {
      if (element.multiple) {
        let selectedValues: string[] = [];
        try {
          const parsed: unknown = JSON.parse(saved.value ?? "[]");
          if (Array.isArray(parsed)) selectedValues = parsed.filter((value): value is string => typeof value === "string");
        } catch { selectedValues = []; }
        const selected = new Set<string>(selectedValues);
        Array.from(element.options).forEach(option => { option.selected = selected.has(option.value); });
        element.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
        setter?.call(element, saved.value ?? "");
        element.dispatchEvent(new Event("change", { bubbles: true }));
      }
    } else {
      element.textContent = saved.value ?? "";
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
}

function scrollableElements(root: ParentNode): HTMLElement[] {
  const candidates = [ ...(root instanceof HTMLElement ? [root] : []), ...Array.from(root.querySelectorAll<HTMLElement>("*")) ];
  return candidates.filter((element) => {
    if (element.closest("[data-workspace-restore='off']")) return false;
    const style = window.getComputedStyle(element);
    const vertical = /(auto|scroll|overlay)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 8;
    const horizontal = /(auto|scroll|overlay)/.test(style.overflowX) && element.scrollWidth > element.clientWidth + 8;
    return vertical || horizontal;
  });
}

function scrollKey(element: HTMLElement, index: number): string {
  return element.id || element.dataset.workspaceScrollKey || `scroll-${index}`;
}

function collectScrollContainers(root: ParentNode): SavedScrollContainer[] {
  return scrollableElements(root).map((element, index) => ({
    key: scrollKey(element, index), left: element.scrollLeft, top: element.scrollTop,
  }));
}

function restoreScrollContainers(root: ParentNode, saved: SavedScrollContainer[]) {
  const elements = scrollableElements(root);
  saved.forEach((item, index) => {
    const element = elements.find((candidate, candidateIndex) => scrollKey(candidate, candidateIndex) === item.key)
      ?? (item.key.startsWith("scroll-") ? elements[Number(item.key.slice(7))] : undefined);
    if (element) {
      element.scrollLeft = item.left;
      element.scrollTop = item.top;
    }
  });
}

function collectOpenDetails(root: ParentNode): string[] {
  return Array.from(root.querySelectorAll<HTMLDetailsElement>("details[open]"))
    .map((element, index) => element.id || element.dataset.workspaceKey || `details-${index}`);
}

function restoreOpenDetails(root: ParentNode, keys: string[]) {
  const details = Array.from(root.querySelectorAll<HTMLDetailsElement>("details"));
  details.forEach((element, index) => {
    const key = element.id || element.dataset.workspaceKey || `details-${index}`;
    element.open = keys.includes(key);
  });
}

/**
 * Session-scoped recovery for every authenticated route. It preserves native form
 * controls, contenteditable text, window/nested scrolling, open disclosure panels
 * and the last focused field. Sensitive fields are intentionally never persisted.
 * Complex widgets with private React state must expose their state through native
 * controls or implement the workspace snapshot events themselves.
 */
export function WorkspaceFormStateKeeper() {
  const pathname = useRouterState({ select: state => state.location.pathname });
  const locationHref = useRouterState({ select: state => state.location.href });
  const routeKey = normalizeWorkspacePath(locationHref) ?? pathname;
  const { tenantId, membership } = useActiveTenant();
  const { user } = useAuthSession();
  const sessionScope = createWorkspaceTabScope(user?.id, tenantId, membership?.company_id, membership?.branch_id);
  const scope = sessionScope ? \`\${STORAGE_PREFIX}:\${sessionScope}\` : null;

  useLayoutEffect(() => {
    if (!scope || !sessionScope || !pathname) return;
    const storageKey = \`\${scope}:\${routeKey}\`;
    const root = document.querySelector("main") ?? document.body;
    let restored = false;
    let restoring = false;
    let discardCurrent = false;
    let dirtyForms = new Set<string>();
    let hasUnsavedChanges = false;

    const readSnapshot = (): SavedPageSnapshot => {
      try {
        const raw = sessionStorage.getItem(storageKey);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        const validFields = (items: unknown[]): SavedField[] => items.filter((field): field is SavedField =>
          !!field && typeof field === "object" && typeof (field as SavedField).key === "string" &&
          typeof (field as SavedField).tag === "string" && typeof (field as SavedField).type === "string"
        );
        if (Array.isArray(parsed)) {
          const fields = validFields(parsed);
          return { version: 4, dirty: fields.length > 0, dirtyForms: fields.length > 0 ? ["legacy"] : [], fields, scrollX: 0, scrollY: 0, scrollContainers: [], openDetails: [] };
        }
        if (parsed && typeof parsed === "object" && "fields" in parsed) {
          const snapshot = parsed as Partial<SavedPageSnapshot>;
          const fields = Array.isArray(snapshot.fields) ? validFields(snapshot.fields) : [];
          return {
            version: 4,
            dirty: typeof snapshot.dirty === "boolean" ? snapshot.dirty : fields.length > 0,
            dirtyForms: Array.isArray(snapshot.dirtyForms)
              ? snapshot.dirtyForms.filter((key): key is string => typeof key === "string")
              : (typeof snapshot.dirty === "boolean" ? snapshot.dirty : fields.length > 0) ? ["legacy"] : [],
            fields,
            scrollX: Number.isFinite(snapshot.scrollX) ? Number(snapshot.scrollX) : 0,
            scrollY: Number.isFinite(snapshot.scrollY) ? Number(snapshot.scrollY) : 0,
            scrollContainers: Array.isArray(snapshot.scrollContainers) ? snapshot.scrollContainers.filter(item =>
              !!item && typeof item.key === "string" && Number.isFinite(item.left) && Number.isFinite(item.top)
            ) : [],
            focusedField: typeof snapshot.focusedField === "string" ? snapshot.focusedField : undefined,
            selectionStart: snapshot.selectionStart,
            selectionEnd: snapshot.selectionEnd,
            openDetails: Array.isArray(snapshot.openDetails) ? snapshot.openDetails.filter((key): key is string => typeof key === "string") : [],
          };
        }
      } catch { /* Corrupt or unavailable session storage is ignored safely. */ }
      return { version: 4, dirty: false, dirtyForms: [], fields: [], scrollX: 0, scrollY: 0, scrollContainers: [], openDetails: [] };
    };

    const restore = () => {
      if (restored) return;
      const snapshot = readSnapshot();
      if (snapshot.fields.length > 0 && root.querySelectorAll(FIELD_SELECTOR).length === 0) return;
      const hasState = snapshot.dirty || snapshot.fields.length || snapshot.scrollX || snapshot.scrollY ||
        snapshot.scrollContainers.length || snapshot.openDetails.length;
      if (hasState) {
        restoring = true;
        try {
          applyFields(root, snapshot.fields);
          restoreOpenDetails(root, snapshot.openDetails);
          restoreScrollContainers(root, snapshot.scrollContainers);
          dirtyForms = new Set(snapshot.dirtyForms);
          hasUnsavedChanges = snapshot.dirty;
        } finally { restoring = false; }
        requestAnimationFrame(() => {
          window.scrollTo({ left: snapshot.scrollX, top: snapshot.scrollY, behavior: "instant" });
          restoreScrollContainers(root, snapshot.scrollContainers);
          if (snapshot.focusedField) {
            const target = Array.from(root.querySelectorAll<HTMLElement>(FIELD_SELECTOR))
              .find((element, index) => fieldKey(element, index) === snapshot.focusedField);
            if (target && !isSensitiveField(target)) {
              target.focus({ preventScroll: true });
              if ((target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) &&
                typeof snapshot.selectionStart === "number" && typeof snapshot.selectionEnd === "number") {
                try { target.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd); } catch { /* Unsupported input type. */ }
              }
            }
          }
        });
        window.dispatchEvent(new CustomEvent("ras-workspace-dirty-change", {
          detail: { path: routeKey, dirty: snapshot.dirty, scope: sessionScope },
        }));
      }
      restored = true;
    };

    const save = (dirty = hasUnsavedChanges) => {
      try {
        const active = document.activeElement instanceof HTMLElement && root.contains(document.activeElement)
          ? document.activeElement : null;
        const textControl = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? active : null;
        const fields = collectFields(root);
        const snapshot: SavedPageSnapshot = {
          version: 4,
          dirty,
          dirtyForms: Array.from(dirtyForms),
          fields,
          scrollX: window.scrollX,
          scrollY: window.scrollY,
          scrollContainers: collectScrollContainers(root),
          focusedField: active && !isSensitiveField(active) && FIELD_SELECTOR.split(", ").some(selector => active.matches(selector))
            ? fieldKey(active, Array.from(root.querySelectorAll<HTMLElement>(FIELD_SELECTOR)).indexOf(active)) : undefined,
          selectionStart: textControl?.selectionStart,
          selectionEnd: textControl?.selectionEnd,
          openDetails: collectOpenDetails(root),
        };
        if (dirty || fields.length || snapshot.scrollX || snapshot.scrollY || snapshot.scrollContainers.length || snapshot.openDetails.length) {
          sessionStorage.setItem(storageKey, JSON.stringify(snapshot));
        } else {
          sessionStorage.removeItem(storageKey);
        }
      } catch { /* Session storage is optional; never block navigation. */ }
    };

    const markDirty = (event: Event) => {
      if (restoring || !restored) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("[data-workspace-dirty='off']")) return;
      if (event.type !== "submit" && !target?.closest("form, [role='dialog'], [data-workspace-dirty='on']")) return;
      const form = target?.closest("form");
      const formKey = form
        ? (form.id || form.dataset.workspaceFormKey || `form-${Array.from(root.querySelectorAll("form")).indexOf(form)}`)
        : "custom";
      discardCurrent = false;
      dirtyForms.add(formKey);
      hasUnsavedChanges = dirtyForms.size > 0;
      save(hasUnsavedChanges);
      window.dispatchEvent(new CustomEvent("ras-workspace-dirty-change", {
        detail: { path: routeKey, dirty: true, scope: sessionScope },
      }));
    };
    const saveViewState = () => {
      if (restoring || !restored) return;
      save(hasUnsavedChanges);
    };
    const onDiscard = (event: Event) => {
      const detail = (event as CustomEvent<{ path?: string; scope?: string }>).detail;
      if (!detail?.path || (detail.scope && detail.scope !== sessionScope)) return;
      const discardedPath = normalizeWorkspacePath(detail.path) ?? detail.path;
      if (discardedPath !== routeKey && discardedPath !== pathname) return;
      try { sessionStorage.removeItem(storageKey); } catch { /* optional */ }
      discardCurrent = true;
      dirtyForms.clear();
      hasUnsavedChanges = false;
      window.dispatchEvent(new CustomEvent("ras-workspace-dirty-change", {
        detail: { path: routeKey, dirty: false, scope: sessionScope },
      }));
    };
    const onSaved = (event: Event) => {
      const detail = (event as CustomEvent<{ path?: string; scope?: string; formKey?: string }>).detail;
      if (!detail?.path || (detail.scope && detail.scope !== sessionScope)) return;
      const savedPath = normalizeWorkspacePath(detail.path) ?? detail.path;
      if (savedPath !== routeKey && savedPath !== pathname) return;
      if (detail.formKey) {
        dirtyForms.delete(detail.formKey);
      } else if (dirtyForms.size <= 1) {
        dirtyForms.clear();
      } else {
        return;
      }
      discardCurrent = dirtyForms.size === 0;
      hasUnsavedChanges = dirtyForms.size > 0;
      if (hasUnsavedChanges) save(true);
      else {
        try { sessionStorage.removeItem(storageKey); } catch { /* optional */ }
      }
      window.dispatchEvent(new CustomEvent("ras-workspace-dirty-change", {
        detail: { path: routeKey, dirty: hasUnsavedChanges, scope: sessionScope },
      }));
    };

    const observer = new MutationObserver(() => restore());
    observer.observe(root, { childList: true, subtree: true });
    const timer = window.setTimeout(restore, 120);
    const maxWait = window.setTimeout(() => { observer.disconnect(); }, 15_000);
    root.addEventListener("input", markDirty, true);
    root.addEventListener("change", markDirty, true);
    root.addEventListener("submit", markDirty, true);
    root.addEventListener("click", markDirty, true);
    root.addEventListener("focusin", saveViewState, true);
    root.addEventListener("toggle", saveViewState, true);
    root.addEventListener("scroll", saveViewState, true);
    window.addEventListener("scroll", saveViewState, { passive: true });
    window.addEventListener("ras-workspace-form-saved", onSaved);
    window.addEventListener("ras-workspace-form-discard", onDiscard);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(maxWait);
      observer.disconnect();
      if (!discardCurrent) save(hasUnsavedChanges);
      root.removeEventListener("input", markDirty, true);
      root.removeEventListener("change", markDirty, true);
      root.removeEventListener("submit", markDirty, true);
      root.removeEventListener("click", markDirty, true);
      root.removeEventListener("focusin", saveViewState, true);
      root.removeEventListener("toggle", saveViewState, true);
      root.removeEventListener("scroll", saveViewState, true);
      window.removeEventListener("scroll", saveViewState);
      window.removeEventListener("ras-workspace-form-saved", onSaved);
      window.removeEventListener("ras-workspace-form-discard", onDiscard);
    };
  }, [pathname, routeKey, scope, sessionScope]);

  return null;
}
