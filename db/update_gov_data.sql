-- Government Data Update for GFB CRM
-- Generated from Markie's transaction priority tracker (RepID YY7F3GN)

BEGIN TRANSACTION;

-- 12738988 Canada Inc
UPDATE clients SET taxId = '781088661', fiscalYearEnd = 'Dec' WHERE name LIKE '%12738988 CANADA INC.%' OR company LIKE '%12738988 CANADA INC.%' OR email LIKE '%12738988 canada inc.%';
-- Onboarding data for 12738988 Canada Inc
INSERT OR REPLACE INTO client_onboarding (clientId, token, businessLegalName, craBusinessNumber, hstGstFrequency, payrollFrequency, hasEmployees, wsibRequired, wsibAccountNumber, primaryContactName, status, createdAt, updatedAt)
SELECT id, 'gov-data-import', '12738988 CANADA INC.', '781088661', 'annual', 'none', 0, 0, '', 'Markie', 'approved', strftime('%s','now'), strftime('%s','now') FROM clients WHERE name LIKE '%12738988 CANADA INC.%' OR company LIKE '%12738988 CANADA INC.%';

-- Columbus Cafe'
UPDATE clients SET taxId = '758960231' WHERE name LIKE '%COLUMBUS CAFE%' OR company LIKE '%COLUMBUS CAFE%' OR email LIKE '%columbus cafe%';
-- Onboarding data for Columbus Cafe'
INSERT OR REPLACE INTO client_onboarding (clientId, token, businessLegalName, craBusinessNumber, hstGstFrequency, payrollFrequency, hasEmployees, wsibRequired, wsibAccountNumber, primaryContactName, status, createdAt, updatedAt)
SELECT id, 'gov-data-import', 'COLUMBUS CAFE', '758960231', 'quarterly', 'none', 0, 0, '', 'Brad', 'approved', strftime('%s','now'), strftime('%s','now') FROM clients WHERE name LIKE '%COLUMBUS CAFE%' OR company LIKE '%COLUMBUS CAFE%';

-- Align by Design
UPDATE clients SET taxId = '707477733', fiscalYearEnd = 'Oct' WHERE name LIKE '%ALIGN BY DESIGN HD INC.%' OR company LIKE '%ALIGN BY DESIGN HD INC.%' OR email LIKE '%align by design hd inc.%';
-- Onboarding data for Align by Design
INSERT OR REPLACE INTO client_onboarding (clientId, token, businessLegalName, craBusinessNumber, hstGstFrequency, payrollFrequency, hasEmployees, wsibRequired, wsibAccountNumber, primaryContactName, status, createdAt, updatedAt)
SELECT id, 'gov-data-import', 'ALIGN BY DESIGN HD INC.', '707477733', 'quarterly', 'monthly', 1, 0, '', 'Amy', 'approved', strftime('%s','now'), strftime('%s','now') FROM clients WHERE name LIKE '%ALIGN BY DESIGN HD INC.%' OR company LIKE '%ALIGN BY DESIGN HD INC.%';

-- Ovita Construction
UPDATE clients SET taxId = '752504498', fiscalYearEnd = 'Nov' WHERE name LIKE '%OVITA CONSTRUCTION LTD.%' OR company LIKE '%OVITA CONSTRUCTION LTD.%' OR email LIKE '%ovita construction ltd.%';
-- Onboarding data for Ovita Construction
INSERT OR REPLACE INTO client_onboarding (clientId, token, businessLegalName, craBusinessNumber, hstGstFrequency, payrollFrequency, hasEmployees, wsibRequired, wsibAccountNumber, primaryContactName, status, createdAt, updatedAt)
SELECT id, 'gov-data-import', 'OVITA CONSTRUCTION LTD.', '752504498', 'quarterly', 'none', 0, 0, '', 'Rocco', 'approved', strftime('%s','now'), strftime('%s','now') FROM clients WHERE name LIKE '%OVITA CONSTRUCTION LTD.%' OR company LIKE '%OVITA CONSTRUCTION LTD.%';

