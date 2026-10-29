/**
 * 전체 지도용 왼쪽→오른쪽 계층 배치.
 *
 * - 분야(domain)마다 가로 띠(lane)를 하나씩 쓰고, 위에서 아래로 쌓습니다.
 * - 띠 안에서는 가지 연결의 가장 긴 경로로 열(단계)을 정합니다. 가지 연결은 "먼저 알면 좋아요"(prerequisite)와
 *   대화하다 뻗어 나간 곁가지(curiosity)입니다. 곁가지에서 또 뻗으면 2차, 3차처럼 한 열씩 깊어집니다.
 *   부모가 둘 이상이어도 가장 깊은 쪽 다음 열에 놓으므로 화살표는 항상 오른쪽을 향합니다.
 * - 가지 연결이 없는 개념은 관련 개념이 있으면 그 옆(같은 열)에, 없으면 첫 열에 둡니다.
 * - 같은 열 안에서는 선수 개념들의 평균 높이에 맞추고, 겹치면 아래로 밀어 냅니다(간단한 tidy tree).
 *
 * 순수 함수라서 화면 없이 테스트할 수 있습니다. 글자 폭은 measure로 받아 씁니다.
 */

export interface TreeLayoutNode {
  id: string;
  domain: string;
  label: string;
}

export interface TreeLayoutEdge {
  from: string;
  to: string;
  kind: "prerequisite" | "related" | "curiosity";
  disputed?: boolean;
}

export interface TreeLayoutOptions {
  /** 점 반지름(지도 좌표) */
  radius: number;
  /** 점과 이름 사이, 이름과 다음 연결선 사이 간격 */
  labelGap: number;
  /** 이름 끝에서 다음 열 점까지의 최소 거리 */
  columnGap: number;
  /** 같은 열에서 위아래 개념 사이 거리 */
  rowGap: number;
  /** 띠(분야) 사이 거리 */
  laneGap: number;
  /** 띠 위쪽에 분야 이름을 쓸 공간 */
  laneHeader: number;
  /** 이름 글자 폭 측정(지도 좌표) */
  measure: (text: string) => number;
  /** 이름 최대 폭. 넘으면 말줄임 */
  maxLabelWidth: number;
}

export interface TreeLayoutPosition {
  x: number;
  y: number;
  column: number;
  /** 화면에 쓸 이름(필요하면 말줄임 처리됨)과 그 폭 */
  label: string;
  labelWidth: number;
}

