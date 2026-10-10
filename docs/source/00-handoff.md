# Digital Buku Pink: Session Handoff for Claude Code

Date: 2026-10-11. Source: Claude Doc https://claude.ai/code/artifact/29309778-cc1e-4886-9de7-42ac836d5e7d

Anything labelled "proposal" or "my judgment" is Claude's reasoning from a planning session, not a verified fact.

## Project snapshot

Planned solo project: a mobile app for mothers and a web dashboard for nurses, supporting antenatal care at Malaysian Klinik Kesihatan. The owner is a solo developer with no clinic access yet and zero budget. First deliverable: Option A, a fictional-data prototype of QR check-in, a queue and staff-controlled room assignment. Stack, scope, cut order and data rules: see `03-option-a-scope.md` and `CLAUDE.md`.

Research facts the design leans on (re-verify before quoting externally):
- MOH Perinatal Care Manual, 4th edition (May 2023): booking visit before 12 weeks, visit schedule (Table 2.1), optional virtual consultation for low-risk mothers.
- MOH CCMS queue system: 412 clinics at end-2025, 137 more planned for 2026; figures differ between sources.
- MySejahtera lists 18 service types for booking. A ministry statement (Jul 2026) says 81% are seen within 60 minutes at CCMS sites.
- A digital pink book was announced in 2022; no evidence of launch was found.
- PDPA Amendment Act 2024 (gazetted 17 Oct 2024, phased in 2025): breach notification, data protection officers, penalties up to RM1m and 3 years.
- Fetal movement counting (Cardiff count-to-ten from 28 weeks) is in the manual, but WHO 2016 advises routine counting only in research. It is out of scope for the prototype.

## Failure autopsy (stress-test of the original plan)

Original plan: build everything in month 1, market to the ministry in month 2, scale afterwards. Verdict: fatally flawed as ordered, because no step lets a real clinic or nurse say no before month 3. This is a constructed post-mortem; the ranking is judgment, not data.

| # | Cause of death | The assumption | First warning sign |
| --- | --- | --- | --- |
| 1 | Built for a workflow nobody checked | The counter workflow can be designed from the manual and websites | By 25 Oct zero observation visits booked |
| 2 | A fictional-data demo can't carry a ministry pitch | Attention creates adoption | First official asks which clinic uses it and what changed |
| 3 | One-month build impossible for one person | Knowing the stack makes integration fast | Freeze rule broken by end of week 2 |
| 4 | Attention goes to other ventures (shop, renovation, family) | Time will appear | A week with no commit that nobody notices |
| 5 | Incumbent systems (CCMS, MySejahtera) already cover the pain | Queue chaos is the pain point | A nurse says "this is just a number system" |
| 6 | Approval wall | One supportive nurse can start a pilot | "Who will sign this?" |
| 7 | Two-sided cold start with zero budget | Free tooling is enough until a stranger needs it | "Where do I download it?" |

Most likely: #3. Most dangerous: #6 (with #2 as its other face). Hidden assumption: that the bottleneck is persuasion; it is permission, a champion with signing authority, and evidence.

## Revised plan (week 1 = Monday 12 Oct 2026)

| Phase | Weeks and dates | What happens | Exit gate |
| --- | --- | --- | --- |
| 0 Access and validation | W1 to W3 (12 Oct to 1 Nov), no production code | Observe check-in and queue at 2+ clinics or interview nurses. Find the approval path for third-party software. Look for a sponsor. Log real free hours daily | G0 on 2 Nov |
| 1 Thin build | W4 to W9 (2 Nov to 13 Dec) | Build only what Phase 0 showed is a real pain. Cut order pre-applied. Mother side as Ionic PWA. Synthetic data. Cheap VPS (proposal) | Hard stop at W9: every Must item done or stop |
| 2 Evidence | W10 to W14 (14 Dec to 17 Jan) | Timed walkthroughs with real nurses; written approval requirements; written expression of interest | 3+ nurses timed, 1 written statement |
| 3 Pilot request | W15 to W20 (18 Jan to 28 Feb) | Submit via the channel found in Phase 0, with sponsor, one-page PDPA summary and paper-fallback plan | Written acknowledgement within 3 weeks |
| 4 Pilot or decision | W21 to W26 (1 Mar to 11 Apr) | Minimal pilot within approved data limits, or a written stop-or-pivot decision | Decision recorded |

