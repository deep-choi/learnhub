import type { StudyResult } from "./study";
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const plainItem = (s: string) => s.replace(/^~~(.*)~~$/, "$1");
const lines = (s: string, length: number) => Array.from(s).reduce<string[]>((out, c, i) => { if (i % length === 0) out.push(""); out[out.length - 1] += c; return out; }, []);
const label = (s: string, x: number, y: number, size = 22, width = 35) => lines(s, width).map((line, i) => `<text x="${x}" y="${y + i * (size + 8)}" font-size="${size}" text-anchor="middle">${escape(line)}</text>`).join("");

/** Fixed, escaped SVG vocabulary. The model supplies data, never executable SVG/HTML. */
export function studyDiagramSvg(result: StudyResult): string {
  const diagram = result.diagram || {
    nodes: (result.slides || []).map((s, i) => ({ id: String(i), label: s.title, items: [], kept: [] })),
    edges: (result.slides || []).slice(1).map((_, i) => ({ from: String(i), to: String(i + 1), label: "" })),
  };
  const height = 160 + diagram.nodes.length * 290;
  const positions = new Map(diagram.nodes.map((n, i) => [n.id, 120 + i * 290]));
  const nodes = diagram.nodes.map((n, i) => {
    const y = positions.get(n.id)!;
    return `<g><rect x="95" y="${y}" width="770" height="205" rx="24" fill="white" stroke="#cbdad8"/>${label(n.label, 480, y + 38, 24, 32)}${n.items.map((item, j) => {
      const columns = Math.min(n.items.length, 6), row = Math.floor(j / 6), col = j % 6;
      const x = 480 - (columns - 1) * 118 / 2 + col * 118;
      const cy = y + 102 + row * 62;
      const kept = n.kept.some(value => plainItem(value) === plainItem(item));
      return `<g><rect x="${x - 51}" y="${cy - 25}" width="102" height="50" rx="15" fill="${kept ? "#d7eee7" : "#f1f3f3"}" stroke="${kept ? "#18715d" : "#c5cccc"}"/><g fill="${kept ? "#12563f" : "#777f80"}">${label(plainItem(item), x, cy + 6, 16, 10)}</g>${kept ? "" : `<path d="M ${x - 42} ${cy + 18} L ${x + 42} ${cy - 18}" stroke="#777f80" stroke-width="2"/>`}</g>`;
    }).join("")}${n.items.length ? "" : label(result.slides?.[i]?.body || "", 480, y + 95, 19, 35)}</g>`;
  }).join("");
  const edges = diagram.edges.map((e, i) => {
    const from = positions.get(e.from)!, to = positions.get(e.to)!;
    if (to === from + 290) return `<path d="M480 ${from + 205} V${to - 12}" stroke="#16705c" stroke-width="3" marker-end="url(#arrow)"/>${label(e.label, 660, from + 241, 16, 18)}`;
    const x = 35 + (i % 3) * 16;
    return `<path d="M95 ${from + 102} H${x} V${to + 102} H83" stroke="#16705c" stroke-width="2" fill="none" marker-end="url(#arrow)"/>${label(e.label, 470, from + 235, 16, 30)}`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="${height}" viewBox="0 0 960 ${height}" role="img"><title>${escape(result.title)}</title><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="#16705c"/></marker></defs><rect width="960" height="${height}" rx="24" fill="#edf5f2"/><g font-family="system-ui,sans-serif" fill="#183d35">${label(result.title, 480, 48, 28, 30)}${edges}${nodes}</g></svg>`;
}
export const studyDiagramUrl = (result: StudyResult) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(studyDiagramSvg(result))}`;
