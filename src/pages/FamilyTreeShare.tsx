import { useParams } from "react-router";
import { trpc } from "@/providers/trpc";

/**
 * PUBLIC FAMILY TREE — token-gated, read-only, beautifully branded as an
 * extension of Markie's Heritage ("From Fleur de Lys to Coachman's Cove").
 * What relatives see when Markie shares the link. Every person carries an honest
 * proof level + confidence% so the tree is valuable AND truthful — a keepsake to
 * pass to her daughter. No editing, no private data — just the family story.
 */
const PROOF: Record<string, { bg: string; fg: string; label: string; emoji: string }> = {
  proven: { bg: "#dcebd8", fg: "#2f5233", label: "Verified by record", emoji: "✅" },
  likely: { bg: "#fff1bd", fg: "#7a5b00", label: "Likely", emoji: "🟡" },
  clue:   { bg: "#d8e6f3", fg: "#234b5a", label: "Tree clue", emoji: "🔍" },
  wall:   { bg: "#f6d4d4", fg: "#7b1e3a", label: "Brick wall", emoji: "🧱" },
};
function proofKey(m: any): string {
  if (m.proofLevel) return m.proofLevel;
  const c = m.confidence;
  if (c == null) return "clue";
  return c >= 95 ? "proven" : c >= 70 ? "likely" : c >= 40 ? "clue" : "wall";
}

export default function FamilyTreeShare() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading } = trpc.genealogy.publicView.useQuery({ token: token! }, { enabled: !!token });

  if (isLoading) return <Center>Loading the family story…</Center>;
  if (!data) return <Center>This link isn’t valid or has been revoked.</Center>;

  return (
    <div style={{ minHeight: "100vh", background: "#fffaf2", color: "#202124", fontFamily: "Georgia, 'Times New Roman', serif", lineHeight: 1.55 }}>
      <header style={{ background: "linear-gradient(135deg,#7b1e3a,#27384b)", color: "white", padding: "44px 24px", textAlign: "center" }}>
        <div style={{ fontSize: "0.8rem", letterSpacing: "0.18em", opacity: 0.85, textTransform: "uppercase" }}>Phoenix Rising · Family History</div>
        <h1 style={{ fontSize: "2.2rem", margin: "8px 0 4px" }}>{data.title}</h1>
        <p style={{ maxWidth: 760, margin: "0 auto", fontSize: "1.02rem", opacity: 0.95 }}>{data.subtitle}</p>
        <div style={{ marginTop: 16, display: "inline-flex", gap: 8, alignItems: "center", background: "rgba(255,255,255,0.14)", borderRadius: 999, padding: "6px 14px", fontSize: "0.85rem" }}>
          <strong>~{data.accuracy}% verified</strong> · {data.count} people on record
        </div>
      </header>

      <main style={{ maxWidth: 1060, margin: "0 auto", padding: 24 }}>
        {/* Honesty note + legend */}
        <section style={card}>
          <p style={{ margin: "0 0 10px" }}>
            This is a living family tree, lovingly researched and updated every month. Each person is marked with how <em>sure</em> we are —
            from verified records down to early clues still being chased. Where we’re not certain, we say so, on purpose.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {Object.entries(PROOF).map(([k, v]) => (
              <span key={k} style={{ background: v.bg, color: v.fg, borderRadius: 999, padding: "4px 10px", fontSize: "0.82rem" }}>{v.emoji} {v.label}</span>
            ))}
          </div>
        </section>

        {data.groups.map((g: any) => (
          <section key={g.gen} style={card}>
            <h2 style={{ color: "#7b1e3a", borderBottom: "2px solid #f1e3d3", paddingBottom: 8, marginTop: 0 }}>{g.label}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14 }}>
              {g.members.map((m: any) => {
                const p = PROOF[proofKey(m)] || PROOF.clue;
                return (
                  <article key={m.id} style={{ border: "1px solid #e5d8c7", borderRadius: 14, padding: 14, background: "#fffdf8" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      {m.photoUrl
                        ? <img src={m.photoUrl} alt={m.name} style={{ height: 46, width: 46, borderRadius: "50%", objectFit: "cover", border: "1px solid #e5d8c7" }} />
                        : <div style={{ height: 46, width: 46, borderRadius: "50%", background: "#f1e3d3", display: "flex", alignItems: "center", justifyContent: "center", color: "#9a7b5a", fontWeight: 700 }}>{(m.name || "?").slice(0, 1)}</div>}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: "#244b5a" }}>{m.name}{!m.living && <span style={{ color: "#aaa", fontWeight: 400 }}> †</span>}</div>
                        <div style={{ fontSize: "0.82rem", color: "#666" }}>
                          {[m.relation, [m.birthDate, m.deathDate].filter(Boolean).join(" – ")].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                    </div>
                    {m.birthplace && <div style={{ fontSize: "0.85rem", color: "#555", marginTop: 6 }}>📍 {m.birthplace}</div>}
                    {m.occupation && <div style={{ fontSize: "0.85rem", color: "#555" }}>{m.occupation}</div>}
                    {m.notes && <div style={{ fontSize: "0.86rem", color: "#444", marginTop: 6, whiteSpace: "pre-wrap" }}>{m.notes}</div>}
                    <div style={{ marginTop: 8 }}>
                      <span style={{ background: p.bg, color: p.fg, borderRadius: 999, padding: "3px 9px", fontSize: "0.78rem" }}>
                        {p.emoji} {p.label}{m.confidence != null ? ` · ${m.confidence}%` : ""}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}

        <footer style={{ textAlign: "center", color: "#8a7a66", padding: "28px 0", fontSize: "0.85rem" }}>
          A living family history — researched with care, updated monthly, and passed down with love. <br />
          Generated {new Date(data.generatedAt).toLocaleDateString()} · Not a final proof-certified genealogy.
        </footer>
      </main>
    </div>
  );
}

const card: React.CSSProperties = { background: "white", margin: "20px 0", padding: 22, borderRadius: 16, boxShadow: "0 2px 12px #0001" };

function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#7b1e3a", fontFamily: "Georgia, serif", background: "#fffaf2", padding: 24, textAlign: "center" }}>{children}</div>;
}
