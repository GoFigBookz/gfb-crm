/**
 * SKILL PACK INDEX — assembles each agent's full playbook.
 * Each agent has its OWN file (this folder); here we combine:
 *   COMMON_STANDARDS (research/double-check discipline)
 *   + the agent's role pack
 *   + the QuickBooks playbook (book-touching agents) or a short pointer.
 */
import { COMMON_STANDARDS } from "./common";
import { QBO_PLAYBOOK, QBO_AWARE } from "./quickbooks";
import { FIG_SKILL } from "./fig";
import { SAGE_SKILL } from "./sage";
import { WREN_SKILL } from "./wren";
import { LIV_SKILL } from "./liv";
import { JINX_SKILL } from "./jinx";
import { TESS_SKILL } from "./tess";
import { JADE_SKILL } from "./jade";
import { SKYE_SKILL } from "./skye";

const ROLE: Record<string, string> = {
  fig: FIG_SKILL,
  sage: SAGE_SKILL,
  wren: WREN_SKILL,
  liv: LIV_SKILL,
  jinx: JINX_SKILL,
  tess: TESS_SKILL,
  jade: JADE_SKILL,
  skye: SKYE_SKILL,
};

// Agents that post/pull in QBO carry the FULL QuickBooks playbook; the rest get
// the short pointer so they know who handles it.
const QBO_AGENTS = new Set(["fig", "sage", "wren", "tess", "jade"]);

/** The full skill pack for an agent (empty string if the agent is unknown). */
export function skillFor(agent: string): string {
  const role = ROLE[agent];
  if (!role) return "";
  const qbo = QBO_AGENTS.has(agent) ? QBO_PLAYBOOK : QBO_AWARE;
  return [COMMON_STANDARDS, role, qbo].join("\n\n");
}

export const AGENT_SKILLS: Record<string, string> = Object.fromEntries(
  Object.keys(ROLE).map((k) => [k, skillFor(k)]),
);
