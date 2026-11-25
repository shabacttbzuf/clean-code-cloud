import { useLayoutEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { useAuthSession } from "@/hooks/use-auth-session";

type SavedField = {
  key: string;
  tag: string;
  type: string;
  value?: string;
  checked?: boolean;
};

type SavedPageSnapshot = {
  version: 2;
  fields: SavedField[];
  scrollX: number;
  scrollY: number;
};

const STORAGE_PREFIX = "ras-workspace-form-state-v1";
const FIELD_SELECTOR = "input, textarea, select, [contenteditable='true']";

function isSensitiveField(element: HTMLElement): boolean {
  const input = element as HTMLInputElement;
  const identity = `${input.name ?? ""} ${element.id} ${input.autocomplete ?? ""}`.toLowerCase();
  return element.hasAttribute("data-sensitive") ||
    /password|token|secret|otp|one-time-code|cvv|cvc|card-number|credit-card/.test(identity);
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
      if (["password", "file", "hidden", "button", "submit", "reset"].includes(type)) return [];
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
    const candidate = elements.find((element, elementIndex) =>
      !used.has(element) && fieldKey(element, elementIndex) === saved.key &&
      (saved.tag !== "input" || element instanceof HTMLInputElement && element.type.toLowerCase() === saved.type)
    );
    const element = candidate ?? (Number.isInteger(index) ? elements[index] : undefined);
    if (!element || used.has(element)) continue;
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
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
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
        setter?.call(element, saved.value ?? "");
        element.dispatchEvent(new Event("change", { bubbles: true }));
      }
    } else {
      element.textContent = saved.value ?? "";
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
}

/**
 * Session-scoped form recovery for route changes. Password and file controls are
 * deliberately excluded; the database remains the source of truth after save.
 */
export function WorkspaceFormStateKeeper() {
  const pathname = useRouterState({ select: state => state.location.pathname });
  const { tenantId } = useActiveTenant();
  const { user } = useAuthSession();
  const scope = tenantId && user?.id ? `${STORAGE_PREFIX}:${user.id}:${tenantId}` : null;

  useLayoutEffect(() => {
    if (!scope || !pathname) return;
    const storageKey = `${scope}:${pathname}`;
    const root = document.querySelector("main") ?? document.body;
    let restored = false;
    let restoring = false;
    let discardCurrent = false;
    const restore = () => {
      if (restored || root.querySelectorAll(FIELD_SELECTOR).length === 0) return;
      let fields: SavedField[] = [];
      let scrollX = 0;
      let scrollY = 0;
      try {
        const raw = sessionStorage.getItem(storageKey);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        const validFields = (items: unknown[]): SavedField[] => items.filter((field): field is SavedField =>
          !!field && typeof field === "object" && typeof (field as SavedField).key === "string" &&
          typeof (field as SavedField).tag === "string" && typeof (field as SavedField).type === "string"
        );
        if (Array.isArray(parsed)) {
          // Backward compatibility with snapshots saved before scroll restoration.
          fields = validFields(parsed);
        } else if (parsed && typeof parsed === "object" && "fields" in parsed) {
          const snapshot = parsed as Partial<SavedPageSnapshot>;
          fields = Array.isArray(snapshot.fields) ? validFields(snapshot.fields) : [];
          scrollX = Number.isFinite(snapshot.scrollX) ? Number(snapshot.scrollX) : 0;
          scrollY = Number.isFinite(snapshot.scrollY) ? Number(snapshot.scrollY) : 0;
        }
      } catch { fields = []; }
      if (fields.length || scrollX || scrollY) {
        restoring = true;
        try { applyFields(root, fields); }
        finally { restoring = false; }
        requestAnimationFrame(() => window.scrollTo({ left: scrollX, top: scrollY, behavior: "instant" }));
        window.dispatchEvent(new CustomEvent("ras-workspace-dirty-change", { detail: { path: pathname, dirty: fields.length > 0 } }));
      }
      restored = true;
    };
    const save = () => {
      try {
        const fields = collectFields(root);
        const snapshot: SavedPageSnapshot = {
          version: 2,
          fields,
          scrollX: window.scrollX,
          scrollY: window.scrollY,
        };
        if (fields.length || snapshot.scrollX || snapshot.scrollY) {
          sessionStorage.setItem(storageKey, JSON.stringify(snapshot));
        }
      } catch { /* session storage is optional */ }
    };
    const markDirty = () => {
      if (restoring || !restored) return;
      discardCurrent = false;
      save();
      window.dispatchEvent(new CustomEvent("ras-workspace-dirty-change", { detail: { path: pathname, dirty: true } }));
    };
    const onDiscard = (event: Event) => {
      const detail = (event as CustomEvent<{ path?: string }>).detail;
      if (!detail?.path) return;
      try { sessionStorage.removeItem(`${scope}:${detail.path}`); } catch { /* optional */ }
      if (detail.path === pathname) discardCurrent = true;
      window.dispatchEvent(new CustomEvent("ras-workspace-dirty-change", { detail: { path: detail.path, dirty: false } }));
    };
    const onSaved = (event: Event) => {
      const detail = (event as CustomEvent<{ path?: string }>).detail;
      if (detail?.path !== pathname) return;
      try { sessionStorage.removeItem(storageKey); } catch { /* optional */ }
      discardCurrent = true;
      window.dispatchEvent(new CustomEvent("ras-workspace-dirty-change", { detail: { path: pathname, dirty: false } }));
    };

    const observer = new MutationObserver(() => restore());
    observer.observe(root, { childList: true, subtree: true });
    const timer = window.setTimeout(restore, 120);
    const maxWait = window.setTimeout(() => { observer.disconnect(); }, 15_000);
    root.addEventListener("input", markDirty, true);
    root.addEventListener("change", markDirty, true);
    window.addEventListener("ras-workspace-form-saved", onSaved);
    window.addEventListener("ras-workspace-form-discard", onDiscard);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(maxWait);
      observer.disconnect();
      if (!discardCurrent) save();
      root.removeEventListener("input", markDirty, true);
      root.removeEventListener("change", markDirty, true);
      window.removeEventListener("ras-workspace-form-saved", onSaved);
      window.removeEventListener("ras-workspace-form-discard", onDiscard);
    };
  }, [pathname, scope]);

  return null;
}
