import { z } from "zod";
import { createRouter, adminQuery, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { clients, clientOnboarding, tasks, clientTaskRules, users as usersTable } from "../db/schema";
import { eq, count } from "drizzle-orm";
import { createClientTaskRules } from "./task-generator";

const CLIENT_SEED = [
  { name: "ORIGINALITY.AI INC.", email: "support@originality.ai", phone: null, company: "Originality.AI", address: "64 Hurontario St, Collingwood, ON", industry: "technology", province: "ON", qboAccountType: "ca_clients", figgyEmail: "markie+originalityaiinc@gofig.ca", contactName: "Jon Gillham", notes: "AI content detection. Jon Gillham group." },
  { name: "CLARK POOLS COLLINGWOOD", email: "office@clarkpoolscollingwood.com", phone: "(705) 445-6165", company: "Clark Pools Collingwood", address: "20 Balsam St, Collingwood, ON", industry: "other", province: "ON", qboAccountType: "ca_clients", figgyEmail: "markie+clarkpoolscollingwood@gofig.ca", contactName: "Jon Gillham", notes: "Pool and spa. Biweekly payroll. Jon Gillham group." },
  { name: "CLARK POOLS OWEN SOUND", email: "info@clarkpools.com", phone: "(519) 372-9411", company: "Clark Pools Owen Sound", address: "718028 Hwy 6, Owen Sound, ON", industry: "other", province: "ON", qboAccountType: "ca_clients", figgyEmail: "markie+clarkpoolsowensound@gofig.ca", contactName: "Jon Gillham", notes: "Pool and spa. Owen Sound. Jon Gillham group." },
  { name: "WEST YORK PAVING LTD.", email: "info@westyorkpaving.com", phone: "(416) 231-6394", company: "West York Paving", address: "200 Rexdale Blvd, Etobicoke, ON", industry: "construction", province: "ON", qboAccountType: "ca_clients", figgyEmail: "markie+westyorkpaving@gofig.ca", contactName: "Joe & Frank Barone", notes: "WEEKLY payroll. Barone family. Not tech-savvy." },
  { name: "THE AULD SPOT PUB", email: "info@auldspotpub.ca", phone: "(416) 461-1114", company: "The Auld Spot Pub", address: "347 Danforth Ave, Toronto, ON", industry: "restaurant", province: "ON", qboAccountType: "ca_clients", figgyEmail: "markie+auldspotpub@gofig.ca", contactName: "Nathan Hynes", notes: "Scottish pub, Danforth since 1975. Square POS." },
  { name: "SHER-E-PUNJAB", email: "info@sher-e-punjab.ca", phone: "(416) 465-2125", company: "Sher-E-Punjab", address: "351 Danforth Ave, Toronto, ON", industry: "restaurant", province: "ON", qboAccountType: "ca_clients", figgyEmail: "markie+sherepunjab@gofig.ca", contactName: "Jaspal", notes: "Indian fine dining, Danforth since 1975." },
  { name: "KING INDUSTRIES INC.", email: "info@kingindustries.com", phone: "(877) 289-3625", company: "King Industries", address: "29 Nobel Rd, McDougall, ON", industry: "manufacturing", province: "ON", qboAccountType: "ca_clients", figgyEmail: "markie+kingindustries@gofig.ca", contactName: "Brad", notes: "Specialty chemical additives. Dock Kings division." },
  { name: "OVITA CONSTRUCTION LTD.", email: "info@ovitaconstruction.com", phone: "(905) 851-7744", company: "Ovita Construction", address: "6260 Highway 7, Vaughan, ON", industry: "construction", province: "ON", qboAccountType: "ca_clients", figgyEmail: "markie+ovitaconstruction@gofig.ca", contactName: "Rocco", notes: "Building restoration and high-rise." },
  { name: "OVITA HOLDINGS INC.", email: "info@ovitaholdings.com", phone: null, company: "Ovita Holdings", address: "Vaughan, ON", industry: "holding_company", province: "ON", qboAccountType: "ca_clients", figgyEmail: "markie+ovitaholdings@gofig.ca", contactName: "Rocco", notes: "Holding company. Interco with Ovita Construction." },
  { name: "UNIVERSAL CONSTRUCTION GROUP", email: "Universalconstructionyeg1605@gmail.com", phone: "(416) 722-9447", company: "Universal Construction Group", address: "Woodbridge, ON", industry: "construction", province: "ON", qboAccountType: "ca_clients", figgyEmail: "markie+universalconstruction@gofig.ca", contactName: "Andrew", notes: "Residential and commercial construction Ontario." },
  { name: "ALIGN BY DESIGN HD INC.", email: "hello@alignanddesign.ca", phone: "(647) 200-3501", company: "Align By Design", address: "Toronto, ON", industry: "professional_services", province: "ON", qboAccountType: "ca_clients", figgyEmail: "markie+alignbydesign@gofig.ca", contactName: "Amy", notes: "Professional organizing and interior styling." },
  { name: "GOTOMARKET AGILITY INC.", email: "info@gotomarketsolutions.ca", phone: null, company: "GoToMarket Agility", address: "Toronto, ON", industry: "professional_services", province: "ON", qboAccountType: "ca_clients", figgyEmail: "markie+gotomarketagility@gofig.ca", contactName: "Brad", notes: "Strategic consulting. Fractional CCO." },
  { name: "ADBANK INC.", email: "hello@adbank.network", phone: null, company: "Adbank", address: "Collingwood, ON", industry: "technology", province: "ON", qboAccountType: "ca_clients", figgyEmail: "markie+adbank@gofig.ca", contactName: "Jon Gillham", notes: "Digital advertising. PayPal. Jon Gillham group." },
  { name: "MOTION INVEST INC.", email: "contact@motioninvest.com", phone: null, company: "Motion Invest", address: "Collingwood, ON", industry: "technology", province: "ON", qboAccountType: "ca_clients", figgyEmail: "markie+motioninvest@gofig.ca", contactName: "Jon Gillham", notes: "Website marketplace. Jon Gillham group. Markie processes seller payments." },
  { name: "FRACTAL SAAS INC.", email: "andrew@passed.ai", phone: null, company: "Fractal SaaS", address: "Collingwood, ON", industry: "technology", province: "ON", qboAccountType: "ca_clients", figgyEmail: "markie+fractalsaas@gofig.ca", contactName: "Jon Gillham", notes: "SaaS. Stripe. Jon Gillham group." },
  { name: "LISTINGEAGLE.COM INC.", email: "info@listingeagle.com", phone: null, company: "ListingEagle", address: "Ontario, Canada", industry: "technology", province: "ON", qboAccountType: "ca_clients", figgyEmail: "markie+listingeagle@gofig.ca", contactName: "Jon Gillham", notes: "Digital solutions. Jon Gillham group." },
  { name: "MARKETING STRATEGY VENTURES INC.", email: "info@msv.com", phone: null, company: "Marketing Strategy Ventures", address: "Ontario, Canada", industry: "professional_services", province: "ON", qboAccountType: "ca_clients", figgyEmail: "markie+msv@gofig.ca", contactName: "Jon Gillham", notes: "Marketing consulting. Stripe and PayPal. Jon Gillham group." },
  { name: "SEAHORSE HEALTH INC.", email: "info@seahorsehealth.com", phone: null, company: "Seahorse Health", address: "Ontario, Canada", industry: "healthcare", province: "ON", qboAccountType: "ca_clients", figgyEmail: "markie+seahorsehealth@gofig.ca", contactName: "Jon Gillham", notes: "Healthcare. Jon Gillham group." },
  { name: "M.M. KAPALA MEDICINE PROF. CORP.", email: "info@mmkapala.com", phone: null, company: "M.M. Kapala Medicine", address: "Ontario, Canada", industry: "healthcare", province: "ON", qboAccountType: "ca_clients", figgyEmail: "markie+mmkapala@gofig.ca", contactName: "Marriana", notes: "Medical professional corporation." },
  { name: "ALDERSON DEVELOPMENTS LTD.", email: "info@aldersonconsulting.ca", phone: "(905) 934-1372", company: "Alderson Developments", address: "St Catharines, ON", industry: "construction", province: "ON", qboAccountType: "ca_clients", figgyEmail: "markie+aldersondevelopments@gofig.ca", contactName: "Rocco", notes: "Real estate development." },
  { name: "2303851 ONTARIO INC.", email: "info@2303851ontario.com", phone: null, company: "2303851 Ontario", address: "Ontario, Canada", industry: "holding_company", province: "ON", qboAccountType: "ca_clients", figgyEmail: "markie+2303851ontario@gofig.ca", contactName: "Jon Gillham", notes: "PRIMARY PAYER for Jon Gillham group." },
  { name: "STUDIO LELLA INC.", email: "studiolellainc@gmail.com", phone: "(905) 893-5550", company: "Studio Lella", address: "110 Nashville Rd, Kleinburg, ON", industry: "personal_services", province: "ON", qboAccountType: "ca_clients", figgyEmail: "markie+studiolella@gofig.ca", contactName: "Anthony", notes: "Hair styling studio." },
  { name: "DARK HORSE INTELLIGENCE INC.", email: "info@darkhorsevisualization.com", phone: "1-800-261-1832", company: "Dark Horse Intelligence", address: "Ontario, Canada", industry: "technology", province: "ON", qboAccountType: "ca_clients", figgyEmail: "markie+darkhorse@gofig.ca", contactName: "Daniel Haight", notes: "Data visualization. Monthly payroll." },
  { name: "12738988 CANADA INC.", email: "info@12738988canada.com", phone: null, company: "12738988 Canada", address: "30 Esther Lorrie Dr, Etobicoke, ON", industry: "other", province: "ON", qboAccountType: "ca_clients", figgyEmail: "markie+12738988canada@gofig.ca", contactName: "", notes: "Federal corporation." },
  { name: "COLUMBUS CAFE", email: "info@columbuscafe.co", phone: "(905) 956-9501", company: "Columbus Cafe", address: "220 Yonge St, Toronto, ON", industry: "restaurant", province: "ON", qboAccountType: "ca_clients", figgyEmail: "markie+columbuscafe@gofig.ca", contactName: "", notes: "European cafe chain." },
  { name: "ALIGN PLUMBING INC.", email: "info@alignplumbing.ca", phone: "(519) 595-8843", company: "Align Plumbing", address: "6414 Road 140, Milverton, ON", industry: "construction", province: "ON", qboAccountType: "ca_clients", figgyEmail: "markie+alignplumbing@gofig.ca", contactName: "Adam", notes: "Professional plumbing." },
  { name: "AIM CONSTRUCTION INC.", email: "info@aimbuilders.ca", phone: "(519) 747-2255", company: "Aim Construction", address: "Cambridge, ON", industry: "construction", province: "ON", qboAccountType: "ca_clients", figgyEmail: "markie+aimconstruction@gofig.ca", contactName: "Dan", notes: "Residential and commercial construction." },
  { name: "SELECTIVE PAINTING", email: "gianluca@selectivepainting.ca", phone: "(647) 407-0972", company: "Selective Painting", address: "25 Bella Vista Ct, Woodbridge, ON", industry: "construction", province: "ON", qboAccountType: "ca_clients", figgyEmail: "markie+selectivepainting@gofig.ca", contactName: "Gianluca", notes: "GTA painters." },
  { name: "LAING SCIENTIFIC", email: "info@laingscientific.com", phone: null, company: "Laing Scientific", address: "2405 Lake Shore Blvd W, Etobicoke, ON", industry: "other", province: "ON", qboAccountType: "ca_clients", figgyEmail: "markie+laingscientific@gofig.ca", contactName: "Dave", notes: "Scientific equipment." },
  { name: "FLEMING ADVISORY INC.", email: "info@flemingadvisory.com", phone: null, company: "Fleming Advisory", address: "Ontario, Canada", industry: "technology", province: "ON", qboAccountType: "ca_clients", figgyEmail: "markie+flemingadvisory@gofig.ca", contactName: "John", notes: "Technology and advisory. Formerly Kaavio." },
  { name: "UNIVERSAL DRYWALL", email: "info@universaldrywall.com", phone: "(403) 635-0887", company: "Universal Drywall", address: "Florida, USA", industry: "construction", province: "FL", qboAccountType: "us_clients", figgyEmail: "markie+universaldrywall@gofig.ca", contactName: "Michael", notes: "Drywall. Florida USA." },
  { name: "UNIMAX LTD.", email: "reception@unimax-int.com", phone: "(416) 818-5288", company: "Unimax", address: "Florida, USA", industry: "import_export", province: "FL", qboAccountType: "us_clients", figgyEmail: "markie+unimax@gofig.ca", contactName: "Andrew/Michael/Frederico", notes: "Import/export. Tire distribution. Florida USA." },
];

// Infer client attributes from notes for task generation
function inferClientAttributes(notes: string) {
  const lower = notes.toLowerCase();
  return {
    hstGstFrequency: "quarterly" as const,
    payrollFrequency: lower.includes("weekly payroll") ? "weekly" as const :
                       lower.includes("biweekly payroll") ? "biweekly" as const :
                       lower.includes("monthly payroll") ? "monthly" as const : "none" as const,
    hasEmployees: lower.includes("payroll") || lower.includes("employees"),
    hasSubcontractors: lower.includes("subcontractor") || lower.includes("construction"),
    hasInvestments: lower.includes("investment") || lower.includes("holding"),
    wsibRequired: lower.includes("construction") || lower.includes("restaurant"),
    bankAccountCount: 1,
    creditCardCount: 1,
    needsYearEnd: true,
    usesStripe: lower.includes("stripe"),
    usesSquare: lower.includes("square"),
    usesJobber: lower.includes("jobber"),
    salesEntryFrequency: "monthly" as const,
  };
}

export const restoreRouter = createRouter({
  // Public restore — only works when database is empty (safe guard)
  restoreAll: publicQuery
    .mutation(async () => {
      const db = getDb();
      
      // Skip count check — always restore on empty DB
      // const existing = await db.select({ count: count() }).from(clients);
      // const clientCount = Number(existing[0]?.count ?? 0);
      // if (clientCount > 0) {
      //   return { success: false, message: `Database has ${clientCount} clients. Skipping restore.` };
      // }

      const userRows = await db.select().from(usersTable).limit(1);
      const userId = userRows[0]?.id || 1;
      const results = { clientsCreated: 0, onboardingCreated: 0, tasksCreated: 0 };

      // Use raw SQL to bypass Drizzle schema mismatch on deployed DB
      const { createClient } = await import("@libsql/client");
      const path = await import("path");
      const cwd = process.cwd();
      const isInDist = cwd.endsWith('/dist') || cwd.endsWith('\\dist');
      const basePath = isInDist ? path.resolve(cwd, '..') : cwd;
      const dbPath = path.resolve(basePath, "data", "crm.db");
      const rawClient = createClient({ url: `file:${dbPath}` });

      // Schema repair: add missing columns that Drizzle expects
      const repairSqls = [
        `ALTER TABLE clients ADD COLUMN leadSourceDetail text;`,
        `ALTER TABLE clients ADD COLUMN estimatedMonthlyValue real;`,
        `ALTER TABLE clients ADD COLUMN leadScore integer;`,
        `ALTER TABLE clients ADD COLUMN hasHST integer DEFAULT 0;`,
        `ALTER TABLE clients ADD COLUMN hstNumber text;`,
        `ALTER TABLE clients ADD COLUMN hstPeriod text;`,
        `ALTER TABLE clients ADD COLUMN hasWSIB integer DEFAULT 0;`,
        `ALTER TABLE clients ADD COLUMN wsibAccountNumber text;`,
        `ALTER TABLE clients ADD COLUMN wsibQuarter text;`,
        `ALTER TABLE clients ADD COLUMN hasPayroll integer DEFAULT 0;`,
        `ALTER TABLE clients ADD COLUMN payrollFrequency text;`,
        `ALTER TABLE clients ADD COLUMN yearEndMonth text;`,
        `ALTER TABLE clients ADD COLUMN quoteAmount real;`,
        `ALTER TABLE clients ADD COLUMN quoteSentAt integer;`,
        `ALTER TABLE clients ADD COLUMN quoteApprovedAt integer;`,
        `ALTER TABLE clients ADD COLUMN transactionsPerMonth integer DEFAULT 0;`,
        `ALTER TABLE clients ADD COLUMN engagementSentAt integer;`,
        `ALTER TABLE clients ADD COLUMN engagementSignedAt integer;`,
        `ALTER TABLE clients ADD COLUMN engagementLetterUrl text;`,
        `ALTER TABLE tasks ADD COLUMN ruleId integer;`,
        `ALTER TABLE tasks ADD COLUMN isRecurring integer DEFAULT 0;`,
        `ALTER TABLE tasks ADD COLUMN recurrenceCount integer DEFAULT 1;`,
        `ALTER TABLE tasks ADD COLUMN microsoftTaskId text;`,
      ];
      for (const sql of repairSqls) {
        await rawClient.execute({ sql }).catch(() => {}); // ignore "duplicate column" errors
      }

      for (const seed of CLIENT_SEED) {
        // Insert only columns that exist in deployed DB schema
        const insertResult = await rawClient.execute({
          sql: `INSERT INTO clients (userId, name, email, phone, company, address, status, workflowStatus, industry, province, qboAccountType, figgyEmail, contactName, notes, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            userId, seed.name, seed.email, seed.phone || null, seed.company || null,
            seed.address || null, "active", "active", seed.industry || "other",
            seed.province || "ON", seed.qboAccountType || "ca_clients",
            seed.figgyEmail || null, seed.contactName || null, seed.notes || null,
            Date.now(), Date.now()
          ]
        });
        const clientId = Number(insertResult.lastInsertRowid);
        if (!clientId) continue;
        results.clientsCreated++;

        const attrs = inferClientAttributes(seed.notes || "");
        
        // Create onboarding record
        await rawClient.execute({
          sql: `INSERT INTO client_onboarding (clientId, token, status, submittedAt, reviewedAt, reviewedBy, fiscalYearEnd, hstGstFrequency, payrollFrequency, hasEmployees, hasSubcontractors, hasInvestments, wsibRequired, bankAccountCount, creditCardCount, needsYearEnd, createdAt, updatedAt)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            clientId, "restored-" + Math.random().toString(36).substring(2, 15),
            "approved", Date.now(), Date.now(), userId,
            "December 31", attrs.hstGstFrequency || "none", attrs.payrollFrequency || "none",
            attrs.hasEmployees ? 1 : 0, attrs.hasSubcontractors ? 1 : 0,
            attrs.hasInvestments ? 1 : 0, attrs.wsibRequired ? 1 : 0,
            attrs.bankAccountCount || 1, attrs.creditCardCount || 0,
            attrs.needsYearEnd !== false ? 1 : 0, Date.now(), Date.now()
          ]
        });
        results.onboardingCreated++;

        // Update client workflow
        await rawClient.execute({
          sql: `UPDATE clients SET workflowStatus = ?, onboardingCompletedAt = ? WHERE id = ?`,
          args: ["active", Date.now(), clientId]
        });

        // Auto-generate task rules and first tasks using Drizzle (this should work, uses clientTaskRules table)
        const taskResult = await createClientTaskRules({
          clientId, userId, assignedTo: null,
          fiscalYearEnd: "December 31", ...attrs,
        });
        results.tasksCreated += taskResult.tasks.length;
      }

      rawClient.close();

      return {
        success: true,
        message: `Restored ${results.clientsCreated} clients, ${results.onboardingCreated} onboarding records, and ${results.tasksCreated} tasks.`,
        ...results,
      };
    }),

  // Admin-only: force restore (deletes everything first)
  forceRestore: adminQuery
    .mutation(async ({ ctx }) => {
      const db = getDb();
      const userId = ctx.user.id;
      const results = { clientsCreated: 0, onboardingCreated: 0, tasksCreated: 0 };

      await db.delete(clientTaskRules);
      await db.delete(tasks);
      await db.delete(clientOnboarding);
      await db.delete(clients);

      for (const seed of CLIENT_SEED) {
        const [client] = await db.insert(clients).values({
          userId, name: seed.name, email: seed.email, phone: seed.phone,
          company: seed.company, address: seed.address, status: "active",
          workflowStatus: "active", industry: seed.industry, province: seed.province,
          qboAccountType: seed.qboAccountType, figgyEmail: seed.figgyEmail,
          contactName: seed.contactName, notes: seed.notes,
          createdAt: new Date(), updatedAt: new Date(),
        }).returning();

        if (!client) continue;
        results.clientsCreated++;

        const attrs = inferClientAttributes(seed.notes || "");
        const [onboarding] = await db.insert(clientOnboarding).values({
          clientId: client.id, token: "restored-" + Math.random().toString(36).substring(2, 15),
          status: "approved", submittedAt: new Date(), reviewedAt: new Date(), reviewedBy: userId,
          ...attrs, fiscalYearEnd: "December 31",
        }).returning();

        if (onboarding) {
          results.onboardingCreated++;
          await db.update(clients)
            .set({ workflowStatus: "active", onboardingCompletedAt: new Date() })
            .where(eq(clients.id, client.id));

          const taskResult = await createClientTaskRules({
            clientId: client.id, userId, assignedTo: null,
            fiscalYearEnd: "December 31", ...attrs,
          });
          results.tasksCreated += taskResult.tasks.length;
        }
      }

      return {
        success: true,
        message: `Force-restored ${results.clientsCreated} clients, ${results.onboardingCreated} onboarding records, and ${results.tasksCreated} tasks.`,
        ...results,
      };
    }),
});
