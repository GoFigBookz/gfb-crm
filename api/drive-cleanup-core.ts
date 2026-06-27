/**
 * DRIVE CLEANUP & DEDUP — pure core (no I/O).
 * =============================================================================
 * Finds duplicates and space hogs in a Google Drive file list so they can be tidied.
 * Works for BOTH sides: personal pictures/videos (Markie's gmail) and the business
 * gofig Drive. The I/O layer (drive-cleanup-router) pulls the file metadata from the
 * Drive API and applies the chosen action; this file is the deterministic brain.
 *
 * EXACT dedup: Google Drive returns an md5Checksum for every binary file (photos,
 * videos, PDFs, …), so identical files are matched with certainty — no fuzzy guessing.
 * Files without a checksum (Google Docs/Sheets/Slides) fall back to name+size grouping
 * and are only ever flagged as "possible", never auto-selected for cleanup.
 *
 * SAFETY: the only destructive action downstream is move-to-Trash (reversible, 30-day
 * recovery) — never a permanent delete. This core never marks a group's KEEPER for removal.
 * =============================================================================
 */

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: number;            // bytes (absent for Google-native docs)
  md5Checksum?: string;
  modifiedTime?: string;    // ISO
  createdTime?: string;     // ISO
  parents?: string[];
  thumbnailLink?: string;
  webViewLink?: string;
  trashed?: boolean;
  ownedByMe?: boolean;
}

export type FileKind = "image" | "video" | "document" | "other";

