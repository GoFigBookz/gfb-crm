/**
 * OPENAI-COMPATIBLE LLM PROVIDER (Markie 2026-06-27: "is there not something I can
 * use on my own like Llama?").
 * =============================================================================
 * Purpose:  Let the agents run on a CHEAP or FREE model instead of paid Anthropic —
 *           any OpenAI-compatible chat-completions endpoint works:
 *             • Groq      — hosts Llama 3.3 70B, generous free tier, very fast
 *                           (FIGGY_LLM_BASE_URL=https://api.groq.com/openai/v1)
 *             • DeepSeek  — extremely cheap (https://api.deepseek.com/v1)
 *             • Together / OpenRouter — many open models
 *             • Ollama    — fully self-hosted Llama on your own box
 *                           (http://localhost:11434/v1, no key)
 * Inputs:   the same tool loop the Anthropic path uses (system, history, tools,
 *           runTool). Translates Anthropic-style tool schemas → OpenAI `functions`.
 * Outputs:  { reply, actions } — identical shape to the Anthropic path so the
 *           router is provider-agnostic.
 * Config:   FIGGY_LLM_PROVIDER=openai turns this on; FIGGY_LLM_BASE_URL, FIGGY_LLM_MODEL,
 *           FIGGY_LLM_API_KEY (optional for local Ollama). Default provider stays
 *           Anthropic — this path is OPT-IN and never touches the working one.
 * Errors:   any failure returns null so the router falls back to the Brain.
 * Limitations: text-only (no image/PDF vision on this path); tool-calling quality
 *           depends on the model (Llama 70B / DeepSeek handle it well).
 * =============================================================================
 */

export interface OpenAiTool { name: string; description: string; input_schema: any; }
export interface OpenAiChatOpts {
  baseUrl: string;
  apiKey?: string;
  model: string;
  system: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  userText: string;
  tools: OpenAiTool[];
  actionToolNames: Set<string>;          // which tools count as a user-facing "action"
  runTool: (name: string, input: any) => Promise<string>;
  onAction?: (name: string, output: string) => Promise<void> | void;  // audit hook
  maxRounds?: number;
  timeoutMs?: number;
}

/** Translate our Anthropic-style tool defs to OpenAI function-tool format. */
function toOpenAiTools(tools: OpenAiTool[]): any[] {
  return tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.input_schema || { type: "object", properties: {} } },
  }));
}

/**
 * Run the agent tool loop against an OpenAI-compatible endpoint.
 * Returns { reply, actions } on success, or null on any error (→ Brain fallback).
 */
export async function openaiToolChat(opts: OpenAiChatOpts): Promise<{ reply: string; actions: string[] } | null> {
  const { baseUrl, apiKey, model, system, history, userText, tools, actionToolNames, runTool, onAction } = opts;
  const maxRounds = opts.maxRounds ?? 5;
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const url = baseUrl.replace(/\/$/, "") + "/chat/completions";

  const messages: any[] = [
    { role: "system", content: system },
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: userText },
  ];
  const actions: string[] = [];
  const oaiTools = toOpenAiTools(tools);

  try {
    for (let round = 0; round < maxRounds; round++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
          body: JSON.stringify({ model, messages, tools: oaiTools, tool_choice: "auto", max_tokens: 1024, temperature: 0.4 }),
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error("[assistant:openai] HTTP", res.status, body.slice(0, 300));
        return null;
      }
      const data: any = await res.json();
      const choice = data?.choices?.[0];
      const msg = choice?.message;
      if (!msg) return null;

      const toolCalls = msg.tool_calls as any[] | undefined;
      if (toolCalls && toolCalls.length) {
        // Append the assistant's tool-call turn, then a tool result per call.
        messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: toolCalls });
        for (const call of toolCalls) {
          const name = call?.function?.name;
          let args: any = {};
          try { args = call?.function?.arguments ? JSON.parse(call.function.arguments) : {}; } catch { args = {}; }
          const out = await runTool(name, args);
          if (actionToolNames.has(name)) { actions.push(out); if (onAction) await onAction(name, out); }
          messages.push({ role: "tool", tool_call_id: call.id, content: out });
        }
        continue; // let the model read the results and answer
      }

      // No tool calls → final answer.
      let reply = (msg.content || "").trim();
      if (!reply && actions.length) reply = actions.join("\n");
      if (!reply) return null;
      return { reply, actions };
    }
    return actions.length ? { reply: actions.join("\n"), actions } : null;
  } catch (e) {
    console.error("[assistant:openai] error", e instanceof Error ? e.message : String(e));
    return null;
  }
}
