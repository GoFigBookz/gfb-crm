/**
 * FIGGY JR — FIRM (GO FIG BOOKZ) LETTERHEAD / BRANDING
 * =============================================================================
 * The firm's own identity for outward-facing documents (quotes, engagement
 * letters). Sourced from the OneNote "Company Reference" doc so documents are
 * legally correct: the operating name is "Go Fig Bookz" but the legal entity is
 * the numbered company 12738988 Canada Inc., so both appear (display name in the
 * header, legal entity + CRA/HST# in the footer). Constant for now; trivially
 * swappable for an editable settings row later.
 * =============================================================================
 */
import { GFB_LOGO_DATA_URI } from "./gfb-logo";

export type FirmSettings = {
  displayName: string;
  legalName: string;      // numbered co.
  legalSuffix: string;    // "o/a Go Fig Bookz"
  hstNumber: string;
  phone: string;
  email: string;
  website: string;
  craRepId: string;       // our CRA Represent-a-Client RepID (for auth requests)
  logoDataUri: string;
  accent: string;         // brand accent color
};

export const FIRM: FirmSettings = {
  displayName: "Go Fig Bookz",
  legalName: "12738988 Canada Inc.",
  legalSuffix: "o/a Go Fig Bookz",
  hstNumber: "781088661 RC0001",
  phone: "416-456-5760",
  email: "markie@gofig.ca",
  website: "www.gofig.ca",
  craRepId: "", // TODO: Markie's CRA Represent-a-Client RepID

  logoDataUri: GFB_LOGO_DATA_URI,
  accent: "#65a30d", // lime-600, matches the CRM
};

export function getFirmSettings(): FirmSettings {
  return FIRM;
}
