export type UserSettingsPreferences = {
  language: "ar";
  dateFormat: "YYYY-MM-DD" | "DD/MM/YYYY" | "DD-MM-YYYY";
  timeFormat: "12" | "24";
  timeZone: "Asia/Aden" | "Asia/Riyadh" | "UTC" | "local";
  paperSize: "58mm" | "80mm" | "A4";
  copies: "1" | "2" | "3";
  autoPrint: boolean;
  notifyLowStock: boolean;
  notifyDelayedOrders: boolean;
  notifyInvoices: boolean;
  notifyAdministration: boolean;
  notifyHr: boolean;
};

export const DEFAULT_USER_SETTINGS: UserSettingsPreferences = {
  language: "ar",
  dateFormat: "YYYY-MM-DD",
  timeFormat: "24",
  timeZone: "Asia/Aden",
  paperSize: "80mm",
  copies: "1",
  // Preserve the POS behaviour that existed before personal preferences were added.
  autoPrint: true,
  notifyLowStock: true,
  notifyDelayedOrders: true,
  notifyInvoices: true,
  notifyAdministration: true,
  notifyHr: true,
};

export function getUserSettingsPreferences(userId: string | null | undefined): UserSettingsPreferences {
  if (typeof window === "undefined" || !userId) return DEFAULT_USER_SETTINGS;
  try {
    const raw = window.localStorage.getItem(`ras-settings-preferences-v1:${userId}`);
    if (!raw) return DEFAULT_USER_SETTINGS;
    const value = JSON.parse(raw) as Partial<UserSettingsPreferences>;
    return {
      language: "ar",
      dateFormat: ["YYYY-MM-DD", "DD/MM/YYYY", "DD-MM-YYYY"].includes(value.dateFormat ?? "") ? value.dateFormat! : DEFAULT_USER_SETTINGS.dateFormat,
      timeFormat: value.timeFormat === "12" ? "12" : "24",
      timeZone: ["Asia/Aden", "Asia/Riyadh", "UTC", "local"].includes(value.timeZone ?? "") ? value.timeZone! : DEFAULT_USER_SETTINGS.timeZone,
      paperSize: ["58mm", "80mm", "A4"].includes(value.paperSize ?? "") ? value.paperSize! : DEFAULT_USER_SETTINGS.paperSize,
      copies: ["1", "2", "3"].includes(value.copies ?? "") ? value.copies! : DEFAULT_USER_SETTINGS.copies,
      autoPrint: typeof value.autoPrint === "boolean" ? value.autoPrint : DEFAULT_USER_SETTINGS.autoPrint,
      notifyLowStock: typeof value.notifyLowStock === "boolean" ? value.notifyLowStock : true,
      notifyDelayedOrders: typeof value.notifyDelayedOrders === "boolean" ? value.notifyDelayedOrders : true,
      notifyInvoices: typeof value.notifyInvoices === "boolean" ? value.notifyInvoices : true,
      notifyAdministration: typeof value.notifyAdministration === "boolean" ? value.notifyAdministration : true,
      notifyHr: typeof value.notifyHr === "boolean" ? value.notifyHr : true,
    };
  } catch {
    return DEFAULT_USER_SETTINGS;
  }
}

export function isNotificationEnabled(
  notification: { title?: string | null; body?: string | null; type?: string | null; category?: string | null; notification_type?: string | null; urgency?: string | null },
  preferences: UserSettingsPreferences,
): boolean {
  if (notification.urgency === "critical") return true;
  const searchable = [notification.type, notification.category, notification.notification_type, notification.title, notification.body]
    .filter(Boolean).join(" ").toLocaleLowerCase();
  if (/مخزون|نفاد|كمية|stock|inventory/.test(searchable)) return preferences.notifyLowStock;
  if (/موظف|موارد بشرية|راتب|حضور|إجاز|hr|payroll|attendance|employee/.test(searchable)) return preferences.notifyHr;
  if (/فاتور|invoice|سداد|تحصيل|مبيعات|sale|payment/.test(searchable)) return preferences.notifyInvoices;
  if (/طلب متأخر|تأخير الطلب|طلب جديد|مطبخ|order|kitchen|delivery/.test(searchable)) return preferences.notifyDelayedOrders;
  return preferences.notifyAdministration;
}

export function formatUserDateTime(value: string | null | undefined, preferences: UserSettingsPreferences): string {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  try {
    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: preferences.timeFormat === "12",
      ...(preferences.timeZone !== "local" ? { timeZone: preferences.timeZone } : {}),
    };
    const parts = new Intl.DateTimeFormat("ar-YE", options).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
    const datePart = preferences.dateFormat === "DD/MM/YYYY"
      ? `${part("day")}/${part("month")}/${part("year")}`
      : preferences.dateFormat === "DD-MM-YYYY"
        ? `${part("day")}-${part("month")}-${part("year")}`
        : `${part("year")}-${part("month")}-${part("day")}`;
    return `${datePart} ${part("hour")}:${part("minute")}${part("dayPeriod") ? " " + part("dayPeriod") : ""}`;
  } catch {
    return date.toLocaleString("ar-YE");
  }
}