export interface TreeLayoutLane {
  domain: string;
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface TreeLayoutResult {
  positions: Map<string, TreeLayoutPosition>;
  lanes: TreeLayoutLane[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

/** 다음 열로 이어지는 연결인지. 관련(related) 연결은 같은 열에 둡니다. */
export const isBranchEdge = (edge: Pick<TreeLayoutEdge, "kind">) => edge.kind === "prerequisite" || edge.kind === "curiosity";

const truncateToWidth = (text: string, maxWidth: number, measure: (text: string) => number) => {
  if (measure(text) <= maxWidth) return text;
  let end = text.length;
  while (end > 1 && measure(`${text.slice(0, end)}…`) > maxWidth) end -= 1;
  return `${text.slice(0, end)}…`;
};

export const computeTreeLayout = (
  nodes: readonly TreeLayoutNode[],
  edges: readonly TreeLayoutEdge[],
  options: TreeLayoutOptions,
): TreeLayoutResult => {
  const { radius, labelGap, columnGap, rowGap, laneGap, laneHeader, measure, maxLabelWidth } = options;
  const positions = new Map<string, TreeLayoutPosition>();
  const lanes: TreeLayoutLane[] = [];

  // 분야 순서는 처음 나온 순서(지도 위쪽 분야 버튼 순서와 같음)를 따릅니다.
  const domains: string[] = [];
  const byDomain = new Map<string, TreeLayoutNode[]>();
  for (const node of nodes) {
    if (!byDomain.has(node.domain)) {
      byDomain.set(node.domain, []);
      domains.push(node.domain);
    }
    byDomain.get(node.domain)!.push(node);
  }

  let laneTop = 0;
  for (const domain of domains) {
    const laneNodes = byDomain.get(domain)!;
    const ids = new Set(laneNodes.map((node) => node.id));
    const inputIndex = new Map(laneNodes.map((node, index) => [node.id, index]));
    const live = edges.filter((edge) => !edge.disputed && ids.has(edge.from) && ids.has(edge.to) && edge.from !== edge.to);
    const parents = new Map<string, string[]>();
    for (const edge of live) {
      if (!isBranchEdge(edge)) continue;
      if (!parents.has(edge.to)) parents.set(edge.to, []);
      parents.get(edge.to)!.push(edge.from);
    }
    const hasBranch = new Set<string>();
    for (const edge of live) {
      if (isBranchEdge(edge)) {
        hasBranch.add(edge.from);
        hasBranch.add(edge.to);
      }
    }

    // 1) 열: 가지 연결의 가장 긴 경로. 순환이 있으면 그 연결은 건너뜁니다.
    const column = new Map<string, number>();
    const visiting = new Set<string>();
    const columnOf = (id: string): number => {
      const known = column.get(id);
      if (known !== undefined) return known;
      if (visiting.has(id)) return 0;
      visiting.add(id);
      const parentColumns = (parents.get(id) ?? []).filter((parent) => !visiting.has(parent)).map(columnOf);
      visiting.delete(id);
      const value = parentColumns.length ? Math.max(...parentColumns) + 1 : 0;
      column.set(id, value);
      return value;
    };
    for (const node of laneNodes) if (hasBranch.has(node.id)) columnOf(node.id);
    // 가지 연결이 없는 개념: 관련 개념이 이미 자리 잡았으면 그 열, 아니면 첫 열
    for (const node of laneNodes) {
      if (column.has(node.id)) continue;
      const anchor = live
        .filter((edge) => edge.from === node.id || edge.to === node.id)
        .map((edge) => (edge.from === node.id ? edge.to : edge.from))
        .find((other) => column.has(other));
      column.set(node.id, anchor ? column.get(anchor)! : 0);
    }

    // 2) 이름과 열 너비
    const labels = new Map<string, { label: string; width: number }>();
    for (const node of laneNodes) {
      const label = truncateToWidth(node.label, maxLabelWidth, measure);
      labels.set(node.id, { label, width: measure(label) });
    }
    const columnCount = Math.max(...laneNodes.map((node) => column.get(node.id)!)) + 1;
    const columnWidth = Array.from({ length: columnCount }, () => 0);
    for (const node of laneNodes) {
      const c = column.get(node.id)!;
      columnWidth[c] = Math.max(columnWidth[c], radius * 2 + labelGap + labels.get(node.id)!.width);
    }
    const columnX: number[] = [];
    let cursor = 0;
    for (let c = 0; c < columnCount; c += 1) {
      columnX.push(cursor + radius);
      cursor += columnWidth[c] + columnGap;
    }

    // 3) 높이: 부모 개념들의 평균 높이를 목표로 하고, 겹치면 순서를 지킨 채 밀어 냅니다.
    const y = new Map<string, number>();
    for (let c = 0; c < columnCount; c += 1) {
      const inColumn = laneNodes.filter((node) => column.get(node.id) === c);
      const desired = new Map<string, number>();
      const unanchored: TreeLayoutNode[] = [];
      for (const node of inColumn) {
        const placedParents = (parents.get(node.id) ?? []).filter((parent) => y.has(parent));
        // 관련 연결만 있는 개념은 그 관련 개념 근처를 목표로 합니다.
        const relatedPlaced = placedParents.length
          ? []
          : live
              .filter((edge) => !isBranchEdge(edge) && (edge.from === node.id || edge.to === node.id))
              .map((edge) => (edge.from === node.id ? edge.to : edge.from))
              .filter((other) => y.has(other));
        const anchors = placedParents.length ? placedParents : relatedPlaced;
        if (anchors.length) desired.set(node.id, anchors.reduce((sum, id) => sum + y.get(id)!, 0) / anchors.length);
        else unanchored.push(node);
      }
      // 기준이 없는 개념은 원래 순서대로 이 열의 맨 아래에 차곡차곡 쌓습니다.
      let stackY = desired.size ? Math.max(...desired.values()) + rowGap : 0;
      for (const node of unanchored.sort((a, b) => inputIndex.get(a.id)! - inputIndex.get(b.id)!)) {
        desired.set(node.id, stackY);
        stackY += rowGap;
      }
      inColumn.sort((a, b) => desired.get(a.id)! - desired.get(b.id)! || inputIndex.get(a.id)! - inputIndex.get(b.id)!);
      // 위에서부터 겹치지 않게 내려 놓은 뒤, 목표와의 평균 차이만큼 통째로 옮겨 균형을 맞춥니다.
      const placed: number[] = [];
      inColumn.forEach((node, index) => {
        const want = desired.get(node.id)!;
        placed.push(index === 0 ? want : Math.max(want, placed[index - 1] + rowGap));
      });
      const shift = inColumn.reduce((sum, node, index) => sum + (desired.get(node.id)! - placed[index]), 0) / Math.max(inColumn.length, 1);
      inColumn.forEach((node, index) => y.set(node.id, placed[index] + shift));
    }

    // 4) 띠 안에서 맨 위가 laneTop + laneHeader가 되도록 맞춥니다.
    const ys = laneNodes.map((node) => y.get(node.id)!);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const offset = laneTop + laneHeader + radius - minY;
    let right = 0;
    for (const node of laneNodes) {
      const c = column.get(node.id)!;
      const { label, width } = labels.get(node.id)!;
      const x = columnX[c];
      positions.set(node.id, { x, y: y.get(node.id)! + offset, column: c, label, labelWidth: width });
      right = Math.max(right, x + radius + labelGap + width);
    }
    const bottom = maxY + offset + radius;
    lanes.push({ domain, top: laneTop, bottom, left: 0, right });
    laneTop = bottom + laneGap;
  }

  const bounds = lanes.length
    ? {
        minX: 0,
        minY: 0,
        maxX: Math.max(...lanes.map((lane) => lane.right)),
        maxY: lanes[lanes.length - 1].bottom,
      }
    : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { positions, lanes, bounds };
};
