import { z } from "zod";

export function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
  } catch {
    return false;
  }
}

export const safeHttpUrlSchema = z
  .string()
  .max(2048)
  .refine(isSafeHttpUrl, "يجب أن يكون الرابط http أو https صالحاً.");