export function kindOf(mimeType: string): FileKind {
  if (/^image\//.test(mimeType)) return "image";
  if (/^video\//.test(mimeType)) return "video";
  if (/^(application\/(pdf|vnd\.google-apps\.(document|spreadsheet|presentation))|text\/)/.test(mimeType)) return "document";
  return "other";
}

const KIND_LABEL: Record<FileKind, string> = { image: "Photos", video: "Videos", document: "Documents", other: "Other" };

export function humanSize(bytes: number): string {
  if (!bytes || bytes < 0) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0, n = bytes;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
}

const ms = (f: DriveFile) => (f.modifiedTime ? Date.parse(f.modifiedTime) : 0) || (f.createdTime ? Date.parse(f.createdTime) : 0);
const nameKey = (f: DriveFile) => f.name.trim().toLowerCase().replace(/\s+/g, " ");

export interface DupGroup {
  key: string;
  kind: FileKind;
  exact: boolean;           // true = md5 match (certain); false = name+size (possible)
  size: number;             // per-copy size
  keeper: DriveFile;        // the copy we suggest keeping (oldest original)
  duplicates: DriveFile[];  // the extra copies (candidates to trash)
  reclaim: number;          // bytes freed if duplicates are trashed
}

/**
 * Pick the keeper within a duplicate group: the EARLIEST file (the original), tie-broken
 * by shortest name (avoids "copy of", "(1)" suffixes). The rest become trash candidates.
 */
function chooseKeeper(files: DriveFile[]): { keeper: DriveFile; duplicates: DriveFile[] } {
  const sorted = [...files].sort((a, b) => {
    const ta = ms(a) || Infinity, tb = ms(b) || Infinity;
    if (ta !== tb) return ta - tb;                       // oldest first
    if (a.name.length !== b.name.length) return a.name.length - b.name.length; // shortest name
    return a.id.localeCompare(b.id);                     // stable
  });
  return { keeper: sorted[0], duplicates: sorted.slice(1) };
}

/**
 * Find duplicate groups. Exact groups (md5) first, then possible groups (name+size) for
 * files that have no checksum and weren't already matched exactly.
 */
export function findDuplicates(files: DriveFile[]): { groups: DupGroup[]; reclaim: number; exactReclaim: number } {
  const live = files.filter((f) => !f.trashed);
  const groups: DupGroup[] = [];
  const claimed = new Set<string>();

  // 1) EXACT — by md5Checksum.
  const byMd5 = new Map<string, DriveFile[]>();
  for (const f of live) {
    if (!f.md5Checksum) continue;
    (byMd5.get(f.md5Checksum) ?? byMd5.set(f.md5Checksum, []).get(f.md5Checksum)!).push(f);
  }
  for (const [md5, grp] of byMd5) {
    if (grp.length < 2) continue;
    const { keeper, duplicates } = chooseKeeper(grp);
    const size = grp[0].size ?? 0;
    grp.forEach((f) => claimed.add(f.id));
    groups.push({ key: `md5:${md5}`, kind: kindOf(keeper.mimeType), exact: true, size, keeper, duplicates, reclaim: size * duplicates.length });
  }

  // 2) POSSIBLE — by name + size, for files with no checksum not already claimed.
  const byNameSize = new Map<string, DriveFile[]>();
  for (const f of live) {
    if (claimed.has(f.id) || f.md5Checksum) continue;
    const k = `${nameKey(f)}|${f.size ?? "?"}`;
    (byNameSize.get(k) ?? byNameSize.set(k, []).get(k)!).push(f);
  }
  for (const [k, grp] of byNameSize) {
    if (grp.length < 2) continue;
    const { keeper, duplicates } = chooseKeeper(grp);
    const size = grp[0].size ?? 0;
    groups.push({ key: `ns:${k}`, kind: kindOf(keeper.mimeType), exact: false, size, keeper, duplicates, reclaim: size * duplicates.length });
  }

  groups.sort((a, b) => Number(b.exact) - Number(a.exact) || b.reclaim - a.reclaim);
  const reclaim = groups.reduce((s, g) => s + g.reclaim, 0);
  const exactReclaim = groups.filter((g) => g.exact).reduce((s, g) => s + g.reclaim, 0);
  return { groups, reclaim, exactReclaim };
}

export interface BigFile { id: string; name: string; size: number; kind: FileKind; webViewLink?: string }

/** Largest files — the space hogs worth a look. */
export function biggestFiles(files: DriveFile[], limit = 20): BigFile[] {
  return files
    .filter((f) => !f.trashed && (f.size ?? 0) > 0)
    .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
    .slice(0, limit)
    .map((f) => ({ id: f.id, name: f.name, size: f.size ?? 0, kind: kindOf(f.mimeType), webViewLink: f.webViewLink }));
}

export interface DriveScanSummary {
  totalFiles: number;
  totalBytes: number;
  byKind: { kind: FileKind; label: string; count: number; bytes: number }[];
  dupGroups: number;
  dupExtraFiles: number;
  reclaimBytes: number;       // total if all duplicates trashed
  exactReclaimBytes: number;  // only the certain (md5) duplicates
}

export function summarizeScan(files: DriveFile[], dup: { groups: DupGroup[]; reclaim: number; exactReclaim: number }): DriveScanSummary {
  const live = files.filter((f) => !f.trashed);
  const kinds: FileKind[] = ["image", "video", "document", "other"];
  const byKind = kinds.map((kind) => {
    const fs = live.filter((f) => kindOf(f.mimeType) === kind);
    return { kind, label: KIND_LABEL[kind], count: fs.length, bytes: fs.reduce((s, f) => s + (f.size ?? 0), 0) };
  }).filter((k) => k.count > 0);
  return {
    totalFiles: live.length,
    totalBytes: live.reduce((s, f) => s + (f.size ?? 0), 0),
    byKind,
    dupGroups: dup.groups.length,
    dupExtraFiles: dup.groups.reduce((s, g) => s + g.duplicates.length, 0),
    reclaimBytes: dup.reclaim,
    exactReclaimBytes: dup.exactReclaim,
  };
}

/**
 * Guard for the trash action: from a requested set of file ids, return only those that are
 * a DUPLICATE (never a keeper) in the current scan. Protects against trashing an original.
 */
export function safeTrashIds(requested: string[], groups: DupGroup[]): { allowed: string[]; blocked: string[] } {
  const dupIds = new Set<string>();
  const keeperIds = new Set<string>();
  for (const g of groups) { g.duplicates.forEach((d) => dupIds.add(d.id)); keeperIds.add(g.keeper.id); }
  const allowed: string[] = [], blocked: string[] = [];
  for (const id of requested) (dupIds.has(id) && !keeperIds.has(id) ? allowed : blocked).push(id);
  return { allowed, blocked };
}
