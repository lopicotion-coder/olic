# My School — Engagement and Retention UX

Status: Product/UX implementation specification  
Working branch: `feature/platform-expansion-plan`  
Audience: Student, parent, teacher, school operator and platform operator  
Primary principle: make every return visit useful; do not maximize screen time as an independent goal.

## 1. Product outcome

My School should become a learning environment students choose to return to because it helps them understand their curriculum, practice the right skills, notice measurable progress and feel supported.

The product must not use dark patterns to keep minors online. We will optimize for **learning value, healthy retention and task completion**, not raw minutes in the app, endless scrolling, compulsive streak protection or notification volume.

For each role, the experience should reduce friction:
- Students: help them decide what to learn next and make progress visible.
- Parents: provide a quick, trustworthy picture of progress and useful next steps.
- Teachers: reduce repetitive work and surface students who need support.
- School administrators: make routine operations fast and predictable.
- Platform operators: expose actionable health, cost, quality and growth signals.

A student should be able to finish a useful session, understand what they achieved and leave without feeling punished.

## 2. Student experience — the daily learning loop

The student home should answer three questions without requiring exploration:
1. Where am I now?
2. What is the most useful next step?
3. What will I gain by completing it?

### 2.1 Personal learning home

Priority order:
1. A warm, contextual greeting and one primary **Continue / Start here** action.
2. The next recommended activity, with a plain-language reason (for example: "Let's practise this concept because recent answers show it needs reinforcement").
3. Subject-level progress based only on verified attempts and approved curriculum mappings.
4. Upcoming school work or exams, when real records are available.
5. Recent achievements and a small set of optional secondary actions.

Do not show empty charts, fake streaks, invented percentages, placeholder XP, guessed weakness labels or generic "you are falling behind" messages. When there is not enough evidence, say so and recommend a short diagnostic practice instead.

### 2.2 The next-best-action engine

Recommendations must be explainable and deterministic before they are AI-personalized:
- Use approved questions and the student's actual attempts.
- Prefer concepts with low mastery and sufficient evidence.
- Consider confidence and evidence count; one wrong answer is not proof of a weakness.
- Respect country, curriculum, grade, subject, edition and school-specific learning policy.
- Avoid repeating an item the student has just answered.
- If evidence is insufficient, recommend a short diagnostic set rather than asserting a weakness.
- Always provide a "choose another subject" path so the student remains in control.

Every recommendation should show a short reason. AI may phrase or enrich the explanation, but must not invent the underlying mastery facts.

### 2.3 Structured sessions

Practice should feel purposeful, not endless:
- Offer small, bounded sets (for example 5–8 questions where supported).
- Show progress within the set and clear completion.
- After each answer, give useful feedback and a path to review the relevant concept.
- At the end, summarize what was practised, what improved and one sensible next step.
- Offer "continue", "review lesson" or "finish for now"; never make continuation the only prominent choice.
- Suggest breaks after sustained activity and respect the student's decision to stop.

The existing adaptive practice flow already obtains a bounded set of up to eight questions. Build on that actual behavior rather than inventing an infinite feed.

### 2.4 Visible progress and motivation

Use progress indicators that represent learning:
- Mastery by concept and subject.
- Evidence count/confidence where understandable.
- Improvement across comparable assessments.
- Completed practice sets and meaningful milestones.
- XP for learning effort/mastery, kept separate from redeemable Gems.

Reward quality, consistency and improvement—not raw answer volume or screen time. Never remove earned progress because a student takes a break or misses a day. Streaks, when implemented, should be forgiving (for example, weekly consistency rather than daily punishment) and optional.

### 2.5 Age-appropriate social motivation

Competitions and leaderboards are later-stage features. Defaults should protect minors:
- Private progress by default.
- No public display of full names, school/class or sensitive performance.
- School/class/friend leaderboards only with appropriate permissions and safeguarding.
- Moderation, reporting and opt-out controls.
- Reward progress and improvement, not only top scores.
- No public shaming, countdown pressure or pay-to-win advantages.

## 3. Parent experience

The parent home should be useful in under a minute:
- A concise summary per linked child.
- Recent learning activity and verified progress.
- Concepts that may need support, with evidence and careful wording.
- Upcoming assessments or assignments when available.
- A small suggested action (for example, ask the child to explain a concept).
- Clear subscription/entitlement status and AI usage where relevant.

Avoid turning the parent dashboard into a surveillance feed. Show educationally relevant information under the parent-child relationship permissions and applicable consent rules.

## 4. Teacher and school experience

