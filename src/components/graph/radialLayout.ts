/**
 * 전체 지도용 원형 배치: 과목(domain)마다 작은 원을 하나씩 만듭니다.
 *
 * - 원의 중심은 과목 자체(예: 수학)입니다. 배운 개념은 모두 그 둘레에 놓입니다.
 * - 첫 단계 개념이 첫 고리, 단계(선수 연결의 깊이)가 깊어질수록 바깥 고리로 갑니다. 단계 계산은 treeLayout을 그대로 씁니다.
 * - 각도 순서는 트리 배치의 위아래 순서를 따르므로, 이어진 개념끼리 같은 방향에 모입니다.
 * - 이름은 원의 오른쪽 절반에서는 점 오른쪽, 왼쪽 절반에서는 점 왼쪽에 씁니다.
 * - 여러 원은 가로로 줄지어 놓고, 넘치면 다음 줄로 넘깁니다.
 */
import { computeTreeLayout, type TreeLayoutEdge, type TreeLayoutNode } from "./treeLayout";

export interface RadialLayoutOptions {
  radius: number;
  centerRadius: number;
  labelGap: number;
  /** 고리 사이 최소 거리 */
  ringGap: number;
  /** 같은 고리에서 이웃 개념 사이 최소 호 길이 */
  minArc: number;
  /** 원과 원 사이 여백 */
  clusterGap: number;
  /** 원 위쪽에 과목 이름을 쓸 공간 */
  titleSpace: number;
  maxLabelWidth: number;
  measure: (text: string) => number;
  /** 원들을 한 줄에 놓을 목표 폭(지도 좌표). 화면 비율에 맞춰 넘깁니다. */
  targetRowWidth: number;
}

export type RadialLabelSide = "left" | "right" | "below";

export interface RadialPosition {
  x: number;
  y: number;
  r: number;
  ring: number;
  label: string;
  labelWidth: number;
  labelSide: RadialLabelSide;
  isCenter: boolean;
}

export interface RadialCluster {
  domain: string;
  cx: number;
  cy: number;
  /** 중심(과목)에서 선을 뻗는 첫 고리 개념들 */
  rootIds: string[];
  /** 고리 반지름들(안쪽부터). 안내선으로 그립니다. */
  rings: number[];
  /** 이름까지 포함한 원의 반폭 */
  extent: number;
}

