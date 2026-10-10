# Gate G0 evidence log

**Gate G0 status: NOT PASSED.** Only the human writes "G0 passed" or "G0 waived: <reason>" in `docs/work/status.md`. No agent marks G0 passed.

Source of thresholds: `docs/source/00-handoff.md`, section "Pre-launch checklist (Gate G0)". These thresholds are proposals. Do not change them after observation starts.

Rules for entries:
- Date, clinic code (e.g. KK-A, KK-B), role, what was said or seen, and the G0 check it supports. No names, IC numbers or patient details.
- Quote the words as close to verbatim as possible. Mark paraphrase as "(paraphrase)".
- A polite "maybe" is recorded as **no**.
- Status for each claim: supported / contradicted / unverified.

---

## Per-check pass criteria

| Check | Pass criteria (proposal, from handoff) | Walk away if | Evidence needed |
| --- | --- | --- | --- |
| 1 Clinic access | Approach about 10 clinics, district offices or contacts in 3 weeks. At least 2 clinics allow observation, or a named person can authorise it in writing | None allow observation and nobody can name who could authorise it | Dated contact log (clinic code, role, outcome), written permission for each observation visit |
| 2 Real pain, not already solved | At 2+ clinics, 5 nurses asked unprompted about check-in and queue problems. At least 3 of 5 name a problem. Note whether CCMS or MySejahtera already covers it | Fewer than 3 of 5 name a problem, or every observed clinic already runs a queue staff are content with | Interview and observation logs; count of unprompted problems; CCMS/MySejahtera coverage notes |
| 3 Legal path for third-party software | Named office, person and document or step a clinic needs for third-party software. Whether a no-patient-names pilot is allowed, in writing if possible | Only MOH-built or MOH-procured systems, with no pilot, sandbox or exception route | Written or dated statement from sponsor or district contact; name of office and form |
| 4 Real free hours | Total real logged free hours over 3 weeks. Multiply the weekly average by 6 weeks and compare with the 10-week scope | Hours cannot deliver the thin build by week 9: shrink to a side project or stop | Daily hours log (date, hours, what was done). Weekly target still missing in `status.md` |

Note on check 4: the weekly hours target is not yet set in `docs/work/status.md` ("(fill in)"). The check cannot be scored until it is.

---

## Evidence log

Add one row per observation, interview or contact. Use the ID format `E-001`, `E-002`, and so on. Do not reuse IDs.

| ID | Date | Clinic code | Person role | What was said or seen (verbatim or noted) | Source type (interview / observation / contact / document) | G0 check (1/2/3/4) | Status (supported / contradicted / unverified) | Notes (no identifiers) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | | |
| | | | | | | | | |
| | | | | | | | | |

---

## Running tally (update weekly)

| Check | Entries supporting | Entries contradicting | Status |
| --- | --- | --- | --- |
| 1 Clinic access | 0 | 0 | unverified |
| 2 Real pain | 0 | 0 | unverified |
| 3 Legal path | 0 | 0 | unverified |
| 4 Real free hours | 0 | 0 | unverified (target not set) |

---

## Sunday checkpoints (Mon 12 Oct 2026 to G0 decision Mon 2 Nov 2026)

Week 1 starts Monday 12 Oct 2026 (per `docs/WORKFLOW.md` and `00-handoff.md`). Sundays in the window:

| Date | Checkpoint | Tripwire(s) to check (from `00-handoff.md`) | Done? |
| --- | --- | --- | --- |
| Sun 18 Oct 2026 | Hours and commits review (first weekly update) | 4 (hours), start of weekly tripwire log | |
| Sun 25 Oct 2026 | Observation visits scheduled vs held. Red if 0 scheduled | 1 (unvalidated workflow) | |
| Sun 1 Nov 2026 | Clinics observed (red if fewer than 2) and nurses interviewed (red if fewer than 5). Incumbent systems check. Access and approval path check (G0 input) | 1, 4, 5, 6 | |
| Mon 2 Nov 2026 | **G0 decision (human only)** | All four G0 checks | |

Reminder: one red, stop Phase 0 and rerun the matching check. Two reds, walk-away review that day.

---

## Sign-off (human only)

- G0 decision: ______ (passed / waived / not passed)
- Date: ______
- Reason (if waived): ______
- Recorded in `docs/work/status.md`: [ ]