The goal is faster, more informed action—not longer sessions:
- Teacher landing page: today's classes, pending grading, upcoming work and students who may need review.
- Class insights: aggregated patterns, not unsupported judgments about individuals.
- One-click paths to create or review assignments and assessments.
- Bulk actions and imports for repetitive work.
- School dashboard: attendance, academic progress and operational exceptions that require attention.
- Every metric must link to its source records and respect tenant/school/class permissions.

## 5. Product writing and interaction patterns

- Use clear Arabic RTL copy by default, with accessible English support.
- Give each screen one visually clear primary action.
- Explain why a recommendation appears.
- Use positive, specific feedback ("You improved in…") rather than pressure ("Don't lose your streak!").
- Keep navigation predictable and preserve context when moving between sections.
- Provide useful empty states that explain how to get started.
- Respect reduced motion, keyboard navigation, contrast and responsive mobile layouts.
- Avoid autoplay, infinite scroll, fake scarcity, manipulative countdowns, guilt messaging and forced notifications.

## 6. Notifications and return visits

Notifications should bring users back for a meaningful reason:
- Assignment or assessment due dates.
- A student-requested study reminder.
- A parent-approved important learning summary.
- A teacher or school message.
- A genuinely useful review recommendation, with frequency caps.

Controls:
- Per-category preferences.
- Quiet hours and timezone-aware delivery.
- Frequency caps and deduplication.
- No notifications designed solely to increase opens.
- No repeated reminders after dismissal.
- Age-appropriate consent and guardian controls where required.

## 7. Ethical engagement and measurement

### North-star measures
- Weekly active learners completing a meaningful learning action.
- Learning improvement on comparable, validated assessments.
- Return rate after a useful feedback/review experience.
- Student retention (D7/D30) segmented by cohort and plan.
- Completed learning sessions and next-step acceptance.
- Parent/teacher actions that lead to useful support.

### Guardrail measures
- Unproductive or unusually long sessions.
- Repeated wrong-answer loops or question fatigue.
- Notification opt-outs, dismissals and complaints.
- Break prompts dismissed repeatedly.
- AI cost per paying learner and contribution margin.
- Accessibility failures and safeguarding incidents.

Do not use total time-in-app as the north-star metric. Session duration is diagnostic only and must be interpreted alongside learning outcomes and session completion.

## 8. Progressive implementation plan

### P0 — improve the current student learning screen
- Replace the table-first student landing experience with a learning home.
- Add one data-backed next action using existing mastery and track records.
- Explain the reason for the recommendation.
- Preserve subject selection and the existing adaptive practice RPC.
- Add clear practice-set progress, completion and a "finish for now" state.
- Keep parent/admin views distinct; do not expose student-only actions to them.

### P1 — evidence-based progress
- Build a real timeline from persisted attempts and assessment records.
- Add subject progress and comparison over time only where records support it.
- Add lesson review links using curriculum evidence.
- Add session summaries from actual results.
- Establish the data model for XP separately from Gems before showing either.

### P2 — healthy motivation
- Add optional weekly goals and forgiving consistency milestones.
- Add privacy-preserving competitions with moderation and opt-out.
- Add notification preferences, quiet hours and frequency caps.
- Add parent summaries with consent-aware access.

### P3 — validated personalization
- Evaluate recommendation quality against student outcomes.
- Use AI only where it improves explanations or planning beyond deterministic rules.
- A/B test clarity and usefulness, not manipulative engagement mechanics.
- Roll out by cohort and curriculum after quality, privacy and cost checks.

## 9. Data integrity and release gates

- No fabricated sample data in production screens.
- Do not infer a student's weakness from a single answer.
- Never expose protected answer keys in browser queries.
- Every student action must be authorized server-side and tested under RLS.
- Persisted progress must be attributable to a real attempt/assessment and have an audit trail.
- Rewards require a server-side ledger and idempotent issuance; no client-side balance updates.
- Verify parent-child permissions, school isolation and learner identity before launch.
- Test Arabic RTL, mobile layouts, keyboard access, reduced motion and age-appropriate copy.
- Do not launch streaks, leaderboards, referrals or notifications until their abuse, consent and privacy controls are implemented.

## 10. Immediate design decision

The current student learning area already reads `student_skill_mastery`, obtains tracks through `get_student_learning_tracks`, and starts bounded adaptive practice through `get_adaptive_practice_set`. The first iteration should use these verified records to deliver a clear next learning action. It must not invent streaks, time-on-task totals, XP, Gems or lesson-completion data that the frontend cannot currently load from a trusted source.
