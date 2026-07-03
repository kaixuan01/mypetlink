# MyPetLink Backend Architecture

High-level architecture reference for the future MyPetLink backend. This document is planning-only and should guide implementation after the backend project is generated.

API base path: `/api/v1`

## System Shape

```txt
Next.js frontend
  -> /api/v1 REST API (.NET 8)
    -> SQL Server via EF Core
    -> File storage provider interface
    -> Google Sign-In validation
    -> future notification providers
```

Core principles:

- Auth is Phase A, not a later hardening pass.
- All protected APIs are built on JWT access tokens and refresh token rotation.
- Public routes use secure random public codes only.
- Public projections are created server-side and privacy-gated.
- Admin mutations write audit logs.
- Uploaded files use provider-neutral `MediaFiles` records.
- Precise scan location is stored only with explicit finder consent.

## Authentication Flow

```mermaid
flowchart TD
    A[Owner opens Login] --> B[Continue with Google]
    B --> C[Frontend receives Google ID token]
    C --> D[POST /api/v1/auth/google]
    D --> E[API validates Google token issuer audience expiry subject]
    E --> F{User exists?}
    F -- No --> G[Create Users row]
    G --> H[Create ExternalLogins row]
    H --> I[Create OwnerProfiles row with Free plan]
    F -- Yes --> J[Load user, owner profile, admin role if any]
    I --> K[Issue JWT access token]
    J --> K
    K --> L[Create hashed refresh token row]
    L --> M[Return access token, refresh token, current user]
    M --> N[Frontend calls protected /api/v1 endpoints]
    N --> O{Access token expired?}
    O -- Yes --> P[POST /api/v1/auth/refresh]
    P --> Q[Validate and rotate refresh token]
    Q --> K
    O -- No --> R[API authorizes owner/admin policy]
```

Implementation notes:

- Store only refresh token hashes.
- Rotate refresh tokens on every refresh.
- Revoke token family on detected reuse.
- Admin access depends on `AdminUsers`, not only `Users.Role`.

## QR Safety Scan Flow

```mermaid
flowchart TD
    A[Finder opens /q/:safetyCode] --> B[Frontend calls GET /api/v1/public/safety/:safetyCode]
    B --> C[API finds PetSafetySettings by secure random SafetyCode]
    C --> D{Pet found and QR enabled?}
    D -- No --> E[Return safe unavailable or not found state]
    D -- Yes --> F[Load pet lifecycle and visibility settings]
    F --> G{Pet lifecycle}
    G -- Active --> H[Build QR Safety projection]
    G -- Memorial --> I[Build inactive memorial projection without emergency contact]
    G -- Archived --> J[Build inactive archived projection without emergency contact]
    H --> K[Apply contact visibility: WhatsApp phone emergency note]
    K --> L[Return finder-first safety data]
    I --> L
    J --> L
```

Implementation notes:

- `/q/:safetyCode` is pet-level and does not require physical tag purchase.
- Physical tag status must not disable `/q/:safetyCode`.
- Memorial and archived pets are not active pets.

## Smart Tag Scan And Activation Flow

```mermaid
flowchart TD
    A[Finder or owner opens /t/:tagCode] --> B[GET /api/v1/public/tags/:tagCode]
    B --> C[API records TagScans event]
    C --> D{Tag exists?}
    D -- No --> E[Return notFound state]
    D -- Yes --> F{Tag status}
    F -- Unclaimed --> G[Return activation prompt state]
    F -- Pending or Preparing --> H[Return pending state]
    F -- Delivered --> I[Return pending activation-ready state]
    F -- Lost or Disabled or Replaced or Archived --> J[Return inactive state without owner contact]
    F -- Active --> K[Load linked pet]
    K --> L{Pet active?}
    L -- No --> M[Return inactive memorial/archived state]
    L -- Yes --> N[Return same safety projection as /q/:safetyCode]
    G --> O[Owner chooses Activate Tag]
    O --> P[JWT auth required]
    P --> Q[Owner selects or creates active pet]
    Q --> R[POST /api/v1/tags/:tagCode/activate]
    R --> S[Validate tag claimable and pet owned by user]
    S --> T[Set OwnerUserId, PetId, Status Active, ActivatedAt]
    T --> U[Write audit log]
    U --> V[Future scans open safety projection]
```

Scan analytics location rule:

- Store `Latitude` and `Longitude` only after explicit finder consent.
- If consent is not granted, do not store precise coordinates.
- Without precise consent, only store non-precise IP-based `Country` and `City` when available.
- QR/NFC scan analytics must not be described as GPS tracking.

## Order And Payment Proof Flow

