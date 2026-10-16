import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PANE_WIDTH, MAX_PANE_WIDTH, MIN_PANE_WIDTH, clampPaneWidth, closeTab, defaultLayout, openTab, sanitizeLayout } from "../src/components/workspace/layout";
import { ACTION_LABEL, buildStepText, checkActions, clampStepIndex, closingPrompt, reopenActions, stepActions, stepProgressLabel } from "../src/components/lesson/lessonFlow";

const KINDS = ["graph", "notes"];

test("workspace layout defaults to a single graph tab and drops unknown or duplicate tabs", () => {
  assert.deepEqual(defaultLayout("graph"), { tabs: ["graph"], active: "graph", width: DEFAULT_PANE_WIDTH, collapsed: false });
  assert.deepEqual(sanitizeLayout(null, KINDS), defaultLayout("graph"));
  assert.deepEqual(sanitizeLayout({ tabs: ["notes", "ghost", "notes"], active: "ghost", width: 9999, collapsed: true }, KINDS), { tabs: ["notes"], active: "notes", width: MAX_PANE_WIDTH, collapsed: true });
  assert.deepEqual(sanitizeLayout({ tabs: [] }, KINDS), defaultLayout("graph"));
  assert.equal(clampPaneWidth(10), MIN_PANE_WIDTH);
  assert.equal(clampPaneWidth(Number.NaN), DEFAULT_PANE_WIDTH);
});

test("opening a tab selects it and expands the workspace; closing moves to a neighbour and collapses on the last tab", () => {
  const opened = openTab({ ...defaultLayout("graph"), collapsed: true }, "notes");
  assert.deepEqual(opened.tabs, ["graph", "notes"]);
  assert.equal(opened.active, "notes");
  assert.equal(opened.collapsed, false);
  assert.equal(openTab(opened, "notes").tabs.length, 2);
  const closedActive = closeTab(opened, "notes");
  assert.deepEqual(closedActive.tabs, ["graph"]);
  assert.equal(closedActive.active, "graph");
  const closedLast = closeTab(closedActive, "graph");
  assert.deepEqual(closedLast.tabs, []);
  assert.equal(closedLast.active, null);
  assert.equal(closedLast.collapsed, true);
});

test("the lesson starts with its content and the last step offers the check (or the practical did-it chip)", () => {
  assert.equal(stepProgressLabel(0, 4), "(1/4)");
  const first = buildStepText({ index: 0, step: { title: "개념", content: "젖은 수건은 끓이지 않아도 마르죠." } });
  assert.equal(first, "젖은 수건은 끓이지 않아도 마르죠.");
  assert.equal(buildStepText({ index: 1, step: { title: "예시", content: "본문" } }), "## 예시\n\n본문");
  assert.deepEqual(stepActions(0, 4, false).map((a) => a.id), ["next", "easier", "example"]);
  assert.deepEqual(stepActions(3, 4, false).map((a) => a.id), ["check", "skip", "easier", "example"]);
  assert.deepEqual(stepActions(3, 4, true).map((a) => a.id), ["did", "skip", "easier", "example"]);
  assert.equal(stepActions(0, 4, false)[0].label, ACTION_LABEL.next);
  assert.notEqual(closingPrompt(true), closingPrompt(false));
  assert.deepEqual(checkActions(false).map((a) => a.id), ["check", "skip"]);
  assert.deepEqual(reopenActions().map((a) => a.id), ["restart", "ask", "other"]);
});

test("a saved step index is always clamped into the lesson's current step range", () => {
  assert.equal(clampStepIndex(7, 4), 3);
  assert.equal(clampStepIndex(-2, 4), 0);
  assert.equal(clampStepIndex(Number.NaN, 4), 0);
  assert.equal(clampStepIndex(2, 0), 0);
});
