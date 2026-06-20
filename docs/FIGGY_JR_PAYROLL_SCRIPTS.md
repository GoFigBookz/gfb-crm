# Figgy Jr — Payroll Google Apps Scripts & Sheets (investigation, 2026-06-20)

Read-only investigation of the two payroll Google Sheets and any Apps Script
attached. **Nothing was changed.** Source code below was retrieved in full
(decoded from the Apps Script project's JSON export) — it is the actual script,
not inference. The Selective Painting calc is documented from the sheet's
visible values (its formulas are not exposed by the Drive content API; the
derived rates below are clearly marked).

---

## 1. West York Paving — "Email Weekly Paystubs" automation

### Files / IDs
- **Payroll sheet:** `West York Paving Payroll` — `1_G0YDO0A0zH3oiQDYtmMnTp7GLSvhQoaezAcRD76yGA`
  (mimeType spreadsheet, owner markie@gofig.ca, parent folder
  `10FgSl5ctYkgxIaAa2-eTir7xOquQ7Xzj`). NOTE: the sheet itself is essentially
  empty (read returned no cell data) — it is **not** the data source for the
  email. The script reads PDFs from a Drive folder, not from this sheet.
- **Bound/standalone Apps Script project:** `West York Paving Email Paystubs` —
  **`1TWJuB0tBKg_N6bagtszsaX-ey_HvNa5W9OBPsR58ijVw9FHOVsBCdgBW`**
  (mimeType `application/vnd.google-apps.script`, owner markie@gofig.ca,
  modified 2026-06-10). Runtime V8, timezone `America/New_York`. **Full source
  retrieved.**

### Folder IDs used by the script
- **Source folder (where new paystub PDFs are dropped):**
  `12Lh_HwFI2e25Dv8SqjaHAkmqX4czIpwj` (commented "THE CORRECT SOURCE FOLDER").
- **Archive folder:** `10FgSl5ctYkgxIaAa2-eTir7xOquQ7Xzj`
  (this is the SAME folder that holds the `West York Paving Payroll` sheet and
  all the historical paystub PDFs — confirmed: `Jun 12th, 2026 Paystubs.pdf`,
  `Jun 5th, 2026 Paystubs.pdf`, `Payday May 29, 2026.pdf`, etc. all live here).
  - IMPORTANT: the task brief called `10FgSl5...` the "drop folder," but the
    script actually uses it as the **archive/destination**. The true drop/source
    folder is `12Lh_HwFI2e25Dv8SqjaHAkmqX4czIpwj`.

### Email recipients & logic
- **Recipients (hard-coded):** `baronedina16@gmail.com, joeyorkwest@gmail.com`
- Subject: `Weekly Paystubs`
- Body (verbatim): greets "Hello Joe and Dina," then "I have attached the pay
  stubs for this coming Friday. Please review them and let me know if you have
  any questions or require any adjustments." Signed "Markie".
- The email is sent **only if at least one file** is found in the source folder
  (`if attachments.length > 0`); otherwise it logs "No files found... No email
  was sent."

### What it does (function by function)
**`sendWeeklyPaystubs()`** — the worker:
1. Opens source folder `12Lh_HwFI2e25Dv8SqjaHAkmqX4czIpwj` and archive folder
   `10FgSl5ctYkgxIaAa2-eTir7xOquQ7Xzj`.
2. Iterates **every file** in the source folder, pushing each one's blob into an
   `attachments` array, and **moves each file to the archive folder** (so it is
   not re-sent next week — `file.moveTo(archiveFolder)`).
3. If any attachments were gathered, sends ONE email via `MailApp.sendEmail`
   to the two recipients with all files attached; logs success or "no files."
- It does **not** generate or build the paystubs — it assumes the paystub PDFs
  have already been produced (by QBO payroll, exported by Markie) and placed in
  the source folder. The script is purely a "collect → email → archive" relay.

**`createWednesdayTrigger()`** — one-time installer:
- Deletes any existing time-based trigger for `sendWeeklyPaystubs`, then creates
  a new weekly trigger: **every week, on WEDNESDAY, at hour 13 (1:00 PM,
  America/New_York)** → runs `sendWeeklyPaystubs`. Logs confirmation.
- Cadence rationale: paystubs for "this coming Friday" are emailed Wednesday 1pm.

### Verbatim script source
```javascript
function sendWeeklyPaystubs() {
  // 1. YOUR GOOGLE FOLDER IDs
  var sourceFolderId = '12Lh_HwFI2e25Dv8SqjaHAkmqX4czIpwj'; // THE CORRECT SOURCE FOLDER
  var archiveFolderId = '10FgSl5ctYkgxIaAa2-eTir7xOquQ7Xzj'; // YOUR ARCHIVE FOLDER

  // 2. THE CLIENT EMAILS
  var clientEmails = 'baronedina16@gmail.com, joeyorkwest@gmail.com';

  var folder = DriveApp.getFolderById(sourceFolderId);
  var archiveFolder = DriveApp.getFolderById(archiveFolderId);
  var files = folder.getFiles();

  var attachments = [];

  // Gather all files in the folder
  while (files.hasNext()) {
    var file = files.next();
    attachments.push(file.getBlob());

    // Move the file to archive so it doesn't send again next week
    file.moveTo(archiveFolder);
  }

  // If there are files, send the email
  if (attachments.length > 0) {
    MailApp.sendEmail({
      to: clientEmails,
      subject: 'Weekly Paystubs',
      body: 'Hello Joe and Dina,\n\nI hope you are having a great week.\n\nI have attached the pay stubs for this coming Friday. Please review them and let me know if you have any questions or require any adjustments.\n\nThank you,\nMarkie',
      attachments: attachments
    });
    Logger.log('Email sent successfully to ' + clientEmails);
  } else {
    Logger.log('No files found in the folder. No email was sent.');
  }
}

function createWednesdayTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sendWeeklyPaystubs') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger('sendWeeklyPaystubs')
           .timeBased()
           .everyWeeks(1)
           .onWeekDay(ScriptApp.WeekDay.WEDNESDAY)
           .atHour(13)
           .create();

  Logger.log('Success! Your automated trigger is officially set for Wednesdays at 1:00 PM.');
}
```

### Employees (from archived paystub PDFs, West York Paving Ltd., 13815 Hwy 27,
Nobleton ON, weekly salary; for CRM context only)
- Calogero Barone — $1,720.92/wk salary, net $1,268.32
- Carmela Barone — $675.00/wk, net $572.32
- Dina Barone — $1,186.92/wk, net $931.66
- Frank Barone — $1,250.00/wk, net $988.73
(Source: `Jun 12th, 2026 Paystubs.pdf` `1TkCX7FSfsO8UKaWDi24773SO-OQoIJhw`, et al.)

