/**
 * HST AUDIT ROUTER — wires the pure core (hst-audit-core.ts) to a usable tool.
 * Stateless compute: Markie enters the year's CRA-filed figures + the QBO book
 * figures, gets a verdict (clean / review / fail) reconciled on the ANNUAL total
 * — the principle the core is built on (period swings are expected; the year must
 * tie). No QBO write, no posting.
 */
import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { auditHstYear, type FiledReturn, type BookPeriod } from "./hst-audit-core";

const lines = z.object({
  line101: z.number().default(0),
  line103: z.number().default(0),
  line106: z.number().default(0),
  line109: z.number().default(0),
});
const period = lines.extend({
  periodLabel: z.string().default("Annual"),
  startDate: z.string().default(""),
  endDate: z.string().default(""),
});

export const hstAuditRouter = createRouter({
  run: authedQuery
    .input(z.object({
      clientLabel: z.string().default("Client"),
      fiscalYear: z.string().default(""),
      filed: z.array(period).min(1),
      books: z.array(period).min(1),
    }))
    .mutation(async ({ input }) => {
      return auditHstYear({
        clientLabel: input.clientLabel,
        fiscalYear: input.fiscalYear,
        filed: input.filed as FiledReturn[],
        books: input.books as BookPeriod[],
      });
    }),
});