## Pre-launch checklist (Gate G0)

Thresholds are proposals; set your own before observing and do not move them afterwards. A polite "maybe" counts as a no.

| # | Verify | Walk away if |
| --- | --- | --- |
| 1 Clinic access | Approach about 10 clinics, district offices or contacts in three weeks; count observation visits allowed | None allow observation and nobody can name who could authorise it |
| 2 Real pain, not already solved | At 2+ clinics ask five nurses what goes wrong at check-in and queueing, unprompted; note whether CCMS or MySejahtera already covers it | Fewer than 3 of 5 name a problem, or every observed clinic already runs a queue staff are content with |
| 3 Legal path for third-party software | Ask the sponsor or district contact what approval a clinic needs and whether a no-patient-names pilot is allowed | Only MOH-built or MOH-procured systems, with no pilot, sandbox or exception route |
| 4 Hours match the build | Total real logged free hours over three weeks; multiply the average by six weeks and compare with the 10-week scope | Hours cannot deliver the thin build by week 9: shrink to a side project or stop |

## Rival analysis and defences

A health-tech vendor with a company, private-clinic customers and a district contact could: reach the sponsor first; ask the accountability questions (who answers for a breach, where is data stored, who answers at 2 am) in front of the sponsor; copy a publicised idea; counter with a complete proposal and a free no-install pilot the week the pilot request lands; or befriend the developer, collect the validated notes and hand the requirements to the sponsor or the CCMS team.

Defences: (1) share requirements and findings only under a signed pilot agreement or a written statement that the work is yours; (2) choose the code licence before anyone sees the code; (3) close the accountability gap early with a company or named partner, a hosting statement and a data-protection contact.

## Tripwires (week 1 starts Monday 12 Oct 2026)

Thresholds are proposals; adjust before data exists. Anything you cannot fill in on the weekly sheet counts as red.

| # | Failure mode | Measurable signal | Red tripwire | Check date |
| --- | --- | --- | --- | --- |
| 1 | Unvalidated workflow | Observation visits scheduled, then clinics observed and nurses interviewed | 0 scheduled; then fewer than 2 clinics observed or fewer than 5 nurses interviewed | Sun 25 Oct, Sun 1 Nov |
| 2 | Demo can't carry a pitch | Nurses timed; written expressions of interest from a named person with authority | Fewer than 3 nurses timed, or 0 written statements | Sun 20 Dec, Sun 17 Jan |
| 3 | Impossible build | Must items done against the frozen list; items added after freeze | Under 50% of Must items done, or 3+ items added after freeze | Sun 22 Nov; hard stop Sun 13 Dec |
| 4 | Attention taken by other ventures | Hours logged vs declared weekly target; commits per week | A week under 50% of target, 2 weeks in a row under 75%, or a week with zero commits | Every Sunday from 18 Oct; review Sun 1 Nov |
| 5 | Incumbent systems | Observed clinics already running a working queue; nurses naming a problem unprompted | Every observed clinic has a working queue and fewer than 3 of 5 nurses name a problem | Sun 1 Nov; re-test Sun 17 Jan |
| 6 | Approval wall | Named office, person and document or step needed for third-party software | No named path by the gate; or no written acknowledgement within 3 weeks of the pilot request | Sun 1 Nov (G0); Sun 28 Feb |
| 7 | Cold start and distribution | Outsiders completing check-in unaided on their own phone (iOS and Android); hosting cost and downtime | Fewer than 4 of 5 succeed, any outage in a demo slot, or monthly cost over the cap | Sun 13 Dec |

Rules: one red, stop that phase and rerun the matching check. Two reds at once, walk-away review that day. Failures 1 and 6 together mean no access and no route in, and the plan is dead as written. Log hours first, because tripwire 4 hides the others.

Inputs still missing: the weekly hours target (tripwire 4) and the monthly hosting cost cap (tripwire 7).

## Open items

- Set the weekly hours target and the monthly hosting cap.
- Verify FCM free-tier terms, and current Apple and Google developer account fees, before any store plan.
- Confirm the approval channel for third-party clinic software with a real contact (district or state office route is an inference).
- Choose a code licence before sharing the repo.
- Read MOH Perinatal Care Manual Appendix 2 and 3 (risk colour coding); not read so far.
- Known inconsistencies: Option C scores 32 in the feasibility report and 33 in the validation report; CCMS rollout figures differ between sources.
