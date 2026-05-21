-- GFB Active Clients Import — Clean v3
-- 30 CA clients + 2 US clients = 32 total
-- Generated May 2026

BEGIN TRANSACTION;

DELETE FROM client_onboarding;
DELETE FROM clients;

-- ========== GO FIG BOOKZ CA (30 clients) ==========

INSERT INTO clients (name,company,email,phone,address,industry,workflowStatus,website,figgyEmail,notes,contactName,province,qboAccountType,createdAt,updatedAt) VALUES ('ORIGINALITY.AI INC.','Originality.AI','support@originality.ai',NULL,'64 Hurontario St, Suite 200, Collingwood, ON L9Y 2L6','technology','active','originality.ai','markie+originalityaiinc@gofig.ca','AI content detection platform. Founded 2022. Jon Gillham group — 2303851 Ontario is primary payer.','Jon Gillham','ON','ca_clients',1778866324,1778866324);

INSERT INTO clients (name,company,email,phone,address,industry,workflowStatus,website,figgyEmail,notes,contactName,province,qboAccountType,createdAt,updatedAt) VALUES ('CLARK POOLS AND SPAS COLLINGWOOD INC.','Clark Pools Collingwood','office@clarkpoolscollingwood.com','(705) 445-6165','20 Balsam St, Collingwood, ON L9Y 4H7','other','active','clarkpoolscollingwood.com','markie+clarkpoolsandspascollingwoodinc@gofig.ca','Pool and spa service. South Georgian Bay. Biweekly payroll. Jon Gillham group.','Jon Gillham','ON','ca_clients',1778866324,1778866324);

INSERT INTO clients (name,company,email,phone,address,industry,workflowStatus,website,figgyEmail,notes,contactName,province,qboAccountType,createdAt,updatedAt) VALUES ('CLARK POOLS AND SPAS OWEN SOUND INC.','Clark Pools Owen Sound','info@clarkpools.com','(519) 372-9411','718028 Hwy 6, Owen Sound, ON N4K 5N7','other','active','clarkpools.com','markie+clarkpoolsandspasowensoundinc@gofig.ca','Pool and spa. Owen Sound and Grey Bruce County. Jon Gillham group.','Jon Gillham','ON','ca_clients',1778866324,1778866324);

INSERT INTO clients (name,company,email,phone,address,industry,workflowStatus,website,figgyEmail,notes,contactName,province,qboAccountType,createdAt,updatedAt) VALUES ('WEST YORK PAVING LTD.','West York Paving',NULL,'(416) 231-6394','200 Rexdale Blvd, Etobicoke, ON M9W 1R2','construction','active','westyorkpaving.com','markie+westyorkpavingltd@gofig.ca','Large paving company, GTA. Barone family. WEEKLY payroll. Not tech-savvy — handle carefully.','Joe & Frank Barone','ON','ca_clients',1778866324,1778866324);

INSERT INTO clients (name,company,email,phone,address,industry,workflowStatus,website,figgyEmail,notes,contactName,province,qboAccountType,createdAt,updatedAt) VALUES ('1000235299 ONTARIO LTD.','The Auld Spot Pub',NULL,'(416) 461-1114','347 Danforth Ave, Toronto, ON M4K 1N7','restaurant','active','auldspotpub.ca','markie+1000235299ontarioltd@gofig.ca','Scottish pub, Danforth since 1975. Uses Square POS.','Nathan Hynes','ON','ca_clients',1778866324,1778866324);

INSERT INTO clients (name,company,email,phone,address,industry,workflowStatus,website,figgyEmail,notes,contactName,province,qboAccountType,createdAt,updatedAt) VALUES ('1001196626 ONTARIO LTD.','Sher-E-Punjab',NULL,'(416) 465-2125','351 Danforth Ave, Toronto, ON M4K 1N7','restaurant','active','sher-e-punjab.ca','markie+1001196626ontarioltd@gofig.ca','Indian fine dining, Danforth since 1975.','Jaspal','ON','ca_clients',1778866324,1778866324);

INSERT INTO clients (name,company,email,phone,address,industry,workflowStatus,website,figgyEmail,notes,contactName,province,qboAccountType,createdAt,updatedAt) VALUES ('KING INDUSTRIES INC.','King Industries',NULL,'(877) 289-3625','29 Nobel Rd, McDougall, ON P2A 2W9','manufacturing','active','kingindustries.com','markie+kingindustriesinc@gofig.ca','Specialty chemical additives. Also operates Dock Kings division.','Brad','ON','ca_clients',1778866324,1778866324);