-- Ovita Holdings Inc.
UPDATE clients SET taxId = '722717121', fiscalYearEnd = 'Dec' WHERE name LIKE '%OVITA HOLDINGS INC.%' OR company LIKE '%OVITA HOLDINGS INC.%' OR email LIKE '%ovita holdings inc.%';
-- Onboarding data for Ovita Holdings Inc.
INSERT OR REPLACE INTO client_onboarding (clientId, token, businessLegalName, craBusinessNumber, hstGstFrequency, payrollFrequency, hasEmployees, wsibRequired, wsibAccountNumber, primaryContactName, status, createdAt, updatedAt)
SELECT id, 'gov-data-import', 'OVITA HOLDINGS INC.', '722717121', 'quarterly', 'none', 0, 0, '', 'Rocco', 'approved', strftime('%s','now'), strftime('%s','now') FROM clients WHERE name LIKE '%OVITA HOLDINGS INC.%' OR company LIKE '%OVITA HOLDINGS INC.%';

-- Darkhorse
UPDATE clients SET taxId = '750383671', fiscalYearEnd = 'Dec' WHERE name LIKE '%DARK HORSE INTELLIGENCE INC.%' OR company LIKE '%DARK HORSE INTELLIGENCE INC.%' OR email LIKE '%dark horse intelligence inc.%';
-- Onboarding data for Darkhorse
INSERT OR REPLACE INTO client_onboarding (clientId, token, businessLegalName, craBusinessNumber, hstGstFrequency, payrollFrequency, hasEmployees, wsibRequired, wsibAccountNumber, primaryContactName, status, createdAt, updatedAt)
SELECT id, 'gov-data-import', 'DARK HORSE INTELLIGENCE INC.', '750383671', 'annual', 'monthly', 1, 1, '0', 'Brad', 'approved', strftime('%s','now'), strftime('%s','now') FROM clients WHERE name LIKE '%DARK HORSE INTELLIGENCE INC.%' OR company LIKE '%DARK HORSE INTELLIGENCE INC.%';

-- GoToMarket Agility Inc
UPDATE clients SET taxId = '817061252' WHERE name LIKE '%GOTOMARKET AGILITY INC.%' OR company LIKE '%GOTOMARKET AGILITY INC.%' OR email LIKE '%gotomarket agility inc.%';
-- Onboarding data for GoToMarket Agility Inc
INSERT OR REPLACE INTO client_onboarding (clientId, token, businessLegalName, craBusinessNumber, hstGstFrequency, payrollFrequency, hasEmployees, wsibRequired, wsibAccountNumber, primaryContactName, status, createdAt, updatedAt)
SELECT id, 'gov-data-import', 'GOTOMARKET AGILITY INC.', '817061252', 'none', 'none', 0, 0, '', 'Brad', 'approved', strftime('%s','now'), strftime('%s','now') FROM clients WHERE name LIKE '%GOTOMARKET AGILITY INC.%' OR company LIKE '%GOTOMARKET AGILITY INC.%';

-- Aim Contruction Inc
UPDATE clients SET taxId = '807649798', fiscalYearEnd = 'Dec' WHERE name LIKE '%AIM CONSTRUCTION INC.%' OR company LIKE '%AIM CONSTRUCTION INC.%' OR email LIKE '%aim construction inc.%';
-- Onboarding data for Aim Contruction Inc
INSERT OR REPLACE INTO client_onboarding (clientId, token, businessLegalName, craBusinessNumber, hstGstFrequency, payrollFrequency, hasEmployees, wsibRequired, wsibAccountNumber, primaryContactName, status, createdAt, updatedAt)
SELECT id, 'gov-data-import', 'AIM CONSTRUCTION INC.', '807649798', 'annual', 'none', 0, 0, '', 'Dan', 'approved', strftime('%s','now'), strftime('%s','now') FROM clients WHERE name LIKE '%AIM CONSTRUCTION INC.%' OR company LIKE '%AIM CONSTRUCTION INC.%';

-- Selective Painting
UPDATE clients SET taxId = '784617565', fiscalYearEnd = 'Dec' WHERE name LIKE '%SELECTIVE PAINTING%' OR company LIKE '%SELECTIVE PAINTING%' OR email LIKE '%selective painting%';
-- Onboarding data for Selective Painting
INSERT OR REPLACE INTO client_onboarding (clientId, token, businessLegalName, craBusinessNumber, hstGstFrequency, payrollFrequency, hasEmployees, wsibRequired, wsibAccountNumber, primaryContactName, status, createdAt, updatedAt)
SELECT id, 'gov-data-import', 'SELECTIVE PAINTING', '784617565', 'annual', 'none', 0, 0, '', 'Gianluca', 'approved', strftime('%s','now'), strftime('%s','now') FROM clients WHERE name LIKE '%SELECTIVE PAINTING%' OR company LIKE '%SELECTIVE PAINTING%';

