// AUTO-EXTRACTED from client payroll sheets. (Placeholder until the extractor
// populates real rosters; overwritten by the extraction pass.)
export type SeedEmployee = {
  firstName: string; lastName?: string;
  payType?: "salary" | "hourly" | "commission" | "contract";
  hourlyRate?: number; annualSalary?: number;
  position?: string; email?: string; notes?: string;
};
export type SeedClientRoster = { clientMatch: string; sourceFileId?: string; employees: SeedEmployee[] };

export const PAYROLL_EMPLOYEE_SEED: SeedClientRoster[] = [];
