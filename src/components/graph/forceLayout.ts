/**
 * 의존성 없는 작은 force-directed 배치입니다. (반발력 + 연결선 스프링 + 중심 끌림 + 겹침 방지)
 * 개념 지도는 노드가 수백 개 이하라서 O(n²) 반발로 충분합니다.
 */
export interface SimNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /** 고정된 위치. 값이 있으면 힘의 영향을 받지 않습니다. */
  fx?: number | null;
  fy?: number | null;
}

export interface SimLink {
  source: string;
  target: string;
}

export interface SimulationOptions {
  linkDistance?: number;
  repulsion?: number;
  gravity?: number;
}

export interface Simulation {
  nodes: SimNode[];
  alpha: number;
  tick: () => void;
  reheat: (alpha?: number) => void;
  settle: (maxTicks?: number) => void;
}

const ALPHA_MIN = 0.012;
const ALPHA_DECAY = 0.972;
const VELOCITY_DECAY = 0.6;

/** 같은 입력이면 같은 시작 위치가 나오도록 해바라기 배열로 흩뿌립니다. */
export const seedPositions = (count: number, spread = 22): Array<{ x: number; y: number }> => {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, index) => {
    const radius = spread * Math.sqrt(index + 0.5);
    const angle = index * golden;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
};

export const createSimulation = (
  nodes: SimNode[],
  links: SimLink[],
  options: SimulationOptions = {},
): Simulation => {
  const linkDistance = options.linkDistance ?? 46;
  const repulsion = options.repulsion ?? 520;
  const gravity = options.gravity ?? 0.035;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const degree = new Map<string, number>();
  const usable = links.filter((link) => byId.has(link.source) && byId.has(link.target) && link.source !== link.target);
  for (const link of usable) {
    degree.set(link.source, (degree.get(link.source) ?? 0) + 1);
    degree.set(link.target, (degree.get(link.target) ?? 0) + 1);
  }

  const sim: Simulation = {
    nodes,
    alpha: 1,
    tick() {
      if (sim.alpha < ALPHA_MIN) return;
      const alpha = sim.alpha;

      for (let i = 0; i < nodes.length; i += 1) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j += 1) {
          const b = nodes[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let distSq = dx * dx + dy * dy;
          if (distSq < 0.01) {
            dx = (i % 2 === 0 ? 1 : -1) * 0.1;
            dy = (j % 2 === 0 ? 1 : -1) * 0.1;
            distSq = dx * dx + dy * dy;
          }
          const dist = Math.sqrt(distSq);
          const force = (repulsion * alpha) / distSq;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          a.vx -= fx;
          a.vy -= fy;
          b.vx += fx;
          b.vy += fy;
          const minDist = a.r + b.r + 4;
          if (dist < minDist) {
            const push = ((minDist - dist) / dist) * 0.5;
            a.vx -= dx * push;
            a.vy -= dy * push;
            b.vx += dx * push;
            b.vy += dy * push;
          }
        }
      }

      for (const link of usable) {
        const a = byId.get(link.source)!;
        const b = byId.get(link.target)!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const strength = 0.22 / Math.sqrt(Math.min(degree.get(link.source) ?? 1, degree.get(link.target) ?? 1));
        const delta = ((dist - linkDistance) / dist) * strength * alpha;
        a.vx += dx * delta;
        a.vy += dy * delta;
        b.vx -= dx * delta;
        b.vy -= dy * delta;
      }

      for (const node of nodes) {
        node.vx -= node.x * gravity * alpha;
        node.vy -= node.y * gravity * alpha;
        if (node.fx != null && node.fy != null) {
          node.x = node.fx;
          node.y = node.fy;
          node.vx = 0;
          node.vy = 0;
          continue;
        }
        node.vx *= VELOCITY_DECAY;
        node.vy *= VELOCITY_DECAY;
        node.x += node.vx;
        node.y += node.vy;
      }

      sim.alpha *= ALPHA_DECAY;
    },
    reheat(alpha = 0.6) {
      sim.alpha = Math.max(sim.alpha, alpha);
    },
    settle(maxTicks = 300) {
      for (let i = 0; i < maxTicks && sim.alpha >= ALPHA_MIN; i += 1) sim.tick();
    },
  };
  return sim;
};
