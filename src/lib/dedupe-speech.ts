/**
 * Mobile speech-to-text (webkitSpeechRecognition in continuous mode) is messy:
 * it re-emits results on every auto-restart and often returns GROWING PREFIXES
 * ("hey", "hey Sky", "hey Sky do you know…") as separate results. Naively
 * concatenating them produces the runaway "hey Sky hey Sky do hey Sky do you…"
 * garble. These helpers merge segments by overlap and collapse any residual
 * repeats, so the dictated text reads like what was actually said.
 */

/** Merge segment `b` onto `a`, handling prefix-growth, tail-repeats, containment,
 *  and word-level overlap. Falls back to a plain join only when truly disjoint. */
export function overlapMerge(a: string, b: string): string {
  a = (a || "").trim();
  b = (b || "").trim();
  if (!a) return b;
  if (!b) return a;
  const al = a.toLowerCase(), bl = b.toLowerCase();
  if (bl.startsWith(al)) return b;   // b is a grown version of a → keep the longer
  if (al.startsWith(bl)) return a;   // b is an earlier prefix of a → keep a
  if (al.endsWith(bl)) return a;     // b just repeats a's tail
  if (al.includes(bl)) return a;     // b already contained in a
  // Largest word-suffix of a that equals a word-prefix of b → stitch on it.
  const aw = a.split(/\s+/), bw = b.split(/\s+/);
  const max = Math.min(aw.length, bw.length);
  for (let k = max; k > 0; k--) {
    if (aw.slice(aw.length - k).join(" ").toLowerCase() === bw.slice(0, k).join(" ").toLowerCase()) {
      return [...aw, ...bw.slice(k)].join(" ");
    }
  }
  return a + " " + b;
}

/** Merge an ordered list of recognition segments into one clean transcript. */
export function mergeSpeechSegments(segments: string[]): string {
  let acc = "";
  for (const s of segments) acc = overlapMerge(acc, s);
  return acc;
}

/**
 * Collapse consecutive repeated phrases (up to 12 words) — a final safety net for
 * stutters the overlap merge can't catch (e.g. "Sky Sky Sky" → "Sky").
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

/** Full clean: merge overlapping segments, then collapse any residual repeats. */
export function cleanTranscript(segments: string[]): string {
  return dedupePhrases(mergeSpeechSegments(segments)).trim();
}
