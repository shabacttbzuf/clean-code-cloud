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
