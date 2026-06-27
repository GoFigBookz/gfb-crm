import { describe, it, expect } from "vitest";
import { findDuplicates, biggestFiles, summarizeScan, safeTrashIds, kindOf, humanSize, type DriveFile } from "./drive-cleanup-core";

const f = (id: string, name: string, opts: Partial<DriveFile> = {}): DriveFile => ({
  id, name, mimeType: "image/jpeg", size: 1000, modifiedTime: "2026-01-01T00:00:00Z", ...opts,
});

describe("drive-cleanup-core — kind + size helpers", () => {
  it("classifies mime types", () => {
    expect(kindOf("image/png")).toBe("image");
    expect(kindOf("video/mp4")).toBe("video");
    expect(kindOf("application/pdf")).toBe("document");
    expect(kindOf("application/zip")).toBe("other");
  });
  it("formats sizes", () => {
    expect(humanSize(0)).toBe("0 B");
    expect(humanSize(1024)).toBe("1.0 KB");
    expect(humanSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("drive-cleanup-core — exact dedup by md5", () => {
  it("groups identical photos, keeps the oldest original", () => {
    const files = [
      f("a", "beach.jpg", { md5Checksum: "X", modifiedTime: "2026-01-01T00:00:00Z", size: 2000 }),
      f("b", "beach (1).jpg", { md5Checksum: "X", modifiedTime: "2026-03-01T00:00:00Z", size: 2000 }),
      f("c", "copy of beach.jpg", { md5Checksum: "X", modifiedTime: "2026-05-01T00:00:00Z", size: 2000 }),
      f("d", "sunset.jpg", { md5Checksum: "Y", size: 3000 }),
    ];
    const { groups, reclaim, exactReclaim } = findDuplicates(files);
    expect(groups.length).toBe(1);
    expect(groups[0].exact).toBe(true);
    expect(groups[0].keeper.id).toBe("a");                 // oldest kept
    expect(groups[0].duplicates.map((x) => x.id).sort()).toEqual(["b", "c"]);
    expect(reclaim).toBe(4000);                            // 2 dups × 2000
    expect(exactReclaim).toBe(4000);
  });
});

describe("drive-cleanup-core — possible dedup by name+size (no checksum)", () => {
  it("flags same name+size docs as possible (not exact)", () => {
    const files = [
      f("g1", "Notes.gdoc", { mimeType: "application/vnd.google-apps.document", size: undefined, md5Checksum: undefined, modifiedTime: "2026-01-01T00:00:00Z" }),
      f("g2", "notes.gdoc", { mimeType: "application/vnd.google-apps.document", size: undefined, md5Checksum: undefined, modifiedTime: "2026-02-01T00:00:00Z" }),
    ];
    const { groups } = findDuplicates(files);
    expect(groups.length).toBe(1);
    expect(groups[0].exact).toBe(false);
    expect(groups[0].keeper.id).toBe("g1");
  });
});

describe("drive-cleanup-core — biggest + summary", () => {
  it("ranks biggest files and summarizes by kind", () => {
    const files = [
      f("a", "a.jpg", { md5Checksum: "X", size: 1000 }),
      f("b", "b.jpg", { md5Checksum: "X", size: 1000 }),
      f("v", "movie.mp4", { mimeType: "video/mp4", size: 9_000_000 }),
    ];
    expect(biggestFiles(files, 1)[0].id).toBe("v");
    const dup = findDuplicates(files);
    const s = summarizeScan(files, dup);
    expect(s.totalFiles).toBe(3);
    expect(s.dupExtraFiles).toBe(1);
    expect(s.byKind.find((k) => k.kind === "video")?.count).toBe(1);
    expect(s.byKind.find((k) => k.kind === "image")?.count).toBe(2);
  });
});

describe("drive-cleanup-core — safeTrashIds never trashes a keeper", () => {
  it("only allows duplicates, blocks keepers + unknowns", () => {
    const files = [
      f("a", "x.jpg", { md5Checksum: "X" }),
      f("b", "x (1).jpg", { md5Checksum: "X", modifiedTime: "2026-09-01T00:00:00Z" }),
    ];
    const { groups } = findDuplicates(files);
    const { allowed, blocked } = safeTrashIds(["a", "b", "zzz"], groups);
    expect(allowed).toEqual(["b"]);                        // only the duplicate
    expect(blocked.sort()).toEqual(["a", "zzz"]);          // keeper + unknown protected
  });
});
