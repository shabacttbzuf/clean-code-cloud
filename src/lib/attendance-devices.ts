/**
 * Attendance device integration scaffolding.
 *
 * Future implementations (biometric fingerprint readers, face recognition
 * kiosks, RFID badges, mobile check-in apps) implement this interface.
 * NO device is wired up yet — this is architecture-only, safe to import.
 */

export type AttendanceSource = "manual" | "biometric" | "kiosk" | "mobile" | "api";

export interface AttendancePunch {
  employee_id: string;
  timestamp: string; // ISO
  kind: "check_in" | "check_out";
  source: AttendanceSource;
  device_id?: string;
  biometric_ref?: string;
  raw?: unknown;
}

export interface BiometricDeviceAdapter {
  readonly id: string;
  readonly name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  onPunch(handler: (punch: AttendancePunch) => void): () => void;
}

export interface ReceiptPrinterAdapter {
  readonly id: string;
  readonly name: string;
  readonly paperSize: "58mm" | "80mm" | "A4";
  print(html: string): Promise<void>;
  cut?(): Promise<void>;
  openDrawer?(): Promise<void>;
}

/** Registry stub — device adapters will register themselves here later. */
export const attendanceDeviceRegistry = {
  devices: [] as BiometricDeviceAdapter[],
  printers: [] as ReceiptPrinterAdapter[],
  register(device: BiometricDeviceAdapter) {
    this.devices.push(device);
  },
  registerPrinter(printer: ReceiptPrinterAdapter) {
    this.printers.push(printer);
  },
};