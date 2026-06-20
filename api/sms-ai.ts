/**
 * FIGGY JR — SMS AI AUTO-RESPONDER
 * =============================================================================
 * Drafts a short, professional SMS reply to a client's latest text using Claude.
 * Read-only by default: the draft is shown in the Messages UI for one-click send
 * (suggest mode). True auto-send is OFF unless FIGGY_SMS_AUTORESPOND=on (then an
 * inbound text from a KNOWN client gets an auto-reply).
 *
 * Degrades safely: no ANTHROPIC_API_KEY → returns null (UI just shows nothing).
 * =============================================================================
 */
export type SmsTurn = { direction: "inbound" | "outbound"; body: string };

/** Draft a reply to the latest inbound message given the recent thread. */
export async function draftSmsReply(opts: {
  clientName?: string | null;
  thread: SmsTurn[];
  timeoutMs?: number;
}): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || process.env.FIGGY_SMS_AI === "off") return null;
  const model = process.env.FIGGY_SMS_MODEL || "claude-haiku-4-5";
  const recent = opts.thread.slice(-10);
  if (!recent.some((t) => t.direction === "inbound")) return null;

  const transcript = recent
    .map((t) => `${t.direction === "inbound" ? "Client" : "Us"}: ${t.body}`)
    .join("\n");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15_000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: 300,
        system:
          `You are the assistant for Go Fig Bookz, a Canadian bookkeeping firm` +
          `${opts.clientName ? `, replying to the client "${opts.clientName}"` : ""}. ` +
          `Draft a SHORT, warm, professional SMS reply to the client's latest message. ` +
          `Rules: one or two sentences, plain text (no markdown), no emojis unless the client used them. ` +
          `NEVER invent financial figures, dates, balances, or filing statuses — if specifics are needed, ` +
          `say you'll check and follow up. If the message clearly needs the bookkeeper/owner, acknowledge it ` +
          `and say someone will follow up. Reply with ONLY the message text, nothing else.`,
        messages: [{ role: "user", content: `Conversation so far:\n${transcript}\n\nDraft our reply:` }],
      }),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const text: string = (data?.content ?? [])
      .filter((b: any) => b?.type === "text")
      .map((b: any) => String(b.text ?? ""))
      .join(" ")
      .trim();
    return text || null;
  } catch {
    return null; // network/abort/bad JSON → degrade
  } finally {
    clearTimeout(timer);
  }
}
