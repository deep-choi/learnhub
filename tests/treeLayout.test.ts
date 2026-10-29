import assert from "node:assert/strict";
import test from "node:test";
import { computeTreeLayout, type TreeLayoutEdge, type TreeLayoutNode } from "../src/components/graph/treeLayout";

const options = {
  radius: 6,
  labelGap: 8,
  columnGap: 40,
  rowGap: 40,
  laneGap: 60,
  laneHeader: 30,
  measure: (text: string) => text.length * 10,
  maxLabelWidth: 100,
};

const node = (id: string, domain = "수학", label = id): TreeLayoutNode => ({ id, domain, label });
const pre = (from: string, to: string): TreeLayoutEdge => ({ from, to, kind: "prerequisite" });

test("prerequisites flow left to right and a concept with two prerequisites sits after the deeper one", () => {
  const layout = computeTreeLayout(
    [node("a"), node("b"), node("c"), node("d")],
    [pre("a", "b"), pre("b", "c"), pre("a", "d"), pre("c", "d")],
    options,
  );
  const column = (id: string) => layout.positions.get(id)!.column;
  assert.deepEqual([column("a"), column("b"), column("c"), column("d")], [0, 1, 2, 3]);
  // 화살표는 항상 오른쪽으로 향합니다.
  for (const [from, to] of [["a", "b"], ["b", "c"], ["a", "d"], ["c", "d"]]) {
    assert.ok(layout.positions.get(from)!.x < layout.positions.get(to)!.x, `${from} → ${to}`);
  }
});

test("each subject gets its own lane, stacked top to bottom without overlap", () => {
  const layout = computeTreeLayout(
    [node("m1", "수학"), node("m2", "수학"), node("p1", "사진"), node("p2", "사진")],
    [pre("m1", "m2"), pre("p1", "p2")],
    options,
  );
  assert.deepEqual(layout.lanes.map((lane) => lane.domain), ["수학", "사진"]);
  const [math, photo] = layout.lanes;
  assert.ok(math.bottom < photo.top, "lanes do not overlap");
  for (const id of ["m1", "m2"]) {
    const { y } = layout.positions.get(id)!;
    assert.ok(y >= math.top && y <= math.bottom);
  }
  for (const id of ["p1", "p2"]) {
    const { y } = layout.positions.get(id)!;
    assert.ok(y >= photo.top && y <= photo.bottom);
  }
});

test("concepts in the same column keep at least one row apart", () => {
  const layout = computeTreeLayout(
    [node("root"), node("x"), node("y"), node("z")],
    [pre("root", "x"), pre("root", "y"), pre("root", "z")],
    options,
  );
  const ys = ["x", "y", "z"].map((id) => layout.positions.get(id)!.y).sort((a, b) => a - b);
  assert.ok(ys[1] - ys[0] >= options.rowGap - 1e-9);
  assert.ok(ys[2] - ys[1] >= options.rowGap - 1e-9);
  // 자식들은 부모 높이를 중심으로 모입니다.
  const mean = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  assert.ok(Math.abs(mean - layout.positions.get("root")!.y) < 1e-6);
});

test("related-only concepts sit beside the concept they relate to; isolated ones start the lane", () => {
  const layout = computeTreeLayout(
    [node("a"), node("b"), node("buddy"), node("alone")],
    [pre("a", "b"), { from: "b", to: "buddy", kind: "related" }],
    options,
  );
  assert.equal(layout.positions.get("buddy")!.column, layout.positions.get("b")!.column);
  assert.equal(layout.positions.get("alone")!.column, 0);
});

test("long names are shortened to the label width and columns make room for the longest name", () => {
  const layout = computeTreeLayout(
    [node("a", "수학", "아주아주아주아주아주아주긴이름"), node("b", "수학", "짧음")],
    [pre("a", "b")],
    options,
  );
  const a = layout.positions.get("a")!;
  assert.ok(a.label.endsWith("…"));
  assert.ok(a.labelWidth <= options.maxLabelWidth);
  // 다음 열 점은 앞 열 이름이 끝난 뒤 columnGap 이상 떨어져 있습니다.
  assert.ok(layout.positions.get("b")!.x - (a.x + options.radius + options.labelGap + a.labelWidth) >= options.columnGap);
});

test("disputed links and cycles do not break the layout", () => {
  const layout = computeTreeLayout(
    [node("a"), node("b"), node("c")],
    [pre("a", "b"), pre("b", "c"), pre("c", "a"), { ...pre("a", "c"), disputed: true }],
    options,
  );
  assert.equal(layout.positions.size, 3);
  for (const position of layout.positions.values()) {
    assert.ok(Number.isFinite(position.x) && Number.isFinite(position.y));
  }
});

test("concepts without any anchor stack right under the column instead of spreading by their list position", () => {
  const nodes = [node("a"), node("b"), ...Array.from({ length: 10 }, (_, index) => node(`filler${index}`, "다른 분야")), node("lonely")];
  const layout = computeTreeLayout(nodes, [pre("a", "b")], options);
  const lane = layout.lanes.find((item) => item.domain === "수학")!;
  // a, lonely 두 개가 첫 열에 있으므로 띠 높이는 두 줄 정도여야 합니다(목록 순서 13번째라고 13줄이 되면 안 됨).
  assert.ok(lane.bottom - lane.top <= options.laneHeader + options.rowGap + options.radius * 2 + 1e-6);
});

test("branches grown in chat sit one column deeper each time, like 2nd and 3rd levels", () => {
  const branch = (from: string, to: string): TreeLayoutEdge => ({ from, to, kind: "curiosity" });
  const layout = computeTreeLayout(
    [node("lesson"), node("other"), node("af"), node("single"), node("dof")],
    [branch("lesson", "af"), branch("af", "single"), branch("lesson", "dof")],
    options,
  );
  const column = (id: string) => layout.positions.get(id)!.column;
  assert.deepEqual([column("lesson"), column("other"), column("af"), column("dof"), column("single")], [0, 0, 1, 1, 2]);
  // 가지는 뻗어 나온 개념 가까이에 붙습니다.
  const y = (id: string) => layout.positions.get(id)!.y;
  assert.ok(Math.abs(y("single") - y("af")) < Math.abs(y("single") - y("other")));
});