-- Fleming
UPDATE clients SET taxId = '803271337', fiscalYearEnd = 'Dec' WHERE name LIKE '%FLEMING ADVISORY INC.%' OR company LIKE '%FLEMING ADVISORY INC.%' OR email LIKE '%fleming advisory inc.%';
-- Onboarding data for Fleming
INSERT OR REPLACE INTO client_onboarding (clientId, token, businessLegalName, craBusinessNumber, hstGstFrequency, payrollFrequency, hasEmployees, wsibRequired, wsibAccountNumber, primaryContactName, status, createdAt, updatedAt)
SELECT id, 'gov-data-import', 'FLEMING ADVISORY INC.', '803271337', 'annual', 'none', 0, 0, '', 'John', 'approved', strftime('%s','now'), strftime('%s','now') FROM clients WHERE name LIKE '%FLEMING ADVISORY INC.%' OR company LIKE '%FLEMING ADVISORY INC.%';

-- Originality.AI
UPDATE clients SET taxId = '786440610', fiscalYearEnd = 'Sept' WHERE name LIKE '%ORIGINALITY.AI INC.%' OR company LIKE '%ORIGINALITY.AI INC.%' OR email LIKE '%originality.ai inc.%';
-- Onboarding data for Originality.AI
INSERT OR REPLACE INTO client_onboarding (clientId, token, businessLegalName, craBusinessNumber, hstGstFrequency, payrollFrequency, hasEmployees, wsibRequired, wsibAccountNumber, primaryContactName, status, createdAt, updatedAt)
SELECT id, 'gov-data-import', 'ORIGINALITY.AI INC.', '786440610', 'quarterly', 'monthly', 1, 0, '', 'Jon', 'approved', strftime('%s','now'), strftime('%s','now') FROM clients WHERE name LIKE '%ORIGINALITY.AI INC.%' OR company LIKE '%ORIGINALITY.AI INC.%';

-- Clark Pools Collingwood
UPDATE clients SET taxId = '770298602', fiscalYearEnd = 'Sept' WHERE name LIKE '%CLARK POOLS COLLINGWOOD%' OR company LIKE '%CLARK POOLS COLLINGWOOD%' OR email LIKE '%clark pools collingwood%';
-- Onboarding data for Clark Pools Collingwood
INSERT OR REPLACE INTO client_onboarding (clientId, token, businessLegalName, craBusinessNumber, hstGstFrequency, payrollFrequency, hasEmployees, wsibRequired, wsibAccountNumber, primaryContactName, status, createdAt, updatedAt)
SELECT id, 'gov-data-import', 'CLARK POOLS COLLINGWOOD', '770298602', 'quarterly', 'weekly', 1, 1, '8989514', 'Jon', 'approved', strftime('%s','now'), strftime('%s','now') FROM clients WHERE name LIKE '%CLARK POOLS COLLINGWOOD%' OR company LIKE '%CLARK POOLS COLLINGWOOD%';

-- West York Paving
UPDATE clients SET taxId = '877933515', fiscalYearEnd = 'Dec' WHERE name LIKE '%WEST YORK PAVING LTD.%' OR company LIKE '%WEST YORK PAVING LTD.%' OR email LIKE '%west york paving ltd.%';
-- Onboarding data for West York Paving
INSERT OR REPLACE INTO client_onboarding (clientId, token, businessLegalName, craBusinessNumber, hstGstFrequency, payrollFrequency, hasEmployees, wsibRequired, wsibAccountNumber, primaryContactName, status, createdAt, updatedAt)
SELECT id, 'gov-data-import', 'WEST YORK PAVING LTD.', '877933515', 'quarterly', 'weekly', 1, 1, '9594388', 'Joe & Frank', 'approved', strftime('%s','now'), strftime('%s','now') FROM clients WHERE name LIKE '%WEST YORK PAVING LTD.%' OR company LIKE '%WEST YORK PAVING LTD.%';

