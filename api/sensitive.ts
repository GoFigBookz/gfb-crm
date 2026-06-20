/**
 * Sensitive-field helpers — SINs (and other PII) are stored ENCRYPTED at rest
 * (reusing the AES-256-GCM envelope from qbo-oauth) and only revealed through a
 * code gate. SINs are never returned by normal list/get endpoints.
 *
 * The reveal code is FIGGY_SIN_PIN (env). If unset, reveal is disabled and the
 * UI shows a "not configured" message — secure by default.
 */
import { encryptSecret, decryptSecret } from "./qbo-oauth";

export { encryptSecret, decryptSecret };

/** Does this look like an already-encrypted value? */
export function isEncrypted(v: string | null | undefined): boolean {
  return typeof v === "string" && v.startsWith("enc:v1:");
}

/** Validate a SIN-reveal code against FIGGY_SIN_PIN. */
export function checkRevealCode(code: string | null | undefined): { ok: boolean; reason?: string } {
  const pin = process.env.FIGGY_SIN_PIN;
  if (!pin) return { ok: false, reason: "SIN reveal is not configured (set FIGGY_SIN_PIN)." };
  if (!code || code !== pin) return { ok: false, reason: "Incorrect code." };
  return { ok: true };
}

/** Mask a SIN for display: 123-456-789 → •••-•••-789 (last 3 only). */
export function maskSin(decrypted: string | null | undefined): string | null {
  if (!decrypted) return null;
  const digits = decrypted.replace(/\D/g, "");
  if (digits.length < 3) return "•••";
  return `•••-•••-${digits.slice(-3)}`;
}