export interface RadialLayoutResult {
  positions: Map<string, RadialPosition>;
  clusters: RadialCluster[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export const computeRadialLayout = (
  nodes: readonly TreeLayoutNode[],
  edges: readonly TreeLayoutEdge[],
  options: RadialLayoutOptions,
): RadialLayoutResult => {
  const { radius, centerRadius, labelGap, ringGap, minArc, clusterGap, titleSpace, maxLabelWidth, measure, targetRowWidth } = options;
  const positions = new Map<string, RadialPosition>();
  const clusters: RadialCluster[] = [];

  const domains: string[] = [];
  for (const node of nodes) if (!domains.includes(node.domain)) domains.push(node.domain);

  // 1) 과목별로 원을 원점 기준으로 만든 뒤, 2) 나중에 줄지어 옮깁니다.
  const local: Array<{ domain: string; ids: string[]; rings: number[]; extent: number; local: Map<string, RadialPosition>; rootIds: string[] }> = [];
  for (const domain of domains) {
    const domainNodes = nodes.filter((node) => node.domain === domain);
    const ids = new Set(domainNodes.map((node) => node.id));
    const tree = computeTreeLayout(domainNodes, edges, {
      radius,
      labelGap,
      columnGap: 40,
      rowGap: 30,
      laneGap: 0,
      laneHeader: 0,
      measure,
      maxLabelWidth,
    });

    // 고리 번호: 첫 단계 개념이 1번 고리. 0번(중심)은 과목 자리입니다.
    const ringOf = new Map<string, number>();
    for (const node of domainNodes) ringOf.set(node.id, tree.positions.get(node.id)!.column + 1);
    const ringCount = Math.max(...ringOf.values()) + 1;

    // 각도: 트리의 위아래 순서를 0~360도로 펼칩니다. 같은 고리에서 너무 붙으면 고리를 바깥으로 넓힙니다.
    const ys = domainNodes.map((node) => tree.positions.get(node.id)!.y);
    const minY = Math.min(...ys);
    const span = Math.max(...ys) - minY + 30;
    const angleOf = (id: string) => -Math.PI / 2 + ((tree.positions.get(id)!.y - minY) / span) * Math.PI * 2;
    const rings: number[] = [0];
    for (let ring = 1; ring < ringCount; ring += 1) {
      const members = domainNodes.filter((node) => ringOf.get(node.id) === ring).map((node) => angleOf(node.id)).sort((a, b) => a - b);
      let tightest = Math.PI * 2;
      members.forEach((angle, index) => {
        const nextAngle = index + 1 < members.length ? members[index + 1] : members[0] + Math.PI * 2;
        if (members.length > 1) tightest = Math.min(tightest, nextAngle - angle);
      });
      const needed = members.length > 1 ? minArc / Math.max(tightest, 0.05) : 0;
      rings.push(Math.max(rings[ring - 1] + (ring === 1 ? ringGap * 0.9 : ringGap), needed));
    }

    const placed = new Map<string, RadialPosition>();
    // 중심의 과목 이름이 들어갈 만큼은 기본으로 확보합니다.
    let extent = Math.max(centerRadius + labelGap + measure(domain) / 2, rings[1] ?? 0);
    for (const node of domainNodes) {
      const ring = ringOf.get(node.id)!;
      const { label, labelWidth } = tree.positions.get(node.id)!;
      const angle = angleOf(node.id);
      const x = Math.cos(angle) * rings[ring];
      const y = Math.sin(angle) * rings[ring];
      const labelSide: RadialLabelSide = Math.cos(angle) >= -0.01 ? "right" : "left";
      placed.set(node.id, { x, y, r: radius, ring, label, labelWidth, labelSide, isCenter: false });
      extent = Math.max(extent, Math.abs(x) + radius + labelGap + labelWidth, Math.abs(y) + radius + 20);
    }
    const rootIds = domainNodes.filter((node) => ringOf.get(node.id) === 1).map((node) => node.id);
    local.push({ domain, ids: [...ids], rings, extent, local: placed, rootIds });
  }

  // 원들을 가로로 줄지어 놓습니다. 줄의 높이는 그 줄에서 가장 큰 원에 맞춥니다.
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;
  let rowStart = 0;
  const rowMembers: Array<{ index: number; extent: number }> = [];
  const centers = new Map<number, { cx: number; cy: number }>();
  const flushRow = () => {
    // 같은 줄의 원들은 세로 가운데를 맞춥니다.
    for (const member of rowMembers) {
      const placed = centers.get(member.index)!;
      placed.cy = cursorY + titleSpace + rowHeight / 2;
    }
    cursorY += titleSpace + rowHeight + clusterGap;
    rowMembers.length = 0;
    rowHeight = 0;
    cursorX = 0;
    rowStart = 0;
  };
  local.forEach((cluster, index) => {
    const size = cluster.extent * 2;
    if (cursorX > rowStart && cursorX + size > targetRowWidth) flushRow();
    centers.set(index, { cx: cursorX + cluster.extent, cy: 0 });
    rowMembers.push({ index, extent: cluster.extent });
    rowHeight = Math.max(rowHeight, size);
    cursorX += size + clusterGap;
  });
  if (rowMembers.length) flushRow();

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  local.forEach((cluster, index) => {
    const { cx, cy } = centers.get(index)!;
    clusters.push({ domain: cluster.domain, cx, cy, rootIds: cluster.rootIds, rings: cluster.rings.slice(1), extent: cluster.extent });
    for (const [id, position] of cluster.local) positions.set(id, { ...position, x: position.x + cx, y: position.y + cy });
    minX = Math.min(minX, cx - cluster.extent);
    maxX = Math.max(maxX, cx + cluster.extent);
    minY = Math.min(minY, cy - cluster.extent - titleSpace);
    maxY = Math.max(maxY, cy + cluster.extent);
  });

  return {
    positions,
    clusters,
    bounds: Number.isFinite(minX) ? { minX, minY, maxX, maxY } : { minX: 0, minY: 0, maxX: 0, maxY: 0 },
  };
};