-- The Auld Spot Pub
UPDATE clients SET taxId = '718843600', fiscalYearEnd = 'Sept' WHERE name LIKE '%THE AULD SPOT PUB%' OR company LIKE '%THE AULD SPOT PUB%' OR email LIKE '%the auld spot pub%';
-- Onboarding data for The Auld Spot Pub
INSERT OR REPLACE INTO client_onboarding (clientId, token, businessLegalName, craBusinessNumber, hstGstFrequency, payrollFrequency, hasEmployees, wsibRequired, wsibAccountNumber, primaryContactName, status, createdAt, updatedAt)
SELECT id, 'gov-data-import', 'THE AULD SPOT PUB', '718843600', 'quarterly', 'weekly', 1, 1, '9536896', 'Jaspal', 'approved', strftime('%s','now'), strftime('%s','now') FROM clients WHERE name LIKE '%THE AULD SPOT PUB%' OR company LIKE '%THE AULD SPOT PUB%';

-- King Industries Inc.
UPDATE clients SET taxId = '858977705', fiscalYearEnd = 'Dec' WHERE name LIKE '%KING INDUSTRIES INC.%' OR company LIKE '%KING INDUSTRIES INC.%' OR email LIKE '%king industries inc.%';
-- Onboarding data for King Industries Inc.
INSERT OR REPLACE INTO client_onboarding (clientId, token, businessLegalName, craBusinessNumber, hstGstFrequency, payrollFrequency, hasEmployees, wsibRequired, wsibAccountNumber, primaryContactName, status, createdAt, updatedAt)
SELECT id, 'gov-data-import', 'KING INDUSTRIES INC.', '858977705', 'quarterly', 'none', 0, 0, '', 'Brad', 'approved', strftime('%s','now'), strftime('%s','now') FROM clients WHERE name LIKE '%KING INDUSTRIES INC.%' OR company LIKE '%KING INDUSTRIES INC.%';

-- Studio Lella
UPDATE clients SET taxId = '792026429', fiscalYearEnd = 'Dec' WHERE name LIKE '%STUDIO LELLA INC.%' OR company LIKE '%STUDIO LELLA INC.%' OR email LIKE '%studio lella inc.%';
-- Onboarding data for Studio Lella
INSERT OR REPLACE INTO client_onboarding (clientId, token, businessLegalName, craBusinessNumber, hstGstFrequency, payrollFrequency, hasEmployees, wsibRequired, wsibAccountNumber, primaryContactName, status, createdAt, updatedAt)
SELECT id, 'gov-data-import', 'STUDIO LELLA INC.', '792026429', 'quarterly', 'self_only', 1, 0, '', 'Anthony', 'approved', strftime('%s','now'), strftime('%s','now') FROM clients WHERE name LIKE '%STUDIO LELLA INC.%' OR company LIKE '%STUDIO LELLA INC.%';

-- Laing Scientific
UPDATE clients SET taxId = '127437374', fiscalYearEnd = 'Dec' WHERE name LIKE '%LAING SCIENTIFIC%' OR company LIKE '%LAING SCIENTIFIC%' OR email LIKE '%laing scientific%';
-- Onboarding data for Laing Scientific
INSERT OR REPLACE INTO client_onboarding (clientId, token, businessLegalName, craBusinessNumber, hstGstFrequency, payrollFrequency, hasEmployees, wsibRequired, wsibAccountNumber, primaryContactName, status, createdAt, updatedAt)
SELECT id, 'gov-data-import', 'LAING SCIENTIFIC', '127437374', 'quarterly', 'none', 0, 0, '', 'Dave', 'approved', strftime('%s','now'), strftime('%s','now') FROM clients WHERE name LIKE '%LAING SCIENTIFIC%' OR company LIKE '%LAING SCIENTIFIC%';

-- Align Plumbing
UPDATE clients SET taxId = '789978301', fiscalYearEnd = 'July' WHERE name LIKE '%ALIGN PLUMBING INC.%' OR company LIKE '%ALIGN PLUMBING INC.%' OR email LIKE '%align plumbing inc.%';
-- Onboarding data for Align Plumbing
INSERT OR REPLACE INTO client_onboarding (clientId, token, businessLegalName, craBusinessNumber, hstGstFrequency, payrollFrequency, hasEmployees, wsibRequired, wsibAccountNumber, primaryContactName, status, createdAt, updatedAt)
SELECT id, 'gov-data-import', 'ALIGN PLUMBING INC.', '789978301', 'annual', 'monthly', 1, 0, '', 'Adam', 'approved', strftime('%s','now'), strftime('%s','now') FROM clients WHERE name LIKE '%ALIGN PLUMBING INC.%' OR company LIKE '%ALIGN PLUMBING INC.%';