INSERT INTO clients (name,company,email,phone,address,industry,workflowStatus,website,figgyEmail,notes,contactName,province,qboAccountType,createdAt,updatedAt) VALUES ('OVITA CONSTRUCTION LTD.','Ovita Construction',NULL,'(905) 851-7744','6260 Highway 7, Unit 7, Vaughan, ON L4H 4G3','construction','active','ovitaconstruction.com','markie+ovitaconstructionltd@gofig.ca','Building restoration and high-rise construction. Related to Ovita Holdings.','Rocco','ON','ca_clients',1778866324,1778866324);

INSERT INTO clients (name,company,email,phone,address,industry,workflowStatus,website,figgyEmail,notes,contactName,province,qboAccountType,createdAt,updatedAt) VALUES ('OVITA HOLDINGS INC.','Ovita Holdings',NULL,NULL,'Vaughan, ON','holding_company','active',NULL,'markie+ovitaholdingsinc@gofig.ca','Holding company for Ovita Construction. Interco transactions with Ovita Construction.','Rocco','ON','ca_clients',1778866324,1778866324);

INSERT INTO clients (name,company,email,phone,address,industry,workflowStatus,website,figgyEmail,notes,contactName,province,qboAccountType,createdAt,updatedAt) VALUES ('UNIVERSAL CONSTRUCTION GROUP INC.','Universal Construction Group','Universalconstructionyeg1605@gmail.com','(416) 722-9447','Woodbridge, ON L4H 1N6','construction','active','universalconstructionyeg.com','markie+universalconstructiongroupinc@gofig.ca','Residential and commercial construction across Ontario.','Andrew','ON','ca_clients',1778866324,1778866324);

INSERT INTO clients (name,company,email,phone,address,industry,workflowStatus,website,figgyEmail,notes,contactName,province,qboAccountType,createdAt,updatedAt) VALUES ('ALIGN BY DESIGN HD INC.','Align By Design','hello@alignanddesign.ca','(647) 200-3501','Toronto, ON','professional_services','active','alignanddesign.ca','markie+alignbydesignhdinc@gofig.ca','Professional organizing and interior styling.','Amy','ON','ca_clients',1778866324,1778866324);

INSERT INTO clients (name,company,email,phone,address,industry,workflowStatus,website,figgyEmail,notes,contactName,province,qboAccountType,createdAt,updatedAt) VALUES ('GOTOMARKET AGILITY INC.','GoToMarket Agility',NULL,NULL,'Toronto, ON','professional_services','active','gotomarketsolutions.ca','markie+gotomarketagilityinc@gofig.ca','Strategic consulting. Fractional CCO services.','Brad','ON','ca_clients',1778866324,1778866324);

INSERT INTO clients (name,company,email,phone,address,industry,workflowStatus,website,figgyEmail,notes,contactName,province,qboAccountType,createdAt,updatedAt) VALUES ('ADBANK INC.','Adbank','hello@adbank.network',NULL,'Collingwood, ON L9Y 1A1','technology','active','adbank.network','markie+adbankinc@gofig.ca','Digital advertising technology. Uses PayPal. Jon Gillham group.','Jon Gillham','ON','ca_clients',1778866324,1778866324);

INSERT INTO clients (name,company,email,phone,address,industry,workflowStatus,website,figgyEmail,notes,contactName,province,qboAccountType,createdAt,updatedAt) VALUES ('MOTION INVEST INC.','Motion Invest','contact@motioninvest.com',NULL,'1 First Street, Collingwood, ON L9Y 1A1','technology','active','motioninvest.com','markie+motioninvestinc@gofig.ca','Website and YouTube channel marketplace. Jon Gillham group. Markie processes seller payments.','Jon Gillham','ON','ca_clients',1778866324,1778866324);

INSERT INTO clients (name,company,email,phone,address,industry,workflowStatus,website,figgyEmail,notes,contactName,province,qboAccountType,createdAt,updatedAt) VALUES ('FRACTAL SAAS INC.','Fractal SaaS','andrew@passed.ai',NULL,'64 Hurontario St, Suite 200, Collingwood, ON L9Y 2L6','technology','active','fractal.ai','markie+fractalsaasinc@gofig.ca','SaaS technology. Uses Stripe. Jon Gillham group.','Jon Gillham','ON','ca_clients',1778866324,1778866324);

