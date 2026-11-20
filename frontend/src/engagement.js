export function getNextLearningAction({ tracks = [], mastery = [], conceptsById = {} } = {}) {
  if (!Array.isArray(tracks) || tracks.length === 0) return null;

  const candidates = (Array.isArray(mastery) ? mastery : [])
    .map((row) => {
      const concept = conceptsById?.[row.concept_id];
      const score = Number(row.mastery_score);
      const confidence = Number(row.confidence_score);
      const evidenceCount = Number(row.evidence_count);
      if (!concept || !Number.isFinite(score) || !Number.isFinite(confidence)) return null;
      if (!Number.isFinite(evidenceCount) || evidenceCount < 2 || confidence < 0.5) return null;
      if (!concept.subject_code || !concept.grade_code) return null;
      const track = tracks.find((item) =>
        item.student_id === row.student_id
        && item.subject_code === concept.subject_code
        && item.grade_code === concept.grade_code
      );
      if (!track) return null;
      return { row, concept, track, score, confidence, evidenceCount };
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score || b.evidenceCount - a.evidenceCount);

  if (candidates.length) {
    const best = candidates[0];
    return {
      kind: "reinforce",
      track: best.track,
      trackValue: [best.track.student_id, best.track.subject_code, best.track.grade_code].join("|"),
      conceptTitle: best.concept.title,
      subjectCode: best.concept.subject_code,
      gradeCode: best.concept.grade_code,
      masteryPercent: Math.round(best.score * 100),
      evidenceCount: best.evidenceCount,
      reason: "إجاباتك السابقة تشير إلى أن هذا المفهوم يستحق تدريبًا إضافيًا.",
    };
  }

  const track = tracks[0];
  return {
    kind: "diagnostic",
    track,
    trackValue: [track.student_id, track.subject_code, track.grade_code].join("|"),
    conceptTitle: null,
    subjectCode: track.subject_code,
    gradeCode: track.grade_code,
    masteryPercent: null,
    evidenceCount: 0,
    reason: "لسه مفيش أدلة كافية نحدد بها نقطة تحتاج تقوية؛ جلسة قصيرة هتساعدنا نفهم مستواك.",
  };
}
