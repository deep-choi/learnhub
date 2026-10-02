import React, { useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Maximize2 } from "lucide-react";
import { createSimulation, seedPositions, type SimNode, type Simulation } from "./forceLayout";
import { domainStroke, getPalette, nodeFill, stateAlpha } from "./graphStyle";
import type { ConceptNode, KnowledgeGraph } from "./graphTypes";

export interface GraphCanvasProps {
  graph: KnowledgeGraph;
  /** mini: 대화 옆 로컬 그래프(조작 최소화), full: 전체 지도 */
  variant?: "full" | "mini";
  /** 항상 라벨을 보여주고 가운데 두는 노드 */
  focusId?: string;
  /** 다음에 갈 노드. 이어지는 선과 함께 강조합니다. */
  nextIds?: string[];
  /** 방금 배운 노드. 켜지는 애니메이션을 보여줍니다. */
  pulseId?: string | null;
  /** 지난번에 멈춘 노드 */
  lastPositionId?: string;
  selectedId?: string | null;
  /** 화면에서 숨길 분야 */
  hiddenDomains?: Set<string>;
  onSelect?: (id: string | null, anchor: { x: number; y: number }) => void;
  ariaLabel: string;
  className?: string;
}

interface View {
  x: number;
  y: number;
  k: number;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// 옵시디언처럼 작은 점: 연결 수에 비례해 4~8px(미니는 5~8px)
const radiusFor = (degree: number, variant: "full" | "mini") => (variant === "mini" ? 5 + Math.min(degree, 6) * 0.5 : 4 + Math.min(degree, 8) * 0.5);

export const GraphCanvas: React.FC<GraphCanvasProps> = ({
  graph,
  variant = "full",
  focusId,
  nextIds,
  pulseId,
  lastPositionId,
  selectedId,
  hiddenDomains,
  onSelect,
  ariaLabel,
  className = "",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Simulation | null>(null);
  const nodesRef = useRef<Map<string, SimNode>>(new Map());
  const viewRef = useRef<View>({ x: 0, y: 0, k: 1 });
  const sizeRef = useRef({ w: 300, h: 300 });
  const hoverRef = useRef<string | null>(null);
  const viewTouchedRef = useRef(false);
  const pinnedRef = useRef<Set<string>>(new Set());
  const pulseRef = useRef<{ id: string; start: number } | null>(null);
  const dragRef = useRef<{ mode: "pan" | "node" | "none"; id?: string; startX: number; startY: number; moved: boolean; viewX: number; viewY: number }>({
    mode: "none",
    startX: 0,
    startY: 0,
    moved: false,
    viewX: 0,
    viewY: 0,
  });
  const rafRef = useRef<number | null>(null);
  const [, setPinTick] = useState(0);
  const latest = useRef({ graph, nextIds, focusId, lastPositionId, selectedId, hiddenDomains, variant });
  latest.current = { graph, nextIds, focusId, lastPositionId, selectedId, hiddenDomains, variant };

  const reduceMotion = useMemo(prefersReducedMotion, []);

  const { degree, adjacency } = useMemo(() => {
    const degreeMap = new Map<string, number>();
    const adj = new Map<string, Set<string>>();
    for (const edge of graph.edges) {
      for (const [a, b] of [[edge.from, edge.to], [edge.to, edge.from]] as Array<[string, string]>) {
        degreeMap.set(a, (degreeMap.get(a) ?? 0) + 1);
        if (!adj.has(a)) adj.set(a, new Set());
        adj.get(a)!.add(b);
      }
    }
    return { degree: degreeMap, adjacency: adj };
  }, [graph.edges]);

  // 노드·연결이 바뀌면 시뮬레이션을 다시 만들되, 이미 있던 노드의 위치는 이어서 씁니다.
  const structureKey = useMemo(
    () => `${graph.nodes.map((node) => node.id).join("|")}#${graph.edges.map((edge) => edge.id).join("|")}`,
    [graph.nodes, graph.edges],
  );

  const requestFrame = () => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(draw);
  };

  useEffect(() => {
    const previous = nodesRef.current;
    // 첫 계산 때 컨테이너 크기를 직접 읽어, 큰 화면에서는 노드가 적어도 넓게 퍼지게 합니다.
    const box = containerRef.current?.getBoundingClientRect();
    if (box && box.width > 0 && box.height > 0) sizeRef.current = { w: Math.max(box.width, 80), h: Math.max(box.height, 80) };
    const spread = variant === "mini" || graph.nodes.length > 60 ? 1 : Math.min(2, Math.max(1, Math.min(sizeRef.current.w, sizeRef.current.h) / 600));
    const seeds = seedPositions(graph.nodes.length, (variant === "mini" ? 20 : 26) * spread);
    const next = new Map<string, SimNode>();
    const sizing = variant as "full" | "mini";
    graph.nodes.forEach((node, index) => {
      const old = previous.get(node.id);
      next.set(node.id, {
        id: node.id,
        x: old?.x ?? seeds[index].x,
        y: old?.y ?? seeds[index].y,
        vx: 0,
        vy: 0,
        r: radiusFor(degree.get(node.id) ?? 0, sizing),
        fx: pinnedRef.current.has(node.id) && old ? old.x : null,
        fy: pinnedRef.current.has(node.id) && old ? old.y : null,
      });
    });
    nodesRef.current = next;
    const sim = createSimulation(
      [...next.values()],
      graph.edges.filter((edge) => !edge.disputed).map((edge) => ({ source: edge.from, target: edge.to })),
      variant === "mini" ? { linkDistance: 56, repulsion: 1200, gravity: 0.035 } : { linkDistance: 70 * spread, repulsion: 2400 * spread * spread, gravity: 0.02 / spread },
    );
    simRef.current = sim;
    // 처음 보이는 순간부터 퍼진 배치가 되도록 미리 계산한 뒤 화면에 맞춥니다.
    sim.settle(400);
    fitView();
    requestFrame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureKey, variant]);

  useEffect(() => {
    if (pulseId) {
      pulseRef.current = { id: pulseId, start: performance.now() };
      requestFrame();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulseId]);

  useEffect(() => {
    requestFrame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextIds, selectedId, hiddenDomains, lastPositionId, focusId, graph]);

  const fitView = () => {
    const nodes = [...nodesRef.current.values()];
    const { w, h } = sizeRef.current;
    if (nodes.length === 0) return;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const node of nodes) {
      minX = Math.min(minX, node.x - node.r);
      maxX = Math.max(maxX, node.x + node.r);
      minY = Math.min(minY, node.y - node.r);
      maxY = Math.max(maxY, node.y + node.r);
    }
    const mini = latest.current.variant === "mini";
    const pad = mini ? 36 : 60;
    const boxW = Math.max(maxX - minX, 40);
    const boxH = Math.max(maxY - minY, 40);
    const fit = Math.min((w - pad * 2) / boxW, (h - pad * 2) / boxH);
    // 지도 화면은 그래프가 캔버스 짧은 변의 약 70%를 채우게 키웁니다. (여백 유지, 최대 3배)
    const scale = mini ? Math.min(fit, 1.3) : Math.min(fit, (Math.min(w, h) * 0.7) / Math.max(boxW, boxH), 3);
    viewTouchedRef.current = false;
    viewRef.current = { k: Math.max(0.25, scale), x: w / 2 - ((minX + maxX) / 2) * scale, y: h / 2 - ((minY + maxY) / 2) * scale };
  };

  const toWorld = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const view = viewRef.current;
    return { x: (clientX - rect.left - view.x) / view.k, y: (clientY - rect.top - view.y) / view.k, sx: clientX - rect.left, sy: clientY - rect.top };
  };