-- 2303851 Ontario Inc.
UPDATE clients SET taxId = '847759909', fiscalYearEnd = 'Sept' WHERE name LIKE '%2303851 ONTARIO INC.%' OR company LIKE '%2303851 ONTARIO INC.%' OR email LIKE '%2303851 ontario inc.%';
-- Onboarding data for 2303851 Ontario Inc.
INSERT OR REPLACE INTO client_onboarding (clientId, token, businessLegalName, craBusinessNumber, hstGstFrequency, payrollFrequency, hasEmployees, wsibRequired, wsibAccountNumber, primaryContactName, status, createdAt, updatedAt)
SELECT id, 'gov-data-import', '2303851 ONTARIO INC.', '847759909', 'annual', 'monthly', 1, 0, '', 'Jon', 'approved', strftime('%s','now'), strftime('%s','now') FROM clients WHERE name LIKE '%2303851 ONTARIO INC.%' OR company LIKE '%2303851 ONTARIO INC.%';

-- Clark Pools OwenSound
UPDATE clients SET taxId = '715666566', fiscalYearEnd = 'Sept' WHERE name LIKE '%CLARK POOLS OWEN SOUND%' OR company LIKE '%CLARK POOLS OWEN SOUND%' OR email LIKE '%clark pools owen sound%';
-- Onboarding data for Clark Pools OwenSound
INSERT OR REPLACE INTO client_onboarding (clientId, token, businessLegalName, craBusinessNumber, hstGstFrequency, payrollFrequency, hasEmployees, wsibRequired, wsibAccountNumber, primaryContactName, status, createdAt, updatedAt)
SELECT id, 'gov-data-import', 'CLARK POOLS OWEN SOUND', '715666566', 'annual', 'weekly', 1, 1, '1815646', 'Jon', 'approved', strftime('%s','now'), strftime('%s','now') FROM clients WHERE name LIKE '%CLARK POOLS OWEN SOUND%' OR company LIKE '%CLARK POOLS OWEN SOUND%';

-- Motion Invest
UPDATE clients SET taxId = '728898321', fiscalYearEnd = 'Sept' WHERE name LIKE '%MOTION INVEST INC.%' OR company LIKE '%MOTION INVEST INC.%' OR email LIKE '%motion invest inc.%';
-- Onboarding data for Motion Invest
INSERT OR REPLACE INTO client_onboarding (clientId, token, businessLegalName, craBusinessNumber, hstGstFrequency, payrollFrequency, hasEmployees, wsibRequired, wsibAccountNumber, primaryContactName, status, createdAt, updatedAt)
SELECT id, 'gov-data-import', 'MOTION INVEST INC.', '728898321', 'annual', 'none', 0, 0, '', 'Jon', 'approved', strftime('%s','now'), strftime('%s','now') FROM clients WHERE name LIKE '%MOTION INVEST INC.%' OR company LIKE '%MOTION INVEST INC.%';

-- Fractal Saas
UPDATE clients SET taxId = '739247070', fiscalYearEnd = 'Sept' WHERE name LIKE '%FRACTAL SAAS INC.%' OR company LIKE '%FRACTAL SAAS INC.%' OR email LIKE '%fractal saas inc.%';
-- Onboarding data for Fractal Saas
INSERT OR REPLACE INTO client_onboarding (clientId, token, businessLegalName, craBusinessNumber, hstGstFrequency, payrollFrequency, hasEmployees, wsibRequired, wsibAccountNumber, primaryContactName, status, createdAt, updatedAt)
SELECT id, 'gov-data-import', 'FRACTAL SAAS INC.', '739247070', 'annual', 'monthly', 1, 0, '', 'Jon', 'approved', strftime('%s','now'), strftime('%s','now') FROM clients WHERE name LIKE '%FRACTAL SAAS INC.%' OR company LIKE '%FRACTAL SAAS INC.%';

