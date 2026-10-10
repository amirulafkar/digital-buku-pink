# Option A System Specification — User flows

Source: Claude Doc "Option A System Specification", tab User flows, https://claude.ai/code/artifact/ed5a3cb3-2edb-4e6d-ac36-fc7021e61af0

Flows are a proposed design for the fictional-data prototype, not an approved clinic workflow. Each flow cites the requirements it satisfies.

## UF-01 Account activation (FR-01, FR-15)

```mermaid
sequenceDiagram
  actor N as Nurse
  actor M as Mother
  participant A as Mobile app
  participant S as API
  N->>S: Request activation code for patient
  S-->>N: One-time code (expires)
  N->>M: Gives code in person
  M->>A: Enters code and new password
  A->>S: POST /auth/activate
  S-->>A: Account active
  S->>S: Write audit entry
```

Alternative: wrong or expired code shows an error and asks her to see staff.

## UF-02 Mother checks in by QR (FR-02, FR-03, FR-13)

```mermaid
sequenceDiagram
  actor M as Mother
  participant A as Mobile app
  participant S as API
  participant W as Nurse dashboard
  M->>A: Taps Check in and scans clinic QR
  A->>S: POST /checkins with token and idempotency key
  S->>S: Validate token, account, clinic, appointment
  alt token expired or invalid
    S-->>A: Rejected with message
  else already checked in today
    S-->>A: Existing queue number
  else valid
    S->>S: Create queue entry, audit entry
    S-->>A: Queue number and status waiting
    S-->>W: Live update: new arrival
  end
```

## UF-03 Nurse manages the queue (FR-05, FR-06, FR-07, FR-11)

```mermaid
flowchart TD
  A[Nurse opens queue board] --> B[Sees arrivals: number, name, type, status]
  B --> C[Confirms arrival and selects entry]
  C --> D{Urgent concern?}
  D -- Yes --> E[Set urgent flag with reason]
  D -- No --> F[Normal order]
  E --> G[Choose room, nurse or service]
  F --> G
  G --> H[Set status: called, then in room]
  H --> I[Mother's app updates]
  I --> J[Visit proceeds per clinic workflow]
  J --> K[Set status completed]
  K --> L[Audit entries written for each step]
```

## UF-04 Walk-in or no smartphone (FR-04)

```mermaid
flowchart TD
  A[Mother arrives without app or phone] --> B[Counter staff search patient]
  B --> C{Found?}
  C -- Yes --> D[Staff check in at counter]
  C -- No --> E[Staff create walk-in entry with display name]
  D --> F[Queue entry created: W number]
  E --> F
  F --> G[Appears on dashboard like any other arrival]
  G --> H[Staff tell mother her number verbally or by printed slip]
```

## UF-05 Exceptions

| ID | Situation | Behaviour | Requirement |
| --- | --- | --- | --- |
| UF-05a | Invalid or expired QR | App shows a clear error and a prompt to ask staff; nothing is created | FR-03 |
| UF-05b | Duplicate check-in or retry | Existing queue number returned | FR-13 |
| UF-05c | Forgotten password | Staff issue a reset code after ID check; old sessions revoked | FR-15 |
| UF-05d | Wrong clinic | Refused; message says to see staff | FR-02 |
| UF-05e | No internet | App shows an offline banner and the last known status; mother goes to counter | NFR-05 |
| UF-05f | Urgent concern | App notice tells her to speak to staff or go to hospital; staff may flag urgent and move her ahead with a reason | FR-07, FR-12 |
| UF-05g | Nurse or room unavailable | Staff reassign; mother sees the new room | FR-06 |
| UF-05h | Mother misses her turn | Staff mark missed; may reopen; no penalty | FR-14 |
| UF-05i | System downtime | Clinic uses the paper queue; entries re-keyed afterwards if wanted | NFR-06 |
| UF-05j | Lost phone | Admin revokes the device; mother re-activates with a new code | FR-15 |

## UF-06 Screen navigation

Mobile: Activate or log in, then Home (next appointment, Check in button, safety notice), Scan QR, Confirmation, Live status, Notifications, Settings. Staff web: Log in, Queue board (default), Manual check-in, Patient search, Assignment dialog, Activation codes, Audit log (admin). Wireframes for each screen are in `docs/wireframes/`.