---

## 2. Selective Painting — payroll calc sheet (NO script)

### Files / IDs
- **Payroll sheet:** `Selective Painting Payroll` —
  **`1sYhf5Jy4rW8rqZO61xMjuZFFMVodagQkKCKhm8928sE`** (spreadsheet, owner
  markie@gofig.ca, parent `0AK4nByVmw075Uk9PVA`).
- **Bound script:** **NONE FOUND.** A Drive-wide search for
  `mimeType = application/vnd.google-apps.script` and for titles containing
  "Selective"/"Painting" returned no Apps Script project for this client. The
  client-info doc (`1D8ZwwFm6s3WuBdQwx2gnP7Ag10cPYYcFrbG0JKKCJpg`) explicitly
  records **"Payroll Processing: N/A"** for Selective Painting. This sheet is a
  manual monthly payroll/remittance tracker, not an automation.
  - Caveat: the Drive content API does not expose container-bound script source
    for a Sheet, so a tiny bound script can't be 100% ruled out — but no
    standalone project exists and the client is marked payroll N/A, so the calc
    is in-sheet formulas only.

### Sheet structure (employee: Allesandro Le Marco)
Columns: `Month | Net Pay | Gross Pay | CPP Employee | EI Employee |
Income Tax Employee | Employer CPP | Employer EI | CRA Remittance`

Tax Parameters block on the sheet:
- **CPP Rate = 5.95%**
- **EI Rate = 1.66%**
- **Est. Tax Rate = 15.00%**

