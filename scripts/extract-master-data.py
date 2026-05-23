import openpyxl
import json

wb = openpyxl.load_workbook('/root/.openclaw/workspace/downloads/GFB_Client_Master_Government_Data_R2_CLEAN.xlsx')
ws = wb.active

clients = []

# Row 3 is headers
# Data starts at row 4
for row in ws.iter_rows(min_row=4, values_only=True):
    name = str(row[0]).strip() if row[0] else None
    if not name or name.startswith('Client / Legal Name'):
        continue
    
    # Parse HST frequency
    hst_freq_raw = str(row[21]).strip() if row[21] else ""
    hst_map = {
        'Qrtly': 'quarterly', 'Qrtly-Aug': 'quarterly', 'Qrtly-Nov': 'quarterly', 'Qrtly-Feb': 'quarterly', 'Qrtly-May': 'quarterly',
        'Monthly': 'monthly',
        'Annual-Sep': 'annually', 'Annual-Dec': 'annually',
        'Y': 'quarterly',  # default if just says Y
        'N': 'none',
        'None': 'none',
    }
    hst_freq = hst_map.get(hst_freq_raw, 'quarterly' if hst_freq_raw else 'none')
    
    # Parse payroll frequency
    payroll_freq_raw = str(row[19]).strip() if row[19] else ""
    payroll_map = {
        'Weekly': 'weekly', 'Bi-Weekly': 'biweekly', 'Bi-weekly': 'biweekly',
        'Monthly': 'monthly', 'Semi-Monthly': 'semi_monthly',
        'Y': 'biweekly',  # default
        'N': 'none',
        'None': 'none',
    }
    payroll_freq = payroll_map.get(payroll_freq_raw, 'biweekly' if payroll_freq_raw else 'none')
    
    # Parse WSIB
    wsib_raw = str(row[22]).strip() if row[22] else ""
    wsib_required = wsib_raw.upper() == 'Y' or wsib_raw.upper() == 'YES'
    
    # Parse HST flag
    hst_raw = str(row[20]).strip() if row[20] else ""
    has_hst = hst_raw.upper() == 'Y' or hst_raw.upper() == 'YES'
    
    # Parse payroll flag
    has_payroll = str(row[18]).strip().upper() == 'Y' if row[18] else False
    
    # Extract HST number from business number if present
    cra_bn = str(row[4]).strip() if row[4] else None
    hst_number = None
    if cra_bn and len(cra_bn) == 9:
        hst_number = cra_bn + "RT0001"
    
    client = {
        "name": name,
        "businessNumber": cra_bn,
        "hstGstNumber": hst_number,
        "hstGstFrequency": hst_freq if has_hst else "none",
        "payrollAccountNumber": None,
        "payrollFrequency": payroll_freq if has_payroll else "none",
        "fiscalYearEnd": "December 31",
        "wsibAccountNumber": None,
        "wsibRequired": wsib_required,
        "hasEmployees": has_payroll,
        "hasSubcontractors": False,
        "hasInvestments": False,
        "bankAccountCount": 1,
        "creditCardCount": 0,
        "needsYearEnd": True,
        "monthlyFee": float(row[27]) if row[27] and str(row[27]).replace('.','').isdigit() else None,
        "annualFee": float(row[26]) if row[26] and str(row[26]).replace('.','').isdigit() else None,
        "industry": str(row[2]).strip() if row[2] else "other",
        "contactName": str(row[14]).strip() if row[14] else None,
        "phone": str(row[11]).strip() if row[11] else None,
        "email": str(row[12]).strip() if row[12] else None,
        "address": str(row[10]).strip() if row[10] else None,
        "notes": str(row[16]).strip() if row[16] else None,
    }
    clients.append(client)

print(json.dumps(clients, indent=2))
print(f"\nTotal clients extracted: {len(clients)}", file=__import__('sys').stderr)
