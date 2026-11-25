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

type SavedScrollContainer = { key: string; left: number; top: number };
type SavedPageSnapshot = {
  version: 3;
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

    const readSnapshot = (): SavedPageSnapshot => {
      try {
        const raw = sessionStorage.getItem(storageKey);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        const validFields = (items: unknown[]): SavedField[] => items.filter((field): field is SavedField =>
          !!field && typeof field === "object" && typeof (field as SavedField).key === "string" &&
          typeof (field as SavedField).tag === "string" && typeof (field as SavedField).type === "string"
        );
        if (Array.isArray(parsed)) {
          // Backward compatibility with snapshots saved before versioned view state.
          return { version: 3, fields: validFields(parsed), scrollX: 0, scrollY: 0, scrollContainers: [], openDetails: [] };
        }
        if (parsed && typeof parsed === "object" && "fields" in parsed) {
          const snapshot = parsed as Partial<SavedPageSnapshot>;
          return {
            version: 3,
            fields: Array.isArray(snapshot.fields) ? validFields(snapshot.fields) : [],
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
      return { version: 3, fields: [], scrollX: 0, scrollY: 0, scrollContainers: [], openDetails: [] };
    };

    const restore = () => {
      if (restored) return;
      const snapshot = readSnapshot();
      if (snapshot.fields.length > 0 && root.querySelectorAll(FIELD_SELECTOR).length === 0) return;
      // Restore scroll-only pages even when they contain no form controls.
      const hasState = snapshot.fields.length || snapshot.scrollX || snapshot.scrollY ||
        snapshot.scrollContainers.length || snapshot.openDetails.length;
      if (hasState) {
        restoring = true;
        try {
          applyFields(root, snapshot.fields);
          restoreOpenDetails(root, snapshot.openDetails);
          restoreScrollContainers(root, snapshot.scrollContainers);
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
          detail: { path: pathname, dirty: snapshot.fields.length > 0 },
        }));
      }
      restored = true;
    };

    const save = () => {
      try {
        const active = document.activeElement instanceof HTMLElement && root.contains(document.activeElement)
          ? document.activeElement : null;
        const textControl = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? active : null;
        const fields = collectFields(root);
        const snapshot: SavedPageSnapshot = {
          version: 3,
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
        if (fields.length || snapshot.scrollX || snapshot.scrollY || snapshot.scrollContainers.length || snapshot.openDetails.length) {
          sessionStorage.setItem(storageKey, JSON.stringify(snapshot));
        } else {
          sessionStorage.removeItem(storageKey);
        }
      } catch { /* Session storage is optional; never block navigation. */ }
    };

    const markDirty = () => {
      if (restoring || !restored) return;
      discardCurrent = false;
      save();
      window.dispatchEvent(new CustomEvent("ras-workspace-dirty-change", { detail: { path: pathname, dirty: true } }));
    };
    const saveViewState = () => {
      if (restoring || !restored) return;
      save();
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
      if (!discardCurrent) save();
      root.removeEventListener("input", markDirty, true);
      root.removeEventListener("change", markDirty, true);
      root.removeEventListener("focusin", saveViewState, true);
      root.removeEventListener("toggle", saveViewState, true);
      root.removeEventListener("scroll", saveViewState, true);
      window.removeEventListener("scroll", saveViewState);
      window.removeEventListener("ras-workspace-form-saved", onSaved);
      window.removeEventListener("ras-workspace-form-discard", onDiscard);
    };
  }, [pathname, scope]);

  return null;
}
