# Go Fig Bookz — AI cost model & sustainable‑spend plan

Answers Markie's three questions: **(1) what do the AI agents cost on the Claude API, (2) can I run them on my own server instead, (3) what's the better/sustainable solution.** Written 2026‑06 with current Claude pricing.

## 1. What it costs (Claude API, per million tokens)

| Model | Input | Output | Cached‑read | Use it for |
|---|---|---|---|---|
| **Haiku 4.5** | $1 | $5 | ~$0.10 | Vendor classification, web‑lookup, cheap/bulk tasks (already the default — `FIGGY_CLASSIFY_MODEL=claude-haiku-4-5`) |
| **Sonnet 4.6** | $3 | $15 | ~$0.30 | Everyday agent chat, triage enrichment, drafting |
| **Opus 4.8** | $5 | $25 | ~$0.50 | Only the hardest reasoning (month‑end workpaper, tax research) |

Two levers cut this hard:
- **Prompt caching** — the big static part of an agent's prompt (skill pack, roster, learnings) is cached and re‑read at **~10% of input price**. With a shared system prompt across calls this is the single biggest saver.
- **Batch API** — non‑urgent bulk work (overnight backlog coding, sweeps) runs at **‑50%**.

**Rough monthly estimate** (typical agent chat ≈ 4k input + 1k output per turn; classification ≈ 1k+0.3k on Haiku):

| Usage | Assumption | Est. /mo |
|---|---|---|
| Light | ~500 chat turns (Sonnet) + 2k classifications (Haiku) | **$15–25** |
| Medium | ~2,000 chat turns + 10k classifications | **$60–110** |
| Heavy (Fig posting live, all clients daily) | ~8,000 turns + 50k classifications, caching on | **$250–450** |

Even "heavy" is far below the cost of the manual hours it removes. The Anthropic "credit balance too low" error you hit is a **billing/auto‑reload** problem, not a cost problem — see §3.

## 2. Self‑host on your own server?

**Not worth it at this scale.** To match Claude quality you'd run a large open model (e.g. 70B+) which needs a serious GPU (A100/H100‑class, ~$1.5–8/hr rented, or $15k+ to buy) running 24/7, plus you'd own the ops, scaling, updates, and safety. That's **hundreds to thousands/month in GPU + your time**, for *lower* quality than Opus/Sonnet on the tasks that matter (coding judgement, tax/HST reasoning). Self‑host only makes sense at very high, steady volume or for hard data‑residency rules — neither applies here. **Stay on the API.**

(If data residency ever becomes a requirement, the middle path is Claude via **AWS Bedrock (ca‑central‑1)** or **GCP Vertex (Montreal)** — same models, Canadian region, no GPU ops.)

## 3. The better/sustainable solution (recommended)

1. **Turn on auto‑reload billing** in the Anthropic console (Billing → auto‑reload, e.g. top up $50 when balance drops below $20). This kills the "credits too low" outage — the agents never stop mid‑task. *This is the one‑click fix for what broke Skye.*
2. **Tier the models** (mostly already done): Haiku for classification/web/bulk, Sonnet for chat, Opus only for the few hard jobs. A single `FIGGY_*_MODEL` env per task keeps it tunable.
3. **Lean on prompt caching** — keep each agent's static system/skill block stable so it's cached; only the per‑message bit is full price.
4. **Batch the overnight work** — backlog coding sweeps, reclassification, month‑end passes go through the Batch API at ‑50%.
5. **Track spend in the CRM** — a small monthly token/$ counter on the System Health page so you see the number, not a surprise. (Buildable next; low effort.)

**Bottom line:** keep it on the Claude API, turn on auto‑reload (fixes the outage), and the tiering + caching + batch levers hold a full‑service AI bookkeeping team to roughly **$25–150/month** for your size — a rounding error against the labour it replaces. Revisit self‑host only if monthly API spend ever clears ~$1–2k steadily.
