import assert from "node:assert/strict";
import test from "node:test";
import { createSimulation, seedPositions, type SimNode } from "../src/components/graph/forceLayout";
import { buildCourseFromPayload, previewGraph, unwrapCurriculum } from "../src/components/graph/courseFromPayload";
import { stepTitle, templateNudge } from "../src/components/graph/nextStepText";
import { josa, quoted, withJosa } from "../src/components/graph/korean";
import type { KnowledgeGraph } from "../src/components/graph/graphTypes";

const makeNodes = (count: number): SimNode[] =>
  seedPositions(count).map((point, index) => ({ id: `n${index}`, x: point.x, y: point.y, vx: 0, vy: 0, r: 5 }));

test("force layout is deterministic and keeps nodes apart", () => {
  const run = () => {
    const nodes = makeNodes(8);
    const links = nodes.slice(1).map((node) => ({ source: "n0", target: node.id }));
    createSimulation(nodes, links).settle();
    return nodes;
  };
  const first = run();
  const second = run();
  assert.deepEqual(first.map((n) => [n.x, n.y]), second.map((n) => [n.x, n.y]));
  for (let i = 0; i < first.length; i += 1) {
    for (let j = i + 1; j < first.length; j += 1) {
      assert.ok(Math.hypot(first[i].x - first[j].x, first[i].y - first[j].y) > 6);
    }
  }
});

test("pinned nodes do not move", () => {
  const nodes = makeNodes(4);
  nodes[0].fx = 100;
  nodes[0].fy = -50;
  createSimulation(nodes, [{ source: "n0", target: "n1" }]).settle();
  assert.equal(nodes[0].x, 100);
  assert.equal(nodes[0].y, -50);
});

const envelope = {
  preview: true,
  curriculum: {
    courseTitle: "낚시 입문",
    learningType: "practical",
    learningTypeExplanation: "직접 해보는 주제예요.",
    summary: "낚시의 기본을 익혀요.",
    chapters: [
      {
        title: "준비",
        description: "장비와 매듭",
        lessons: [
          { title: "채비 고르기", description: "d", estimatedMinutes: 10, conceptId: "c1", conceptName: "채비" },
          { title: "매듭 묶기", description: "d", estimatedMinutes: 10, conceptId: "c2", conceptName: "매듭" },
        ],
      },
    ],
  },
  conceptLinks: { domain: "낚시", lessons: [{ conceptName: "매듭", prerequisites: ["채비"], relatedConcepts: ["바늘"] }] },
};

test("preview envelope builds a course and a graph with AI links", () => {
  assert.ok(unwrapCurriculum(envelope));
  const { course, links } = buildCourseFromPayload(envelope, "낚시 입문", { level: "beginner", goal: "원리 탐구", dailyMinutes: 15 }, 1000);
  assert.equal(course.learningType, "practical");
  assert.equal(links.domain, "낚시");
  assert.equal(links.lessons?.[1].lessonId, course.chapters[0].lessons[1].id);
  const graph = previewGraph(course, links);
  assert.deepEqual(graph.nodes.map((n) => n.name).sort(), ["매듭", "바늘", "채비"].sort());
  assert.ok(graph.nodes.every((n) => n.state === "unseen" && n.domain === "낚시"));
  assert.ok(graph.edges.some((e) => e.kind === "prerequisite" && e.from === "채비" && e.to === "매듭"));
  assert.ok(graph.edges.some((e) => e.kind === "related"));
});

test("a flat analyze-subject response without conceptLinks still builds links from lesson fields", () => {
  const flat = JSON.parse(JSON.stringify(envelope.curriculum));
  flat.chapters[0].lessons[1].prerequisites = ["채비"];
  const { links } = buildCourseFromPayload(flat, "낚시 입문", { level: "beginner", goal: "g", dailyMinutes: 15 });
  assert.deepEqual(links.lessons?.[1].prerequisites, ["채비"]);
});

test("template nudge is neutral until the lesson is understood", () => {
  const graph: KnowledgeGraph = {
    version: 1,
    nodes: ["통분", "분수 비교"].map((name) => ({ id: name, name, aliases: [], domain: "수학", courseRefs: [], state: "unseen" as const, createdAt: "" })),
    edges: [],
  };
  const steps = [{ kind: "connected" as const, conceptId: "분수 비교", becauseOfConceptId: "통분", score: 1 }];
  const reading = templateNudge(graph, "통분", steps, false)!;
  assert.equal(reading.question, "다 읽었다면 다음엔 ‘분수 비교’를 해볼까요?");
  assert.ok(!/이해했으니|방금 배운/.test(reading.question + reading.reason));
  assert.equal(reading.reason, "지금 보는 ‘통분’과 바로 이어져요.");
  const done = templateNudge(graph, "통분", steps, true)!;
  assert.equal(done.question, "‘통분’을 이해했으니, 이번엔 ‘분수 비교’를 해볼까요?");
  assert.equal(done.reason, "방금 배운 ‘통분’과 바로 이어져요.");
  assert.equal(stepTitle(graph, steps[0]), "‘분수 비교’ 배우기");
  assert.equal(templateNudge(graph, "통분", [{ kind: "wrap_up", score: 1 }]), null);
});

test("josa follows the final sound of the preceding word", () => {
  assert.equal(withJosa("낚시 안전 수칙", "을/를"), "낚시 안전 수칙을");
  assert.equal(withJosa("낚시", "을/를"), "낚시를");
  assert.equal(quoted("낚시 안전 수칙", "을/를"), "‘낚시 안전 수칙’을");
  assert.equal(quoted("낚시 안전 수칙", "와/과"), "‘낚시 안전 수칙’과");
  assert.equal(quoted("채비", "와/과"), "‘채비’와");
  assert.equal(josa("매듭", "이/가"), "이");
  assert.equal(josa("바늘", "으로/로"), "로");
  assert.equal(josa("물때", "은/는"), "는");
  assert.equal(josa("파이썬", "이/가"), "이");
  assert.equal(josa("3", "이/가"), "이");
  assert.equal(josa("2", "이/가"), "가");
  assert.equal(josa("(C)", "이/가"), "가");
});

test("force layout spreads a small map instead of piling nodes up", () => {
  const nodes = makeNodes(10);
  const links = nodes.slice(1).map((node, index) => ({ source: nodes[Math.floor(index / 2)].id, target: node.id }));
  createSimulation(nodes, links, { linkDistance: 70, repulsion: 2400, gravity: 0.02 }).settle(400);
  let nearest = Infinity;
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) nearest = Math.min(nearest, Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y));
  }
  assert.ok(nearest > 30, `nodes too close: ${nearest}`);
  const cx = nodes.reduce((sum, n) => sum + n.x, 0) / nodes.length;
  const cy = nodes.reduce((sum, n) => sum + n.y, 0) / nodes.length;
  assert.ok(Math.hypot(cx, cy) < 40, `layout drifted off center: ${cx},${cy}`);
});
