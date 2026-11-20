import test from "node:test";
import assert from "node:assert/strict";
import { getNextLearningAction } from "../src/engagement.js";

const track = { student_id: "student-1", subject_code: "MATH", grade_code: "G10" };

test("recommends a supported weak concept in the matching student track", () => {
  const action = getNextLearningAction({
    tracks: [track],
    mastery: [
      { student_id: "student-1", concept_id: "c1", mastery_score: 0.42, confidence_score: 0.8, evidence_count: 4 },
      { student_id: "student-1", concept_id: "c2", mastery_score: 0.71, confidence_score: 0.9, evidence_count: 3 },
    ],
    conceptsById: {
      c1: { title: "المعادلات", subject_code: "MATH", grade_code: "G10" },
      c2: { title: "الدوال", subject_code: "MATH", grade_code: "G10" },
    },
  });

  assert.equal(action.kind, "reinforce");
  assert.equal(action.conceptTitle, "المعادلات");
  assert.equal(action.masteryPercent, 42);
  assert.equal(action.trackValue, "student-1|MATH|G10");
});

test("uses a diagnostic practice when evidence is insufficient", () => {
  const action = getNextLearningAction({
    tracks: [track],
    mastery: [
      { student_id: "student-1", concept_id: "c1", mastery_score: 0.2, confidence_score: 0.3, evidence_count: 1 },
    ],
    conceptsById: { c1: { title: "المعادلات", subject_code: "MATH", grade_code: "G10" } },
  });

  assert.equal(action.kind, "diagnostic");
  assert.equal(action.conceptTitle, null);
  assert.equal(action.trackValue, "student-1|MATH|G10");
});

test("does not recommend concepts belonging to another learner", () => {
  const action = getNextLearningAction({
    tracks: [track],
    mastery: [
      { student_id: "student-2", concept_id: "c1", mastery_score: 0.1, confidence_score: 0.9, evidence_count: 8 },
    ],
    conceptsById: { c1: { title: "المعادلات", subject_code: "MATH", grade_code: "G10" } },
  });

  assert.equal(action.kind, "diagnostic");
});

test("returns null when no real learning track is available", () => {
  assert.equal(getNextLearningAction({ tracks: [], mastery: [] }), null);
});
