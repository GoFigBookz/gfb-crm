import { describe, it, expect } from "vitest";
import { parseClockifyCsv, parseTimesheetCsv } from "./timesheet-file-parse";

// Clockify "Summary report" (grouped by user).
const SUMMARY = [
  "Summary report",
  "2025-12-01 - 2025-12-15",
  "User,Time (h),Time (decimal),Amount (USD)",
  "Ryan Gunn,40:00:00,40.00,0.00",
  "Kelly Saunders,37:30:00,37.50,0.00",
  "Total,77:30:00,77.50,0.00",
].join("\n");

// Clockify "Detailed report" (one row per time entry).
const DETAILED = [
  "Project,Client,Description,User,Email,Billable,Start Date,Duration (h),Duration (decimal),Billable Amount (USD)",
  "Motion Invest,,Edits,Ryan Gunn,ryan@x.com,No,2025-12-01,08:00:00,8.00,0",
  "Motion Invest,,Edits,Ryan Gunn,ryan@x.com,No,2025-12-02,07:30:00,7.50,0",
  "Motion Invest,,Support,Kelly Saunders,kelly@x.com,No,2025-12-02,04:30:00,4.50,0",
].join("\n");

describe("parseClockifyCsv", () => {
  it("sums each user's hours from a Summary report (decimal column preferred)", () => {
    const rows = parseClockifyCsv(SUMMARY);
    const ryan = rows.find((r) => r.userName === "Ryan Gunn");
    const kelly = rows.find((r) => r.userName === "Kelly Saunders");
    expect(ryan?.hours).toBe(40);
    expect(kelly?.hours).toBe(37.5);
    expect(rows.find((r) => r.userName.toLowerCase() === "total")).toBeUndefined();
  });

  it("totals per user across a Detailed report and tracks the longest entry", () => {
    const rows = parseClockifyCsv(DETAILED);
    const ryan = rows.find((r) => r.userName === "Ryan Gunn");
    expect(ryan?.hours).toBe(15.5);        // 8.00 + 7.50
    expect(ryan?.maxShiftHours).toBe(8);   // longest single entry
    expect(rows.find((r) => r.userName === "Kelly Saunders")?.hours).toBe(4.5);
  });

  it("parseTimesheetCsv auto-routes a Clockify export to the Clockify reader", () => {
    expect(parseTimesheetCsv(DETAILED).find((r) => r.userName === "Ryan Gunn")?.hours).toBe(15.5);
  });

  it("falls back to HH:MM:SS when no decimal column exists", () => {
    const noDecimal = "User,Duration (h)\nRyan Gunn,01:30:00\nRyan Gunn,00:45:00";
    expect(parseClockifyCsv(noDecimal).find((r) => r.userName === "Ryan Gunn")?.hours).toBe(2.25);
  });
});