```mermaid
flowchart TD
    A[Owner opens order flow for active pet] --> B[POST /api/v1/orders]
    B --> C[Validate owner owns pet and pet is Active]
    C --> D[Create TagOrders row: PendingPayment]
    D --> E[Create/reserve SmartTags row linked to pet and order: Pending]
    E --> F[Owner sees manual QR payment instructions]
    F --> G[Owner uploads receipt/screenshot]
    G --> H[POST /api/v1/orders/:orderNumber/payment-proof]
    H --> I[Create MediaFiles row with provider-neutral storage fields]
    I --> J[Create PaymentProofs row: PendingReview]
    J --> K[Set order PaymentProofSubmitted and payment ProofSubmitted]
    K --> L[Admin reviews /api/v1/admin/payment-proofs]
    L --> M{Approve?}
    M -- Yes --> N[Confirm payment]
    N --> O[Order PaymentConfirmed, proof Approved]
    O --> P[Admin marks PreparingTag]
    P --> Q[Linked tag Preparing]
    Q --> R[Admin marks Shipped]
    R --> S[Admin marks Delivered]
    S --> T[Linked tag Delivered]
    T --> U[Owner activates delivered tag]
    M -- No --> V[Reject proof with reason]
    V --> W[Order returns PendingPayment]
    W --> X[Proof stays in history as Rejected]
```

Implementation notes:

- Payment is manual in Phase 1.
- Uploading proof never auto-confirms payment.
- Rejecting proof never deletes the order.
- Portal orders must always have `PetId`.
- Portal-purchased tags are bound to selected pet from the order flow.

## Lost Mode Flow

```mermaid
flowchart TD
    A[Owner opens pet QR Safety management] --> B[Enable Lost Mode]
    B --> C[POST /api/v1/pets/:petId/lost-mode]
    C --> D[Validate owner owns pet]
    D --> E{Pet active?}
    E -- No --> F[Reject: Memorial/Archived pets cannot enable Lost Mode]
    E -- Yes --> G[Save LostModeEnabled and lost details]
    G --> H[Write audit log]
    H --> I[/q/:safetyCode shows missing pet banner and allowed contact]
    I --> J[/p/:slug-publicCode shows Lost Mode exception banner]
    I --> K[Active /t/:tagCode scans show safety page with Lost Mode]
    G --> L[Physical tag statuses unchanged]
```

Implementation notes:

- Lost Mode is a pet-level flag.
- Lost Mode is not Memorial.
- Lost physical tag is not Lost Mode.
- Turning Lost Mode on must not disable active tags.

## Notification Flow Future

Notifications are planned for later phases. The schema should allow them without forcing MVP implementation.

```mermaid
flowchart TD
    A[Care record due date, order update, Lost Mode event, or system trigger] --> B[ReminderJobs scheduled]
    B --> C{Due now?}
    C -- No --> D[Wait for scheduler]
    C -- Yes --> E[Create NotificationQueue item]
    E --> F[Worker picks pending item]
    F --> G{Channel}
    G -- InApp --> H[Create Notifications row]
    G -- Email --> I[Send through email provider]
    G -- WhatsApp --> J[Send through future WhatsApp/provider integration]
    G -- SMS --> K[Send through future SMS provider]
    I --> L[Record sent or failed]
    J --> L
    K --> L
    H --> L
    L --> M[Update queue status and attempts]
```

Future notification use cases:

- vaccination reminders
- medication reminders
- grooming reminders
- Lost Mode notifications
- order payment and fulfillment updates

Phase 1 default:

- Keep notification tables and services as planning hooks only.
- Do not build outbound notification provider integration until explicitly scoped.

## Public Identifier Generation

```mermaid
flowchart TD
    A[Create pet or tag] --> B[Generate secure random public code]
    B --> C[Check database unique constraint]
    C --> D{Collision?}
    D -- Yes --> B
    D -- No --> E[Save publicCode, safetyCode, or tagCode]
    E --> F[Expose only public identifier on public route]
```

Rules:

- `publicCode`, `safetyCode`, and `tagCode` are secure random public identifiers.
- Use UUID, NanoID, ULID, or an equivalent secure random strategy.
- Do not use incremental ids for public identifiers.
- Do not expose internal database ids on public routes.

## Audit Flow

```mermaid
flowchart TD
    A[Admin or important owner action] --> B[Load old entity state]
    B --> C[Validate and apply business rule]
    C --> D[Save new entity state]
    D --> E[Write AuditLogs row]
    E --> F[Include actor, actor type, action, entity, entity id]
    F --> G[Include old value, new value, IP address, user agent, created at]
```

Rules:

- Required for all admin mutations.
- Recommended for owner tag activation, Lost Mode changes, lifecycle changes, payment proof uploads, and security events.
- Never store secrets, raw tokens, or uploaded file contents in audit JSON.
