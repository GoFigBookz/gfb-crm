# Figgy Engineering & AI Development Standard

> **Status:** Living Document — authored by Markie 2026-06-26 ("for you" — the builder).
> **Scope:** Governs ALL software, AI agents, automations, workflows, and code
> developed for Figgy. This is the **engineering constitution** — the companion to
> the Figgy Operating System (FOS), which governs how the *business* operates. The
> FOS lives in the Brain (it governs the agents at runtime); THIS lives in
> `CLAUDE.md` + this doc (it governs whoever writes the code).
>
> **Objective:** build systems that remain understandable, maintainable, secure, and
> scalable for years.

---

## 1. Never build a black box
Every workflow, automation, and AI decision should be explainable. If a future
developer cannot understand why something exists, it should be documented or redesigned.

## 2. Document while building
Don't wait until the end. Every major feature includes: **Purpose, Inputs, Outputs,
Dependencies, Configuration, Error handling, Limitations, Future improvements.**

## 3. Modular first
Build small reusable modules. Avoid large monolithic workflows. Each module performs
one well-defined responsibility.

## 4. Standardize everything
If something is repeated more than twice, consider creating: a reusable component, a
template, an SOP, a prompt, or a shared library.

## 5. Security is a requirement
Never expose passwords, API keys, client data, financial records, tokens, or
credentials. Use secure storage for secrets. Follow least-privilege access.

## 6. Fail safely
If uncertain: **stop, log the issue, explain the reason, request review when
appropriate.** Never silently continue with uncertain financial decisions.

## 7. Build for change
Assume requirements, AI models, software, tax rules, and clients will all change.
Design systems that are easy to modify.

## 8. No hard-coded client logic
Client-specific rules belong in Client Playbooks or configuration — not inside shared
code.

## 9. Preserve auditability
Every meaningful financial action should be traceable. Where practical, record: **what
happened, when, why, and what changed.**

## 10. Test before deployment
New workflows are tested using representative sample data before production use.

## 11. Complete the task
Don't leave work partially finished if it can reasonably be completed. Don't ask the
user to perform work the AI can perform accurately.

## 12. Continuous refactoring
When improving existing systems: improve readability, reduce duplication, simplify
logic, **preserve behaviour**, and update documentation.

---

## Final rule
**Do not optimize for writing code. Optimize for building a business that will still
be understandable, secure, and maintainable years from now.**

---

### How the current codebase already meets this (2026-06-26 snapshot)
- **#3 / #1:** pure cores (`*-core.ts`) with header docblocks + unit tests; I/O kept thin (e.g. `brain-core` vs `brain-store` vs `brain-router`).
- **#2:** every new module ships a header comment (Purpose/Inputs/…); CLAUDE.md is the running design log.
- **#5:** tokens encrypted at rest (`enc:v1:` AES-256-GCM), OAuth state HMAC-signed, secrets in env, never in chat/commits.
- **#6 / #9:** review gate (nothing posts without Markie), `agent_audit_log` + governance engine (default OFF).
- **#7 / #8:** per-realm `CATEGORY_MAPS`, config-driven connections, no per-client clones in shared code.
- **#10:** 334 unit tests + a green build gate before every merge.

### The one honest tension to watch
The deploy model is **straight-to-main → Railway auto-deploy** (no staging). #10 is
satisfied by unit tests + build verification + the fact that posters/automations are
flag-gated OFF, but there is no representative-sample staging run before prod. Mitigation:
keep changes reversible, keep the review gate ON, and add a staging path before any
write-to-QBO automation goes live.