INSERT INTO clients (name,company,email,phone,address,industry,workflowStatus,website,figgyEmail,notes,contactName,province,qboAccountType,createdAt,updatedAt) VALUES ('LISTINGEAGLE.COM INC.','ListingEagle',NULL,NULL,'Ontario, Canada','technology','active',NULL,'markie+listingeaglecominc@gofig.ca','Digital solutions. Jon Gillham group.','Jon Gillham','ON','ca_clients',1778866324,1778866324);

INSERT INTO clients (name,company,email,phone,address,industry,workflowStatus,website,figgyEmail,notes,contactName,province,qboAccountType,createdAt,updatedAt) VALUES ('MARKETING STRATEGY VENTURES INC.','Marketing Strategy Ventures',NULL,NULL,'Ontario, Canada','professional_services','active',NULL,'markie+marketingstrategyventuresinc@gofig.ca','Marketing consulting. Uses Stripe and PayPal. Jon Gillham group.','Jon Gillham','ON','ca_clients',1778866324,1778866324);

INSERT INTO clients (name,company,email,phone,address,industry,workflowStatus,website,figgyEmail,notes,contactName,province,qboAccountType,createdAt,updatedAt) VALUES ('SEAHORSE HEALTH INC.','Seahorse Health',NULL,NULL,'Ontario, Canada','healthcare','active',NULL,'markie+seahorsehealthinc@gofig.ca','Healthcare business. Jon Gillham group.','Jon Gillham','ON','ca_clients',1778866324,1778866324);

INSERT INTO clients (name,company,email,phone,address,industry,workflowStatus,website,figgyEmail,notes,contactName,province,qboAccountType,createdAt,updatedAt) VALUES ('M.M. KAPALA MEDICINE PROFESSIONAL CORPORATION','M.M. Kapala Medicine',NULL,NULL,'Ontario, Canada','healthcare','active',NULL,'markie+mmkapalamedicine@gofig.ca','Medical professional corporation.','Marriana','ON','ca_clients',1778866324,1778866324);

INSERT INTO clients (name,company,email,phone,address,industry,workflowStatus,website,figgyEmail,notes,contactName,province,qboAccountType,createdAt,updatedAt) VALUES ('ALDERSON DEVELOPMENTS LTD.','Alderson Developments',NULL,'(905) 934-1372','St Catharines, ON','construction','active','aldersonconsulting.ca','markie+aldersondevelopmentsltd@gofig.ca','Real estate development.','Rocco','ON','ca_clients',1778866324,1778866324);

INSERT INTO clients (name,company,email,phone,address,industry,workflowStatus,website,figgyEmail,notes,contactName,province,qboAccountType,createdAt,updatedAt) VALUES ('2303851 ONTARIO INC.','2303851 Ontario',NULL,NULL,'Ontario, Canada','holding_company','active',NULL,'markie+2303851ontarioinc@gofig.ca','PRIMARY PAYER for Jon Gillham group. Uses Stripe and PayPal. All interco transactions flow through here.','Jon Gillham','ON','ca_clients',1778866324,1778866324);

INSERT INTO clients (name,company,email,phone,address,industry,workflowStatus,website,figgyEmail,notes,contactName,province,qboAccountType,createdAt,updatedAt) VALUES ('STUDIO LELLA INC.','Studio Lella','studiolellainc@gmail.com','(905) 893-5550','110 Nashville Rd, Unit 10, Kleinburg, ON L0J 1C0','personal_services','active','studiolella.ca','markie+studiolellainc@gofig.ca','Hair styling studio, Kleinburg.','Anthony','ON','ca_clients',1778866324,1778866324);

INSERT INTO clients (name,company,email,phone,address,industry,workflowStatus,website,figgyEmail,notes,contactName,province,qboAccountType,createdAt,updatedAt) VALUES ('DARK HORSE INTELLIGENCE INC.','Dark Horse Intelligence',NULL,'1-800-261-1832','Ontario, Canada','technology','active','darkhorsevisualization.com','markie+darkhorseintelligenceinc@gofig.ca','Data visualization and analytics. Monthly payroll.','Daniel Haight','ON','ca_clients',1778866324,1778866324);