  const hitTest = (clientX: number, clientY: number): string | null => {
    const { x, y } = toWorld(clientX, clientY);
    let best: string | null = null;
    let bestDist = Infinity;
    const hidden = latest.current.hiddenDomains;
    const byId = new Map<string, ConceptNode>(latest.current.graph.nodes.map((node) => [node.id, node]));
    for (const node of nodesRef.current.values()) {
      const meta = byId.get(node.id);
      if (!meta || hidden?.has(meta.domain)) continue;
      const reach = node.r + 5 / viewRef.current.k;
      const dist = Math.hypot(node.x - x, node.y - y);
      if (dist <= reach && dist < bestDist) {
        best = node.id;
        bestDist = dist;
      }
    }
    return best;
  };

  function draw() {
    rafRef.current = null;
    const canvas = canvasRef.current;
    const sim = simRef.current;
    if (!canvas || !sim) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { w, h } = sizeRef.current;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const state = latest.current;
    const palette = getPalette();
    const now = performance.now();

    if (!reduceMotion && sim.alpha >= 0.012) sim.tick();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, w, h);
    const view = viewRef.current;
    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.k, view.k);

    const metaById = new Map<string, ConceptNode>(state.graph.nodes.map((node) => [node.id, node]));
    const hovered = hoverRef.current ?? state.selectedId ?? null;
    const neighbors = hovered ? adjacency.get(hovered) : undefined;
    const nextSet = new Set(state.nextIds ?? []);
    const dimmed = (id: string) => Boolean(hovered) && id !== hovered && !neighbors?.has(id);
    const hidden = state.hiddenDomains;
    const visible = (id: string) => {
      const meta = metaById.get(id);
      return Boolean(meta) && !hidden?.has(meta!.domain);
    };

    // 연결선
    for (const edge of state.graph.edges) {
      const a = nodesRef.current.get(edge.from);
      const b = nodesRef.current.get(edge.to);
      if (!a || !b || !visible(edge.from) || !visible(edge.to)) continue;
      const active = hovered ? edge.from === hovered || edge.to === hovered : false;
      const toNext = nextSet.size > 0 && ((edge.from === state.focusId && nextSet.has(edge.to)) || (edge.to === state.focusId && nextSet.has(edge.from)));
      // 선과 화살표는 노드 중심이 아니라 테두리(반지름 + 테두리 두께)에서 멈춥니다.
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const border = 1.4 / view.k;
      if (dist <= a.r + b.r + border * 2) continue;
      const ux = dx / dist;
      const uy = dy / dist;
      const directed = edge.kind === "prerequisite";
      const headSize = 7 / view.k;
      const tipX = b.x - ux * (b.r + border);
      const tipY = b.y - uy * (b.r + border);
      const endX = directed ? tipX - ux * headSize * 0.9 : tipX;
      const endY = directed ? tipY - uy * headSize * 0.9 : tipY;
      ctx.beginPath();
      ctx.moveTo(a.x + ux * (a.r + border), a.y + uy * (a.r + border));
      ctx.lineTo(endX, endY);
      ctx.lineWidth = (active || toNext ? 1.6 : 1) / view.k;
      ctx.strokeStyle = edge.disputed ? palette.danger : toNext ? palette.accent : active ? palette.edgeActive : palette.edge;
      ctx.globalAlpha = hovered && !active ? 0.25 : edge.disputed ? 0.7 : 1;
      ctx.setLineDash(edge.kind === "curiosity" || edge.disputed ? [4 / view.k, 3 / view.k] : []);
      ctx.stroke();
      if (directed) {
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - ux * headSize * 0.9 - uy * headSize * 0.45, tipY - uy * headSize * 0.9 + ux * headSize * 0.45);
        ctx.lineTo(tipX - ux * headSize * 0.9 + uy * headSize * 0.45, tipY - uy * headSize * 0.9 - ux * headSize * 0.45);
        ctx.closePath();
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fill();
      }
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // 노드
    for (const node of state.graph.nodes) {
      const sim = nodesRef.current.get(node.id);
      if (!sim || !visible(node.id)) continue;
      const fade = dimmed(node.id) ? 0.18 : 1;
      const color = nodeFill(node.state, palette);
      const ringColor = domainStroke(node.domain, palette.isDark);
      const isNext = nextSet.has(node.id);
      const isFocus = node.id === state.focusId;
      let r = sim.r;
      let ringBoost = 0;

      const pulse = pulseRef.current;
      if (pulse && pulse.id === node.id) {
        const t = reduceMotion ? 1 : Math.min((now - pulse.start) / 1400, 1);
        if (t < 1) {
          const ease = 1 - Math.pow(1 - t, 3);
          r *= 0.6 + 0.4 * ease + Math.sin(t * Math.PI) * 0.35;
          ringBoost = (1 - t) * 18;
          ctx.beginPath();
          ctx.arc(sim.x, sim.y, sim.r + ringBoost, 0, Math.PI * 2);
          ctx.strokeStyle = palette.accent;
          ctx.globalAlpha = (1 - t) * 0.9;
          ctx.lineWidth = 2 / view.k;
          ctx.stroke();
        }
      }

      if (isNext || isFocus) {
        const glow = isNext && !reduceMotion ? 0.5 + 0.5 * Math.sin(now / 380) : 0.6;
        ctx.beginPath();
        ctx.arc(sim.x, sim.y, r + 5 + glow * 3, 0, Math.PI * 2);
        ctx.fillStyle = palette.accent;
        ctx.globalAlpha = (isNext ? 0.16 + glow * 0.14 : 0.14) * fade;
        ctx.fill();
      }

      ctx.globalAlpha = stateAlpha(node.state) * fade;
      ctx.beginPath();
      ctx.arc(sim.x, sim.y, r, 0, Math.PI * 2);
      if (node.state === "curious") {
        ctx.fillStyle = palette.background;
        ctx.fill();
        ctx.setLineDash([3 / view.k, 2.5 / view.k]);
        ctx.strokeStyle = ringColor;
        ctx.lineWidth = 1.6 / view.k;
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        // 채움 색은 배움 상태, 테두리 색은 분야(domain)를 나타냅니다.
        ctx.fillStyle = color;
        ctx.fill();
        ctx.globalAlpha = Math.max(stateAlpha(node.state), 0.8) * fade;
        ctx.lineWidth = 1.4 / view.k;
        ctx.strokeStyle = ringColor;
        ctx.stroke();
        if (node.state === "verified") {
          ctx.globalAlpha = 0.95 * fade;
          ctx.beginPath();
          ctx.arc(sim.x, sim.y, r * 0.34, 0, Math.PI * 2);
          ctx.fillStyle = "#ffffff";
          ctx.fill();
        }
      }

      if (pinnedRef.current.has(node.id)) {
        ctx.globalAlpha = fade;
        ctx.beginPath();
        ctx.arc(sim.x, sim.y, r + 3, 0, Math.PI * 2);
        ctx.strokeStyle = palette.label;
        ctx.lineWidth = 1 / view.k;
        ctx.stroke();
      }
      if (node.id === state.selectedId) {
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(sim.x, sim.y, r + 4, 0, Math.PI * 2);
        ctx.strokeStyle = palette.accent;
        ctx.lineWidth = 2 / view.k;
        ctx.stroke();
      }
      if (node.id === state.lastPositionId) {
        const wave = reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(now / 500);
        ctx.globalAlpha = 0.5 + wave * 0.4;
        ctx.beginPath();
        ctx.arc(sim.x, sim.y, r + 7 + wave * 2, 0, Math.PI * 2);
        ctx.strokeStyle = palette.review;
        ctx.lineWidth = 2 / view.k;
        ctx.setLineDash([2 / view.k, 3 / view.k]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.globalAlpha = 1;

    // 라벨: 평소에는 숨기고, 많이 확대했을 때·마우스를 올렸을 때·지금 위치(또는 중심) 노드에만 보여줍니다.
    // 보이는 라벨끼리는 겹치지 않게 우선순위가 낮은 쪽을 건너뜁니다.
    const mini = state.variant === "mini";
    const labelAll = !mini && view.k >= 1.9;
    const isMust = (id: string) => id === hovered || id === state.lastPositionId || id === state.focusId || id === state.selectedId;
    const candidates = state.graph.nodes
      .filter((node) => visible(node.id) && nodesRef.current.has(node.id) && (labelAll || isMust(node.id)))
      .sort((a, b) => Number(isMust(b.id)) - Number(isMust(a.id)) || (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0));
    const size = (mini ? 11 : 12) / view.k;
    const pad = 3 / view.k;
    const placed: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const node of candidates) {
      const sim = nodesRef.current.get(node.id)!;
      const must = isMust(node.id);
      const text = node.name.length > 14 ? `${node.name.slice(0, 13)}…` : node.name;
      ctx.font = `${must ? 600 : 400} ${size}px "Pretendard Variable", Pretendard, system-ui, sans-serif`;
      const width = ctx.measureText(text).width;
      const extra = node.id === state.lastPositionId ? size + 2 / view.k : 0;
      const rect = { x0: sim.x - width / 2 - pad, y0: sim.y + sim.r + 3 / view.k, x1: sim.x + width / 2 + pad, y1: sim.y + sim.r + 3 / view.k + size + extra + pad };
      if (!must && placed.some((other) => rect.x0 < other.x1 && rect.x1 > other.x0 && rect.y0 < other.y1 && rect.y1 > other.y0)) continue;
      placed.push(rect);
      ctx.globalAlpha = !must && hovered && !neighbors?.has(node.id) ? 0.25 : 1;
      // 선 위에서도 읽히도록 캔버스 배경색 외곽선(halo)을 먼저 깔고 글자를 얹습니다.
      ctx.lineJoin = "round";
      ctx.lineWidth = 4 / view.k;
      ctx.strokeStyle = palette.background;
      ctx.strokeText(text, sim.x, rect.y0);
      ctx.fillStyle = must ? palette.label : palette.labelDim;
      ctx.fillText(text, sim.x, rect.y0);
      if (node.id === state.lastPositionId) {
        ctx.strokeText("여기까지 했어요", sim.x, rect.y0 + size + 2 / view.k);
        ctx.fillStyle = palette.review;
        ctx.fillText("여기까지 했어요", sim.x, rect.y0 + size + 2 / view.k);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    const pulsing = pulseRef.current && now - pulseRef.current.start < 1500;
    const ambient = !reduceMotion && (nextSet.size > 0 || state.lastPositionId);
    if ((!reduceMotion && sim.alpha >= 0.012) || pulsing || ambient || dragRef.current.mode !== "none") requestFrame();
  }

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const resize = () => {
      const rect = container.getBoundingClientRect();
      sizeRef.current = { w: Math.max(rect.width, 80), h: Math.max(rect.height, 80) };
      if (!viewTouchedRef.current) fitView();
      requestFrame();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    const themeObserver = new MutationObserver(requestFrame);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      observer.disconnect();
      themeObserver.disconnect();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const interactive = variant === "full";

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const hit = hitTest(event.clientX, event.clientY);
    const drag = dragRef.current;
    drag.startX = event.clientX;
    drag.startY = event.clientY;
    drag.moved = false;
    drag.viewX = viewRef.current.x;
    drag.viewY = viewRef.current.y;
    if (hit && interactive) {
      drag.mode = "node";
      drag.id = hit;
    } else {
      drag.mode = interactive ? "pan" : "none";
      drag.id = undefined;
    }
    canvasRef.current?.setPointerCapture(event.pointerId);
    requestFrame();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (drag.mode === "none") {
      const hit = hitTest(event.clientX, event.clientY);
      if (hit !== hoverRef.current) {
        hoverRef.current = hit;
        if (canvasRef.current) canvasRef.current.style.cursor = hit ? "pointer" : interactive ? "grab" : "default";
        requestFrame();
      }
      return;
    }
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    if (drag.mode === "pan") {
      viewTouchedRef.current = true;
      viewRef.current = { ...viewRef.current, x: drag.viewX + dx, y: drag.viewY + dy };
    } else if (drag.mode === "node" && drag.id) {
      const node = nodesRef.current.get(drag.id);
      const world = toWorld(event.clientX, event.clientY);
      if (node) {
        node.fx = world.x;
        node.fy = world.y;
        node.x = world.x;
        node.y = world.y;
        simRef.current?.reheat(0.35);
      }
    }
    requestFrame();
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    const wasClick = !drag.moved;
    if (drag.mode === "node" && drag.id) {
      const node = nodesRef.current.get(drag.id);
      // 끌어서 놓은 노드는 그 자리에 두지 않고 다시 힘에 맡깁니다. (고정은 더블클릭)
      if (node && !pinnedRef.current.has(drag.id)) {
        node.fx = null;
        node.fy = null;
      }
    }
    const mode = drag.mode;
    drag.mode = "none";
    canvasRef.current?.releasePointerCapture(event.pointerId);
    if (wasClick && interactive && onSelect) {
      const hit = hitTest(event.clientX, event.clientY);
      const rect = canvasRef.current!.getBoundingClientRect();
      onSelect(hit, { x: event.clientX - rect.left, y: event.clientY - rect.top });
    } else if (wasClick && mode === "none" && !interactive && onSelect) {
      const hit = hitTest(event.clientX, event.clientY);
      const rect = canvasRef.current!.getBoundingClientRect();
      if (hit) onSelect(hit, { x: event.clientX - rect.left, y: event.clientY - rect.top });
    }
    requestFrame();
  };

  const handleDoubleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!interactive) return;
    const hit = hitTest(event.clientX, event.clientY);
    if (!hit) return;
    const node = nodesRef.current.get(hit);
    if (!node) return;
    if (pinnedRef.current.has(hit)) {
      pinnedRef.current.delete(hit);
      node.fx = null;
      node.fy = null;
      simRef.current?.reheat(0.3);
    } else {
      pinnedRef.current.add(hit);
      node.fx = node.x;
      node.fy = node.y;
    }
    setPinTick((value) => value + 1);
    requestFrame();
  };

  // wheel은 passive 리스너로 등록되면 preventDefault가 안 되므로 직접 붙입니다.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !interactive) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomAt(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX, event.clientY);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive]);

  const zoomAt = (factor: number, clientX?: number, clientY?: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const view = viewRef.current;
    const sx = clientX != null ? clientX - rect.left : rect.width / 2;
    const sy = clientY != null ? clientY - rect.top : rect.height / 2;
    const k = Math.min(4, Math.max(0.2, view.k * factor));
    const ratio = k / view.k;
    viewTouchedRef.current = true;
    viewRef.current = { k, x: sx - (sx - view.x) * ratio, y: sy - (sy - view.y) * ratio };
    requestFrame();
  };

  return (
    <div ref={containerRef} className={`relative overflow-hidden ${className}`}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={ariaLabel}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ cursor: interactive ? "grab" : "default" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => {
          if (dragRef.current.mode === "none" && hoverRef.current) {
            hoverRef.current = null;
            requestFrame();
          }
        }}
        onDoubleClick={handleDoubleClick}
      />
      {interactive && (
        <div className="absolute bottom-3 right-3 flex flex-col overflow-hidden rounded-xl border border-[var(--lh-line)] bg-[var(--lh-surface)]/90 shadow-xs backdrop-blur">
          <button type="button" onClick={() => zoomAt(1.25)} aria-label="확대" className="flex h-9 w-9 items-center justify-center text-[var(--lh-ink-secondary)] hover:bg-[var(--lh-surface-subtle)] cursor-pointer"><Plus className="h-4 w-4" /></button>
          <button type="button" onClick={() => zoomAt(1 / 1.25)} aria-label="축소" className="flex h-9 w-9 items-center justify-center border-t border-[var(--lh-line)] text-[var(--lh-ink-secondary)] hover:bg-[var(--lh-surface-subtle)] cursor-pointer"><Minus className="h-4 w-4" /></button>
          <button type="button" onClick={() => { fitView(); requestFrame(); }} aria-label="전체 보기" className="flex h-9 w-9 items-center justify-center border-t border-[var(--lh-line)] text-[var(--lh-ink-secondary)] hover:bg-[var(--lh-surface-subtle)] cursor-pointer"><Maximize2 className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
};
