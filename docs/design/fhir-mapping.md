# FHIR mapping note (NFR-12)

Design note only. The prototype has no FHIR endpoint, no integration, no FHIR library and no code for this. It records that the internal model could later map to HL7 FHIR (R4 names used, R5 differences noted). Table and column names are from `docs/source/04c-database-design.md` plus the S2 timestamps in the migration. Fictional data only; not MOH-approved. A real integration would need MOH or clinic approval, a consent and PDPA review, and any national profile or implementation guide that applies (to be confirmed) before any design is fixed.

## Resource map

| Internal table | FHIR resource | Field mapping (proposed) | Not mapped, and why |
| --- | --- | --- | --- |
| `queue_entry` | `Encounter` (queue visit, not a clinical encounter) | `id` -> Encounter.id; `queue_no` + `queue_date` -> identifier (local system, e.g. `urn:dbp:queue-no`); `patient_id` -> subject (Patient); `appointment_id` -> appointment (Appointment); `room_id` -> location (Location); `staff_id` -> participant (Practitioner); `checked_in_at` -> period.start; `completed_at` -> period.end; `source` (qr, staff) -> extension or `class` stays `AMB` | `walk_in_name` (no Patient exists; map to a contained Patient only if a real Patient is later created). `urgent` and `urgent_reason`: see below. `idempotency_key`: internal. |
| `patient` | `Patient` | `id` -> id; `display_name` -> name.text; `language` -> communication.language (`ms`, `en`); `clinic_id` -> managingOrganization (Organization) | `phone`: map to telecom only with consent and after the fictional-data limit is lifted. `is_demo`: prototype-only flag, never exported; a real system drops it with the check constraint. No NRIC identifier exists. |
| `clinic` | `Organization` | `id` -> id; `code` -> identifier; `name` -> name | `timezone`: not an Organization element (belongs to Location or system config). |
| `room` | `Location` | `id` -> id; `name` -> name; `clinic_id` -> managingOrganization; `active` -> status (`active` or `inactive`); physicalType `ro` (room) | None. |
| `staff` + `user_account` (staff side) | `Practitioner` and `PractitionerRole` | `staff.id` -> Practitioner.id; `display_name` -> name.text; `role` (nurse, clinic_admin) -> PractitionerRole.code (local codes); `clinic_id` -> PractitionerRole.organization; `active` -> active | `username`, `password_hash`, lockout fields: authentication data, never exported. |
| `appointment` | `Appointment` | `scheduled_at` -> start; `visit_type` (booking, routine, virtual; label only) -> appointmentType.text; `status` (scheduled, checked_in, cancelled) -> status (`booked`, `arrived`, `cancelled`); `patient_id` -> participant; `clinic_id` -> participant (Location or Organization) | None. Listed because Encounter.appointment needs it. |
| `audit_log` | `AuditEvent` | `at` -> recorded; `actor_user_id` -> agent.who (Practitioner or Patient reference; null = system device); `action` -> type and subtype (table below); `entity` + `entity_id` -> entity.what (Reference); `clinic_id` -> source.site; `ip` -> agent.network.address; `detail` -> entity.detail only if it holds ids and codes (it never holds names, phones or tokens) | None. The append-only rule (NFR-10) is a storage property, not a FHIR element. |

## Queue status to Encounter.status (proposed)

| `queue_entry.status` | R4 `Encounter.status` | R5 name | Note |
| --- | --- | --- | --- |
| waiting | `arrived` | `in-progress` (with a local status extension) | Checked in, not yet called. |
| called | `arrived` | `in-progress` | R4 `triaged` is not used: it implies a clinical triage the system never does. Keep "called" as a local extension or a `statusHistory` entry from `called_at`. |
| in_room | `in-progress` | `in-progress` | Starts at `started_at`. |
| completed | `finished` | `completed` | Ends at `completed_at`. |
| missed | `cancelled` | `cancelled` | A queue miss is not a clinical cancellation. A real design should also set the linked Appointment to `noshow`; confirm with clinic staff first. |

Reopen (missed -> waiting) is not built (FR-14 cut), so no reverse mapping is needed.

## Audit action to AuditEvent (proposed)

| `audit_log.action` | AuditEvent type and action |
| --- | --- |
| login_success, login_failure, token_refresh, refresh_reuse_detected, logout, activate, activate_failure | user authentication events; action `E` (execute); outcome success, or failure for login_failure, activate_failure and refresh_reuse_detected |
| checkin, checkin_refused | action `C` (create); outcome 0, or 4 for refused |
| status, assign, urgent | action `U` (update) |
| qr_issue, activation_issue | action `C` |
| activation_revoke | action `U` |
| search | action `E`; `entity.detail` holds only the result count, never the query text |

These are proposals; check the AuditEvent value sets at design time. Action names are those written by the API today.

## Rules a real mapping must keep

- Staff control: the urgent flag is staff-set with a fixed reason code. Do not map it to `Encounter.priority`, which is a clinical concept. Prefer a local extension, and never compute it.
- No estimated waiting time: there is nothing to map, and no FHIR element should be filled with one (for example do not derive `length` or `Slot` data from queue position).
- No clinical resources (Observation, Condition, Procedure, CarePlan, MedicationRequest) are produced. Clinical tables are intentionally absent and need MOH approval before design.
- Clinic scoping: every resource carries its Organization, and any read endpoint would filter by the caller's clinic exactly as the API does today.
- No endpoint, no export job and no code for this note exists in the repository.
