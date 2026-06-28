import { describe, it, expect } from "vitest";
import { normalizeFaxNumber, isValidFaxNumber, formatFaxNumber, buildSrFaxQueueParams, parseSrFaxResponse } from "./fax-core";

describe("fax number helpers", () => {
  it("normalizes 10-digit to 11-digit NANP", () => {
    expect(normalizeFaxNumber("(705) 123-4567")).toBe("17051234567");
    expect(normalizeFaxNumber("705.123.4567")).toBe("17051234567");
    expect(normalizeFaxNumber("1-705-123-4567")).toBe("17051234567");
  });
  it("validates NANP and rejects junk", () => {
    expect(isValidFaxNumber("705-123-4567")).toBe(true);
    expect(isValidFaxNumber("17051234567")).toBe(true);
    expect(isValidFaxNumber("123")).toBe(false);
    expect(isValidFaxNumber("")).toBe(false);
    expect(isValidFaxNumber("0051234567")).toBe(false); // area code can't start with 0/1
  });
  it("formats for display", () => {
    expect(formatFaxNumber("17051234567")).toBe("(705) 123-4567");
    expect(formatFaxNumber("garbage")).toBe("garbage");
  });
});

describe("SRFax payload", () => {
  const cfg = { accessId: "1234", accessPwd: "pw", callerId: "7059999999", senderEmail: "markie@gofig.ca" };
  it("builds a Queue_Fax param map", () => {
    const p = buildSrFaxQueueParams(cfg, { toNumber: "705-123-4567", fileName: "letter.pdf", fileContentB64: "QUJD" });
    expect(p.action).toBe("Queue_Fax");
    expect(p.access_id).toBe("1234");
    expect(p.sToFaxNumber).toBe("17051234567");
    expect(p.sCallerID).toBe("7059999999");
    expect(p.sFileName_1).toBe("letter.pdf");
    expect(p.sFileContent_1).toBe("QUJD");
    expect(p.sResponseFormat).toBe("JSON");
    expect(p.sCoverPage).toBeUndefined(); // none unless asked
  });
  it("adds cover-page fields only when a cover is chosen", () => {
    const p = buildSrFaxQueueParams(cfg, { toNumber: "7051234567", fileName: "f.pdf", fileContentB64: "x", coverPage: "Standard", coverTo: "CRA", coverFrom: "Go Fig Bookz", subject: "RC59", comments: "see attached" });
    expect(p.sCoverPage).toBe("Standard");
    expect(p.sCPToName).toBe("CRA");
    expect(p.sCPSubject).toBe("RC59");
    expect(p.sCPComments).toBe("see attached");
  });
});

describe("SRFax response parsing", () => {
  it("reads a success + reference id", () => {
    expect(parseSrFaxResponse({ Status: "Success", Result: "12345" })).toEqual({ ok: true, reference: "12345" });
  });
  it("reads a failure message", () => {
    expect(parseSrFaxResponse({ Status: "Failed", Result: "Invalid fax number" })).toEqual({ ok: false, error: "Invalid fax number" });
  });
  it("is defensive against an empty body", () => {
    expect(parseSrFaxResponse(null).ok).toBe(false);
  });
});
