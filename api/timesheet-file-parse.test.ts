import { describe, it, expect } from "vitest";
import { parseTimesheetCsv } from "./timesheet-file-parse";

// Real TouchBistro "Timesheet Details" column layout (one row per shift).
const HEADER =
  '"Staff Name","Staff Type","Date","Clock-In","Clock-Out","Shift Length (hrs)","Reg. Rate of Pay","Total(Reg. Hrs)","Unpaid Break(Reg. Hrs)","Payable(Reg. Hrs)","Payout Period (OT Hours)","Total(OT1 Hrs)","Unpaid Break(OT1 Hrs)","Payable(OT1 Hrs)","Total(OT2 Hrs)","Unpaid Break(OT2 Hrs)","Payable(OT2 Hrs)","Reg. Pay","Payout Period OT Pay","OT1 Pay","OT2 Pay","Spread of Hours","Spread of Hours Pay","Gross Pay"';

function row(name: string, type: string, shift: number, payable: number, ot1 = 0): string {
  // positions: name,type,date,in,out,shift,rate,totReg,unpaidReg,payableReg,otPeriod,totOT1,unpaidOT1,payableOT1,...
  return `"${name}","${type}","Jun 1, 2026","9:00 AM","5:00 PM","${shift}","18.00","${payable}","0","${payable}","0","0","0","${ot1}","0","0","0","0","0","0","0","0","0","0"`;
}

describe("parseTimesheetCsv (TouchBistro detailed)", () => {
  const csv = [
    HEADER,
    row("Dahal, Akash", "Server", 5.0, 5.0),
    row("Dahal, Akash", "Server", 11.0, 10.5),          // long shift → missed-clock-out flag
    row("Smith, Joe", "Kitchen Staff", 8.0, 8.0),
    row("Smith, Joe", "Kitchen Staff", 4.0, 4.0, 1.5),  // + 1.5 payable OT
    row("Admin, Admin", "Admin", 3.0, 0),               // owner/admin → excluded
    '"REPORT SUMMARY (5 entries)","","","","","31.00","","31.00","0","31.00","0","0","0","1.5","0","0","0","0","0","0","0","0","0","0"',
  ].join("\n");

  const rows = parseTimesheetCsv(csv);
  const by = (n: string) => rows.find((r) => r.userName === n);

  it("excludes Admin and REPORT SUMMARY rows", () => {
    expect(by("Admin, Admin")).toBeUndefined();
    expect(rows.find((r) => r.userName.startsWith("REPORT SUMMARY"))).toBeUndefined();
    expect(rows.length).toBe(2);
  });

  it("sums payable regular + OT hours per employee", () => {
    expect(by("Dahal, Akash")!.hours).toBe(15.5);   // 5.0 + 10.5
    expect(by("Smith, Joe")!.hours).toBe(13.5);      // 8.0 + 4.0 + 1.5 OT
  });

  it("tracks the longest single shift (for the >10h missed-clock-out flag)", () => {
    expect(by("Dahal, Akash")!.maxShiftHours).toBe(11.0);
    expect(by("Smith, Joe")!.maxShiftHours).toBe(8.0);
  });
});