### Actual data rows (visible values)
| Month | Net Pay | Gross Pay | CPP Emp | EI Emp | Inc Tax Emp | Empl CPP | Empl EI | CRA Remit |
|---|---|---|---|---|---|---|---|---|
| Jan | 2,300.00 | 2,971.96 | 176.83 | 49.33 | 445.79 | 176.83 | 69.07 | 917.86 |
| Feb | 6,000.00 | 7,752.94 | 461.30 | 128.70 | 1,162.94 | 461.30 | 180.18 | 2,394.42 |
| Mar | 9,000.00 | 11,629.41 | 691.95 | 193.05 | 1,744.41 | 691.95 | 270.27 | 3,591.63 |
(YTD Net Pay total cell = $17,300.00.)

### Reverse-engineered formulas (INFERENCE — verified against the numbers above)
The sheet stores **Net Pay** as the input; Gross and deductions are derived. The
relationships that reproduce all three rows exactly:

- **Gross Pay** = Net Pay grossed up so that, after the three employee
  deductions, Net remains. Solving the rows:
  `Gross = NetPay / (1 − CPP% − EI% − Tax%)` = `NetPay / (1 − 0.0595 − 0.0166 − 0.15)`
  = `NetPay / 0.7739`.
  - Check Jan: 2300 / 0.7739 = 2,971.96 ✓ ; Feb: 6000 / 0.7739 = 7,752.94 ✓ ;
    Mar: 9000 / 0.7739 = 11,629.41 ✓
- **CPP Employee** = `Gross × 5.95%`  (Jan 2971.96×0.0595 = 176.83 ✓)
- **EI Employee** = `Gross × 1.66%`   (Jan 2971.96×0.0166 = 49.33 ✓)
- **Income Tax Employee** = `Gross × 15.00%` (Jan 2971.96×0.15 = 445.79 ✓)
- **Employer CPP** = `= CPP Employee` (1.0× match — Jan 176.83 = 176.83 ✓)
- **Employer EI** = `Employer's EI = EI Employee × 1.4` (CRA employer multiplier)
  (Jan 49.33×1.4 = 69.06≈69.07 ✓ ; Feb 128.70×1.4 = 180.18 ✓ ; Mar 193.05×1.4 = 270.27 ✓)
- **CRA Remittance** = sum of all source deductions remitted =
  `CPP Emp + Employer CPP + EI Emp + Employer EI + Income Tax Emp`
  (Jan: 176.83+176.83+49.33+69.07+445.79 = 917.85≈917.86 ✓ ;
   Mar: 691.95+691.95+193.05+270.27+1744.41 = 3,591.63 ✓)

### CRM replication summary (Selective Painting monthly payroll)
Given monthly **Net Pay** N and rates CPP=5.95%, EI=1.66%, Tax=15%:
```
Gross        = N / (1 - 0.0595 - 0.0166 - 0.15)   # = N / 0.7739
CPP_emp      = Gross * 0.0595
EI_emp       = Gross * 0.0166
Tax_emp      = Gross * 0.15
CPP_employer = CPP_emp                  # 1.0x
EI_employer  = EI_emp * 1.4             # CRA 1.4x employer EI
CRA_remit    = CPP_emp + CPP_employer + EI_emp + EI_employer + Tax_emp
```
These are simplified estimates (flat 15% tax, no CPP basic exemption, no EI
maximum-insurable cap) — fine for an internal estimate sheet, but the CRM should
flag that it is NOT a CRA-accurate payroll engine.

---

## Net takeaways
- West York Paving has a real, working Apps Script automation (project
  `1TWJuB0tBKg_...`): every Wednesday 1pm it emails whatever PDFs sit in source
  folder `12Lh_HwFI2e25Dv8SqjaHAkmqX4czIpwj` to Joe + Dina, then archives them
  to `10FgSl5ctYkgxIaAa2-eTir7xOquQ7Xzj`. It does not build paystubs.
- Selective Painting has **no script** — it's a manual monthly estimator using
  CPP 5.95% / EI 1.66% / Tax 15%, with a gross-up formula and CRA remittance
  rollup, reproducible in the CRM exactly as above. Client is payroll = N/A.
