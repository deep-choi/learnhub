import assert from "node:assert/strict";
import test from "node:test";
import { compareAnswers } from "../src/utils/answerComparison.ts";

test("normalizes Unicode and whitespace for exact answers", () => {
  assert.equal(compareAnswers("  ４  ", "4"), "correct");
  assert.equal(compareAnswers("−4", "-4"), "correct");
  assert.equal(compareAnswers("4 kg", "4kg"), "unknown");
  assert.equal(compareAnswers("X", "x"), "unknown");
  assert.equal(compareAnswers("x²", "x2"), "unknown");
});

test("accepts safe decimal and fraction equivalence", () => {
  assert.equal(compareAnswers("0.5", "1 / 2"), "correct");
  assert.equal(compareAnswers("-3/4", "-0.75"), "correct");
  assert.equal(compareAnswers("0.30000000000000004", "0.3"), "incorrect");
});

test("returns incorrect for known unequal finite numbers", () => {
  assert.equal(compareAnswers("2", "3"), "incorrect");
  assert.equal(compareAnswers("1/2", "2/3"), "incorrect");
  assert.equal(compareAnswers("9007199254740992", "9007199254740993"), "incorrect");
});

test("does not turn uncertain symbolic answers into wrong answers", () => {
  assert.equal(compareAnswers("x = 4", "4"), "unknown");
  assert.equal(compareAnswers("", "4"), "unknown");
  assert.equal(compareAnswers("1/0", "Infinity"), "unknown");
});