-- Adbank Inc.
UPDATE clients SET taxId = '793523481', fiscalYearEnd = 'Sept' WHERE name LIKE '%ADBANK INC.%' OR company LIKE '%ADBANK INC.%' OR email LIKE '%adbank inc.%';
-- Onboarding data for Adbank Inc.
INSERT OR REPLACE INTO client_onboarding (clientId, token, businessLegalName, craBusinessNumber, hstGstFrequency, payrollFrequency, hasEmployees, wsibRequired, wsibAccountNumber, primaryContactName, status, createdAt, updatedAt)
SELECT id, 'gov-data-import', 'ADBANK INC.', '793523481', 'annual', 'monthly', 1, 0, '', 'Jon', 'approved', strftime('%s','now'), strftime('%s','now') FROM clients WHERE name LIKE '%ADBANK INC.%' OR company LIKE '%ADBANK INC.%';

-- Listing Eagle
UPDATE clients SET taxId = '767302490', fiscalYearEnd = 'Sept' WHERE name LIKE '%LISTINGEAGLE.COM INC.%' OR company LIKE '%LISTINGEAGLE.COM INC.%' OR email LIKE '%listingeagle.com inc.%';
-- Onboarding data for Listing Eagle
INSERT OR REPLACE INTO client_onboarding (clientId, token, businessLegalName, craBusinessNumber, hstGstFrequency, payrollFrequency, hasEmployees, wsibRequired, wsibAccountNumber, primaryContactName, status, createdAt, updatedAt)
SELECT id, 'gov-data-import', 'LISTINGEAGLE.COM INC.', '767302490', 'annual', 'none', 0, 0, '', 'Jon', 'approved', strftime('%s','now'), strftime('%s','now') FROM clients WHERE name LIKE '%LISTINGEAGLE.COM INC.%' OR company LIKE '%LISTINGEAGLE.COM INC.%';

-- Marketing Stategy Ventures
UPDATE clients SET taxId = '763289337', fiscalYearEnd = 'Sept' WHERE name LIKE '%MARKETING STRATEGY VENTURES INC.%' OR company LIKE '%MARKETING STRATEGY VENTURES INC.%' OR email LIKE '%marketing strategy ventures inc.%';
-- Onboarding data for Marketing Stategy Ventures
INSERT OR REPLACE INTO client_onboarding (clientId, token, businessLegalName, craBusinessNumber, hstGstFrequency, payrollFrequency, hasEmployees, wsibRequired, wsibAccountNumber, primaryContactName, status, createdAt, updatedAt)
SELECT id, 'gov-data-import', 'MARKETING STRATEGY VENTURES INC.', '763289337', 'annual', 'none', 0, 0, '', 'Jon', 'approved', strftime('%s','now'), strftime('%s','now') FROM clients WHERE name LIKE '%MARKETING STRATEGY VENTURES INC.%' OR company LIKE '%MARKETING STRATEGY VENTURES INC.%';

-- Seahorse Health
UPDATE clients SET taxId = '728509522', fiscalYearEnd = 'Sept' WHERE name LIKE '%SEAHORSE HEALTH INC.%' OR company LIKE '%SEAHORSE HEALTH INC.%' OR email LIKE '%seahorse health inc.%';
-- Onboarding data for Seahorse Health
INSERT OR REPLACE INTO client_onboarding (clientId, token, businessLegalName, craBusinessNumber, hstGstFrequency, payrollFrequency, hasEmployees, wsibRequired, wsibAccountNumber, primaryContactName, status, createdAt, updatedAt)
SELECT id, 'gov-data-import', 'SEAHORSE HEALTH INC.', '728509522', 'annual', 'none', 0, 1, '1305797', 'Jon', 'approved', strftime('%s','now'), strftime('%s','now') FROM clients WHERE name LIKE '%SEAHORSE HEALTH INC.%' OR company LIKE '%SEAHORSE HEALTH INC.%';

-- Sher-E-Punjab
UPDATE clients SET taxId = '706313020' WHERE name LIKE '%SHER-E-PUNJAB%' OR company LIKE '%SHER-E-PUNJAB%' OR email LIKE '%sher-e-punjab%';
-- Onboarding data for Sher-E-Punjab
INSERT OR REPLACE INTO client_onboarding (clientId, token, businessLegalName, craBusinessNumber, hstGstFrequency, payrollFrequency, hasEmployees, wsibRequired, wsibAccountNumber, primaryContactName, status, createdAt, updatedAt)
SELECT id, 'gov-data-import', 'SHER-E-PUNJAB', '706313020', 'annual', 'none', 0, 0, '', 'Jaspal', 'approved', strftime('%s','now'), strftime('%s','now') FROM clients WHERE name LIKE '%SHER-E-PUNJAB%' OR company LIKE '%SHER-E-PUNJAB%';

