# Communication preference boundaries

MyPetLink keeps three communication categories separate:

1. **Essential account and order communications** are transactional messages
   sent when required. They do not depend on marketing consent or care-reminder
   preferences.
2. **Premium care reminders** are future functionality. Their existing
   `NotificationPreferencesJson` values are persisted placeholders only; the
   current Owner Settings UI renders them disabled and unchecked and does not
   submit changes.
3. **MyPetLink news and offers** is optional marketing consent. It is stored as
   the typed `OwnerProfiles.MarketingEmailOptIn` field and defaults to `false`.
   `MarketingEmailPreferenceUpdatedAt` records the server UTC time of an
   explicit change.

Future promotional-email recipient selection must use
`CommunicationPreferenceRules.CanReceiveMarketingEmail`, which authorizes a
recipient only when `MarketingEmailOptIn == true`. Account creation, email
ownership, orders, privacy settings, care-reminder fields, and transactional
email eligibility must never be interpreted as marketing consent.

This foundation does not enqueue or send promotional email.

## Existing notification-field audit

| Field or behavior | Current classification |
| --- | --- |
| `OwnerProfiles.NotificationPreferencesJson` | Persisted placeholder for future Premium care reminders |
| `whatsappReminders` | Future Premium field; no active reminder job or sender |
| `emailReminders` | Future Premium field; no active reminder job or sender |
| `careDigest` | Future Premium field; no active digest job or sender |
| Previous checked reminder controls | Removed hardcoded UI state |
| Essential welcome, payment, receipt, and shipping messages | Fully operational transactional flows with independent delivery/template gates |
| `MarketingEmailOptIn` | Operational persisted marketing consent |
| Promotional campaign delivery | Not implemented |