INSERT INTO clients (name,company,email,phone,address,industry,workflowStatus,website,figgyEmail,notes,contactName,province,qboAccountType,createdAt,updatedAt) VALUES ('12738988 CANADA INC.','12738988 Canada',NULL,NULL,'30 Esther Lorrie Drive, Etobicoke, ON','other','active',NULL,'markie+12738988canadainc@gofig.ca','Federal corporation. Private entity.','','ON','ca_clients',1778866324,1778866324);

INSERT INTO clients (name,company,email,phone,address,industry,workflowStatus,website,figgyEmail,notes,contactName,province,qboAccountType,createdAt,updatedAt) VALUES ('1001411380 ONTARIO INC.','Columbus Cafe','info@columbuscafe.co','(905) 956-9501','220 Yonge St, Toronto, ON M5B 2H1','restaurant','active','columbuscafe.ca','markie+columbuscafe@gofig.ca','European cafe chain. Multiple Ontario locations.','','ON','ca_clients',1778866324,1778866324);

INSERT INTO clients (name,company,email,phone,address,industry,workflowStatus,website,figgyEmail,notes,contactName,province,qboAccountType,createdAt,updatedAt) VALUES ('ALIGN PLUMBING INC.','Align Plumbing',NULL,'(519) 595-8843','6414 Road 140, Milverton, ON N0K 1M0','construction','active','alignplumbing.ca','markie+alignplumbinginc@gofig.ca','Professional plumbing services.','Adam','ON','ca_clients',1778866324,1778866324);

INSERT INTO clients (name,company,email,phone,address,industry,workflowStatus,website,figgyEmail,notes,contactName,province,qboAccountType,createdAt,updatedAt) VALUES ('AIM CONSTRUCTION INC.','Aim Construction',NULL,'(519) 747-2255','Cambridge, ON','construction','active','aimbuilders.ca','markie+aimconstructioninc@gofig.ca','Residential and commercial construction.','Dan','ON','ca_clients',1778866324,1778866324);

INSERT INTO clients (name,company,email,phone,address,industry,workflowStatus,website,figgyEmail,notes,contactName,province,qboAccountType,createdAt,updatedAt) VALUES ('SELECTIVE PAINTING','Selective Painting','gianluca@selectivepainting.ca','(647) 407-0972','25 Bella Vista Ct, Woodbridge, ON L4L 7P5','construction','active','selectivepainting.ca','markie+selectivepainting@gofig.ca','GTA residential and commercial painters.','Gianluca','ON','ca_clients',1778866324,1778866324);

INSERT INTO clients (name,company,email,phone,address,industry,workflowStatus,website,figgyEmail,notes,contactName,province,qboAccountType,createdAt,updatedAt) VALUES ('LAING SCIENTIFIC','Laing Scientific',NULL,NULL,'2405 Lake Shore Blvd W, Etobicoke, ON M8V 1C6','other','active',NULL,'markie+laingscientific@gofig.ca','Scientific equipment. Microscopes and balances.','Dave','ON','ca_clients',1778866324,1778866324);

INSERT INTO clients (name,company,email,phone,address,industry,workflowStatus,website,figgyEmail,notes,contactName,province,qboAccountType,createdAt,updatedAt) VALUES ('FLEMING ADVISORY INC.','Fleming Advisory',NULL,NULL,'Ontario, Canada','technology','active',NULL,'markie+flemingadvisory@gofig.ca','Technology and advisory. Formerly Kaavio.','John','ON','ca_clients',1778866324,1778866324);

-- ========== GO FIG BOOKZ US (2 clients) ==========

INSERT INTO clients (name,company,email,phone,address,industry,workflowStatus,website,figgyEmail,notes,contactName,province,qboAccountType,createdAt,updatedAt) VALUES ('UNIVERSAL DRYWALL','Universal Drywall',NULL,'(403) 635-0887','Florida, USA','construction','active','universaldrywall.com','markie+universaldrywall@gofig.ca','Drywall and construction. Florida USA entity.','Michael','FL','us_clients',1778866324,1778866324);

INSERT INTO clients (name,company,email,phone,address,industry,workflowStatus,website,figgyEmail,notes,contactName,province,qboAccountType,createdAt,updatedAt) VALUES ('UNIMAX LTD.','Unimax','reception@unimax-int.com','(416) 818-5288','Florida, USA','import_export','active','unimax.ca','markie+unimax@gofig.ca','International import/export. Tire distribution. Florida USA operations.','Andrew/Michael/Frederico','FL','us_clients',1778866324,1778866324);

COMMIT;

-- Total: 30 CA + 2 US = 32 clients
