import test from "node:test";
import assert from "node:assert/strict";
import { filterLearnerContent } from "../src/learning-access.js";

test("shows school-wide published lessons and lessons from active enrolled classes", () => {
  const visible = filterLearnerContent([
    { id: "school", status: "published", class_id: null },
    { id: "class-a", status: "published", class_id: "class-a" },
    { id: "class-b", status: "published", class_id: "class-b" },
  ], ["class-a"]);

  assert.deepEqual(visible.map((item) => item.id), ["school", "class-a"]);
});

test("never shows drafts or lessons for another class", () => {
  const visible = filterLearnerContent([
    { id: "draft-school", status: "draft", class_id: null },
    { id: "draft-class", status: "draft", class_id: "class-a" },
    { id: "other-class", status: "published", class_id: "class-b" },
  ], ["class-a"]);

  assert.deepEqual(visible, []);
});

test("shows only school-wide content when the learner has no active class enrollment", () => {
  const visible = filterLearnerContent([
    { id: "school", status: "published", class_id: null },
    { id: "class-a", status: "published", class_id: "class-a" },
  ], []);

  assert.deepEqual(visible.map((item) => item.id), ["school"]);
});