-- Unimax
UPDATE clients SET fiscalYearEnd = 'Dec' WHERE name LIKE '%UNIMAX LTD.%' OR company LIKE '%UNIMAX LTD.%' OR email LIKE '%unimax ltd.%';
-- Onboarding data for Unimax
INSERT OR REPLACE INTO client_onboarding (clientId, token, businessLegalName, craBusinessNumber, hstGstFrequency, payrollFrequency, hasEmployees, wsibRequired, wsibAccountNumber, primaryContactName, status, createdAt, updatedAt)
SELECT id, 'gov-data-import', 'UNIMAX LTD.', '', 'none', 'none', 0, 0, '', 'Andrew/Michael/Frederico', 'approved', strftime('%s','now'), strftime('%s','now') FROM clients WHERE name LIKE '%UNIMAX LTD.%' OR company LIKE '%UNIMAX LTD.%';

-- M.M. Kapala
UPDATE clients SET taxId = '827463951', fiscalYearEnd = 'Jun' WHERE name LIKE '%M.M. KAPALA MEDICINE PROF. CORP.%' OR company LIKE '%M.M. KAPALA MEDICINE PROF. CORP.%' OR email LIKE '%m.m. kapala medicine prof. corp.%';
-- Onboarding data for M.M. Kapala
INSERT OR REPLACE INTO client_onboarding (clientId, token, businessLegalName, craBusinessNumber, hstGstFrequency, payrollFrequency, hasEmployees, wsibRequired, wsibAccountNumber, primaryContactName, status, createdAt, updatedAt)
SELECT id, 'gov-data-import', 'M.M. KAPALA MEDICINE PROF. CORP.', '827463951', 'none', 'none', 0, 0, '', 'Marriana', 'approved', strftime('%s','now'), strftime('%s','now') FROM clients WHERE name LIKE '%M.M. KAPALA MEDICINE PROF. CORP.%' OR company LIKE '%M.M. KAPALA MEDICINE PROF. CORP.%';

-- Alderson
UPDATE clients SET taxId = '774355168', fiscalYearEnd = 'Nov' WHERE name LIKE '%ALDERSON DEVELOPMENTS LTD.%' OR company LIKE '%ALDERSON DEVELOPMENTS LTD.%' OR email LIKE '%alderson developments ltd.%';
-- Onboarding data for Alderson
INSERT OR REPLACE INTO client_onboarding (clientId, token, businessLegalName, craBusinessNumber, hstGstFrequency, payrollFrequency, hasEmployees, wsibRequired, wsibAccountNumber, primaryContactName, status, createdAt, updatedAt)
SELECT id, 'gov-data-import', 'ALDERSON DEVELOPMENTS LTD.', '774355168', 'quarterly', 'none', 0, 0, '', 'Rocco', 'approved', strftime('%s','now'), strftime('%s','now') FROM clients WHERE name LIKE '%ALDERSON DEVELOPMENTS LTD.%' OR company LIKE '%ALDERSON DEVELOPMENTS LTD.%';

-- UCG1
UPDATE clients SET taxId = '778849547' WHERE name LIKE '%UNIVERSAL CONSTRUCTION GROUP%' OR company LIKE '%UNIVERSAL CONSTRUCTION GROUP%' OR email LIKE '%universal construction group%';
-- Onboarding data for UCG1
INSERT OR REPLACE INTO client_onboarding (clientId, token, businessLegalName, craBusinessNumber, hstGstFrequency, payrollFrequency, hasEmployees, wsibRequired, wsibAccountNumber, primaryContactName, status, createdAt, updatedAt)
SELECT id, 'gov-data-import', 'UNIVERSAL CONSTRUCTION GROUP', '778849547', 'none', 'none', 0, 0, '', '', 'approved', strftime('%s','now'), strftime('%s','now') FROM clients WHERE name LIKE '%UNIVERSAL CONSTRUCTION GROUP%' OR company LIKE '%UNIVERSAL CONSTRUCTION GROUP%';

COMMIT;