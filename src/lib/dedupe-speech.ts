/**
 * Collapse consecutive repeated phrases (up to 12 words) that mobile
 * speech-to-text emits on its auto-restarts, e.g. "can you tell me can you tell
 * me" → "can you tell me", "Sky Sky Sky" → "Sky". Genuine non-repeated text is
 * kept. Longer windows first so multi-word stutters collapse before single words.
 */
export function dedupePhrases(text: string): string {
  let words = (text || "").split(/\s+/).filter(Boolean);
  for (let n = 12; n >= 1; n--) {
    const out: string[] = [];
    for (let i = 0; i < words.length; ) {
      if (out.length >= n) {
        const prev = out.slice(out.length - n).join(" ").toLowerCase();
        const cur = words.slice(i, i + n).join(" ").toLowerCase();
        if (cur.length && prev === cur) { i += n; continue; } // skip the repeat
      }
      out.push(words[i]); i++;
    }
    words = out;
  }
  return words.join(" ");
}
