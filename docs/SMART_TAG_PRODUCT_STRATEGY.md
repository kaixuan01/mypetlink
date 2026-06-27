# MyPetLink Smart Tag Product Strategy & Implementation Guide

## 1. Purpose

MyPetLink should support a physical **Smart Pet Tag** product that can be sold through pet shops, online stores, and direct customers.

The main product value is:

> A safer way home for your pet.

When a pet is lost, anyone can scan the QR code or tap NFC on the tag to open the pet’s public profile and contact the owner.

This document should be used as the reference for all future development related to:

* Smart pet tags
* QR code flow
* NFC flow
* Tag activation
* Public pet profile
* Tag binding / unbinding
* Admin tag generation
* Batch production
* CSV export for manufacturers
* Pet shop / retail selling flow
* Retail packaging flow
* User onboarding from physical tags

Do not implement tag-related features as isolated pages. They must follow the product flow defined here.

---

## 2. Product Direction

MyPetLink should support two product types.

### 2.1 Smart Pet Tag

This is the main product and the first priority.

Characteristics:

* Pre-produced physical tag
* No pet name printed on the generic retail version
* Has a unique TagCode
* Has a unique QR code
* Optional NFC support
* Tag is initially unassigned
* Customer buys the tag from a pet shop or online
* Customer scans QR or taps NFC
* Customer signs in or registers
* Customer activates the tag and binds it to a pet

This is the preferred product because it can be produced in bulk and sold as ready stock.

### 2.2 Custom Name Tag

This is a future premium product.

Characteristics:

* Made after customer order
* Can include pet name
* Can include selected design / shape
* Can include QR and optional NFC
* Higher selling price
* Slower fulfillment
* Not the first priority

Unless specifically requested, development should prioritize the **Smart Pet Tag** flow first.

---

## 3. Core Product Principle

The customer flow should be simple:

```text
Buy it.
Scan it.
Activate it.
Protect your pet.
```

The technical system can be complex behind the scenes, but the customer experience must stay simple, mobile-first, and easy to understand.

---

## 4. Supported Tag Shapes

Initial supported shapes:

1. Round
2. Bone
3. Rounded Square
4. Paw

The shape is a product/display option only. The activation logic should not depend on the shape.

Each shape should share the same core information.

### Front

* MyPetLink logo
* QR code
* Decorative brand elements
* No pet name for the generic retail version

### Back

* “Scan me if I’m lost”
* TagCode
* Optional short website text
* Optional NFC indicator if supported

Example:

```text
Scan me if I’m lost
ID: MPL-26A7-K9Q2
```

---

## 5. TagCode Strategy

MyPetLink should use **one public TagCode** for each physical tag.

Do not split the tag into separate DisplayCode and PublicToken.

The same TagCode should be used for:

* QR URL
* NFC URL
* Text printed on the physical tag
* Customer support lookup
* Admin portal search
* Manufacturer CSV export

Example TagCode:

```text
MPL-26A7-K9Q2
```

Example QR / NFC URL:

```text
https://mypetlink.com/t/MPL-26A7-K9Q2
```

Example physical tag text:

```text
ID: MPL-26A7-K9Q2
```

This keeps the system easier to understand for:

* Users
* Pet shop staff
* Admin users
* Manufacturers
* Customer support

---

## 6. TagCode Format

TagCode must not be sequential.

Do not use:

```text
MPL-2606-0001
MPL-2606-0002
MPL-2606-0003
```

This is too easy to guess.

Use a random, readable, branded code instead.

Recommended format:

```text
MPL-26A7-K9Q2
```

Alternative format:

```text
MPL-K9Q2-X7A5
```

Recommended character set:

```text
ABCDEFGHJKLMNPQRSTUVWXYZ23456789
```

Avoid confusing characters:

```text
O, 0, I, 1
```

Reason:

* Easier to read
* Easier for support
* Lower chance of manual typing mistakes
* Harder to guess
* Still suitable for QR/NFC URL

The database must enforce uniqueness on TagCode.

---

## 7. Tag Identity Model

Each physical tag has one TagCode.

### Internal ID

Used only inside the database.

Example:

```text
Id = 123
```

This must not be exposed in public URLs or printed on the tag.

### TagCode

Used publicly and operationally.

Example:

```text
MPL-26A7-K9Q2
```

Used for:

* Printed tag ID
* QR URL
* NFC URL
* Admin search
* Support lookup
* CSV export
* Manual lookup if QR is damaged

---

## 8. Recommended Database Model

A tag should exist independently from a pet.

Example table:

```sql
PetTags
- Id
- TagCode
- PetId
- OwnerUserId
- Shape
- HasNfc
- Status
- BatchNo
- CreatedAt
- UpdatedAt
- ActivatedAt
- DisabledAt
```

Recommended statuses:

```text
Unassigned
Active
Disabled
Lost
Replaced
```

### Required Constraints

```sql
UNIQUE(TagCode)
```

TagCode must always be unique.

---

## 9. Tag Status Meaning

### Unassigned

The tag has been generated and/or produced but is not linked to any pet yet.

### Active

The tag is linked to a pet and can show the pet’s public profile.

### Disabled

The tag should not show pet information.

### Lost

The pet or tag has been marked as lost. The public profile may show stronger contact prompts.

### Replaced

The tag has been replaced by another tag.

---

## 10. QR / NFC URL Design

QR and NFC should point to the same URL.

Recommended format:

```text
https://mypetlink.com/t/{tagCode}
```

Example:

```text
https://mypetlink.com/t/MPL-26A7-K9Q2
```

Do not use:

```text
/p/{petId}
/p/{petName}
/p/{petSlug}
/t/{internalId}
/t/{sequentialId}
```

`/t/{tagCode}` is the **physical tag** route (QR/NFC). It is the **finder-first
safety page** a stranger sees after scanning — big "I found this pet - Contact
Owner", WhatsApp/Call/Send Found Location, safety + emergency notes. The shareable
public profile is a **separate** route, `/p/{petSlug}-{publicCode}`
(e.g. `/p/milo-k7q2`) — a clean, friendly, IG-style page whose primary action is
**Share**, with no emergency finder CTAs (except a Lost Mode banner). Never mix the
two. `/p/{petSlug}` alone (e.g. `/p/milo`) is **deprecated** — never display, copy,
or link to it. See `PUBLIC_PROFILE_ROUTING.md`.

The URL must not expose:

* Internal database ID
* Pet ID
* User ID
* Owner details
* Email
* Phone number

---

## 11. Admin Portal: Tag Generation

Admin Portal must provide a feature to generate Smart Tag batches.

This is required before sending production data to manufacturers.

### Admin should be able to generate:

* Number of tags
* Shape
* Batch number
* NFC enabled / disabled
* Optional remarks
* Optional production status

Example:

```text
Batch No: 2606-A
Shape: Round
Quantity: 100
Has NFC: false
```

The system should generate 100 unique TagCodes and create 100 `PetTags` records with status `Unassigned`.

Example generated TagCodes:

```text
MPL-26A7-K9Q2
MPL-26F3-X8D5
MPL-26Q9-R4T7
```

The TagCode generation must:

* Use secure random generation
* Avoid confusing characters
* Check uniqueness before insert
* Enforce database unique constraint
* Retry if duplicate occurs

---

## 12. Admin Portal: Batch Management

Admin Portal should allow admins to view and manage generated batches.

Required features:

* View batches
* View generated tags
* Search by TagCode
* Filter by batch number
* Filter by shape
* Filter by status
* Filter by NFC enabled / disabled
* View linked pet
* View linked owner
* Disable tag
* Mark tag as replaced
* View activation status
* View scan history if available

Recommended batch fields:

```text
BatchNo
Shape
Quantity
HasNfc
CreatedAt
CreatedBy
ProductionStatus
Remarks
```

Recommended production statuses:

```text
Draft
Generated
Exported
SentToManufacturer
InProduction
Received
Cancelled
```

---

## 13. Admin Portal: CSV Export for Manufacturer

Admin Portal must allow exporting generated tags into CSV.

This CSV will be sent to the manufacturer for QR printing and optional NFC encoding.

Example CSV:

```csv
tag_code,url,shape,batch_no,has_nfc
MPL-26A7-K9Q2,https://mypetlink.com/t/MPL-26A7-K9Q2,Round,2606-A,false
MPL-26F3-X8D5,https://mypetlink.com/t/MPL-26F3-X8D5,Round,2606-A,false
MPL-26Q9-R4T7,https://mypetlink.com/t/MPL-26Q9-R4T7,Round,2606-A,false
```

If NFC is enabled, the manufacturer should write the same URL into the NFC chip.

```text
QR URL = NFC URL
```

Example:

```text
QR:  https://mypetlink.com/t/MPL-26A7-K9Q2
NFC: https://mypetlink.com/t/MPL-26A7-K9Q2
```

The CSV export should be available per batch.

Admin should be able to re-download the CSV if needed.

---

## 14. Manufacturer Production Flow

The intended production flow is:

```text
Admin generates tag batch
        ↓
System creates unique TagCodes
        ↓
Admin exports CSV
        ↓
CSV is sent to manufacturer
        ↓
Manufacturer prints QR code for each TagCode
        ↓
Manufacturer prints TagCode on the tag
        ↓
If NFC is enabled, manufacturer writes the same URL into NFC
        ↓
Tags are delivered as unassigned stock
```

Important:

* Manufacturer must not generate their own TagCodes.
* Manufacturer must use the provided CSV.
* Each physical tag must match the correct QR URL and printed TagCode.
* If NFC exists, QR and NFC must point to the same URL.

---

## 15. Activation Flow

The activation flow is one of the most important parts of the product.

The user may come from:

* QR scan
* NFC tap
* Packaging QR
* Pet shop demo
* Direct tag URL

The flow must work well even if the user has no account yet.

---

## 16. Activation Flow: Unassigned Tag

When a user scans or taps an unassigned tag:

```text
User scans QR / taps NFC
        ↓
Open /t/{tagCode}
        ↓
System finds tag by TagCode
        ↓
Tag status = Unassigned
        ↓
Show activation landing screen
        ↓
User signs in or registers
        ↓
User creates or selects pet
        ↓
User confirms binding
        ↓
Tag becomes Active
        ↓
Show success screen
        ↓
Redirect to pet public profile preview
```

### First Screen

Title:

```text
Activate your MyPetLink Tag
```

Body:

```text
This tag is not linked to any pet yet. Activate it now so your pet can be identified if they ever get lost.
```

Primary button:

```text
Activate Tag
```

Secondary options:

```text
Sign in
Create account
```

If the user is already signed in, skip unnecessary login prompts.

---

## 17. Activation Flow: User Has No Account

If the user has no account:

```text
Scan QR / tap NFC
        ↓
Activate Tag screen
        ↓
Create account
        ↓
Create pet profile
        ↓
Confirm tag binding
        ↓
Activation success
```

Important requirements:

* Preserve the TagCode during registration
* Redirect back to activation after signup
* Do not make the user scan again
* Do not send the user to a generic dashboard before activation is complete
* Keep the flow focused on completing tag activation

---

## 18. Activation Flow: Existing User

If the user already has an account:

```text
Scan QR / tap NFC
        ↓
Sign in
        ↓
Select existing pet or create new pet
        ↓
Confirm binding
        ↓
Activation success
```

If the user has existing pets, show:

```text
Choose a pet to link this tag
```

Each pet card should show:

* Pet photo
* Pet name
* Species
* Current tag status if applicable

---

## 19. Activation Flow: Active Tag

When someone scans an active tag:

```text
Scan QR / tap NFC
        ↓
Open /t/{tagCode}
        ↓
System finds active tag
        ↓
Show public pet profile
```

The scanner should not see the activation page.

They should see the pet’s public profile.

---

## 20. Activation Flow: Disabled / Replaced Tag

If the tag is disabled or replaced:

Show a safe message:

```text
This tag is no longer active.
```

Do not expose owner or pet details.

Optional message:

```text
If you are the owner, please sign in to manage your tags.
```

---

## 21. Activation Flow: Invalid TagCode

If the TagCode does not exist:

Show:

```text
Tag not found
```

Do not reveal whether similar tags exist.

Do not expose debugging information.

The page should still look branded and helpful.

---

## 22. Public Pet Profile

The public profile should be safe, clear, and useful during a lost pet situation.

### Public Profile Should Show

Recommended:

* Pet name
* Pet photo
* Species
* Breed or color
* Short description
* Important notes selected by owner
* Contact owner button
* MyPetLink branding

### Public Profile Should Not Show by Default

Do not expose sensitive information by default:

* Owner full address
* Owner IC / ID number
* Owner email
* Full phone number unless owner enables it
* Private notes
* Internal IDs

### Main CTA

Use a clear lost-pet action:

```text
I found this pet
Contact owner
```

---

## 23. Owner Privacy Settings

Owner must control what is shown publicly.

Recommended settings:

```text
Show phone number: On / Off
Allow WhatsApp contact: On / Off
Show medical notes: On / Off
Show emergency contact: On / Off
Show owner name: On / Off
```

Default privacy should be safe.

Do not show too much personal information by default.

---

## 24. Owner Tag Management

The owner should be able to manage tags from the pet edit page or a dedicated tag management page.

Features:

* View linked tag
* View TagCode
* Link new tag
* Unlink tag
* Replace tag
* Disable tag
* Mark pet as lost
* Mark pet as found
* View tag status

### One Pet, Multiple Tags

The system may support multiple tags per pet in the future.

Example:

* Collar tag
* Spare tag
* Travel tag

The database design should not block this future requirement.

### One Tag, One Active Pet

One physical tag should only be linked to one active pet at a time.

---

## 25. Pet Shop / Retail Flow

MyPetLink should support selling unassigned tags through pet shops.

Retail flow:

```text
Pet shop receives unassigned tag stock
        ↓
Customer buys tag
        ↓
Customer scans QR / taps NFC
        ↓
Customer registers or signs in
        ↓
Customer activates tag for pet
        ↓
Customer becomes MyPetLink user
```

Pet shop staff should be able to explain it simply:

```text
This smart pet tag lets anyone scan the QR code to contact you if your pet is lost. Buy it, scan it, register, and activate it for your pet.
```

---

## 26. Retail Packaging Requirements

Packaging should explain the product without needing much staff explanation.

### Front Packaging

Must communicate quickly:

```text
Smart Pet ID Tag
Scan to help me get home
Activate in minutes
```

Optional:

```text
Works with any smartphone
QR enabled
NFC ready
```

### Back Packaging

Must show the activation flow:

```text
1. Buy tag
2. Scan QR or tap NFC
3. Sign in or register
4. Activate for your pet
```

Add message:

```text
No account yet? No problem. Register, then activate your tag.
```

### Pet Shop Display

Packaging should be suitable for:

* Hanging peg display
* Countertop display
* Gift add-on
* Collar / leash section
* Checkout counter impulse purchase

---

## 27. Product Positioning

The product should not be positioned as a technical QR/NFC gadget.

It should be positioned as:

```text
Smart Pet Safety Tag
```

Core emotional value:

```text
Help your pet get home safely.
```

Good customer-facing phrases:

```text
A safer way home for your pet.
Scan to help me get home.
Activate in minutes.
Update your pet’s details anytime.
No app required.
Works with any smartphone.
```

Avoid technical phrases in customer-facing UI:

```text
Token
Hash
Mapping
Entity ID
Database binding
Encrypted identifier
```

Technical names are allowed only in code, database, and internal admin pages.

---

## 28. Recommended MVP Scope

### Must Have

* PetTags database table
* Unique TagCode generation
* Admin batch generation
* Admin CSV export
* `/t/{tagCode}` route
* Unassigned tag activation page
* Login/register continuation after scan
* Create pet during activation
* Select existing pet during activation
* Bind tag to pet
* Active tag public profile display
* Disabled / invalid tag safe states
* Owner tag management
* Mobile-first activation UI

### Should Have

* Activation success page
* Basic scan analytics
* Basic activation analytics
* Tag status management
* Privacy settings for public profile
* Packaging copy / retail instructions page

### Later

* NFC support
* QR + NFC premium tag
* Custom name tag
* Reseller / pet shop portal
* Pet shop stock tracking
* Replacement tag workflow
* Subscription / premium profile
* Lost pet alert broadcast

---

## 29. Activation UX Requirements

The activation flow must be smooth and mobile-first.

Rules:

* Do not require users to manually enter TagCode if they scanned QR/NFC.
* Do not lose the TagCode during login/register.
* Do not redirect users to dashboard before activation is complete.
* Do not show technical errors to normal users.
* Keep each screen focused on one action.
* Use large mobile-friendly buttons.
* Make success state clear.
* Provide a way to preview public profile after activation.

Recommended activation screens:

1. Activate Tag screen
2. Sign in / Register screen
3. Create or Select Pet screen
4. Confirm Binding screen
5. Activation Success screen
6. Public Profile Preview

---

## 30. Error / Edge Cases

### Tag Already Active and Scanned by Owner

If owner scans own active tag while signed in, show options:

```text
View public profile
Manage tag
Edit pet profile
```

### Tag Already Active and Scanned by Public

Show public pet profile only.

### Tag Active But Pet Is Private

Show safe message:

```text
This pet profile is currently private.
```

Optionally show a generic contact method if owner enabled it.

### Tag Claimed by Wrong User

Only support/admin should be able to transfer ownership after verification.

### QR Damaged

User can use the printed TagCode for support or manual lookup.

Manual lookup should be protected by rate limiting.

### TagCode Guessing

Use random TagCodes and rate limiting.

Invalid code pages should not leak information.

---

## 31. Security Requirements

* Never expose internal IDs publicly.
* Use unique random TagCodes.
* Do not use sequential TagCodes.
* Apply database unique constraint on TagCode.
* Rate limit manual tag lookup.
* Rate limit invalid TagCode attempts.
* Do not allow one user to take over an active tag.
* Do not expose private owner details on public pages.
* Validate ownership before tag management changes.
* Audit important tag actions:

  * Created
  * Exported
  * Activated
  * Linked
  * Unlinked
  * Disabled
  * Replaced
  * Marked lost
  * Marked found

---

## 32. Analytics Requirements

The system should eventually track:

* Total tag scans
* Unique tag scans
* Activation attempts
* Successful activations
* Activation conversion rate
* Scans before activation
* Scans after activation
* Batch performance
* Shape performance
* QR-only vs QR+NFC performance
* Pet shop / retail batch performance

This is important for validating pet shop partnerships.

---

## 33. Admin Requirements

Admin should be able to:

* Generate tag batch
* Export production CSV
* View tag list
* Search by TagCode
* Filter by status
* Filter by batch
* Filter by shape
* Filter by NFC enabled / disabled
* Disable tag
* Replace tag
* View linked pet
* View owner
* View activation history
* View scan history
* Re-download batch CSV

---

## 34. Naming Recommendations

Use customer-friendly names:

```text
Smart Pet Tag
Smart Pet ID Tag
MyPetLink Tag
Activate Tag
Link Tag
Manage Tag
TagCode
```

Avoid confusing customer-facing names:

```text
PublicToken
DisplayCode
EntityId
Hash
Mapping
Encrypted ID
```

The official identifier should be:

```text
TagCode
```

---

## 35. Implementation Priority

When building or modifying the system, prioritize in this order:

1. Correct tag data model
2. Secure random TagCode generation
3. Admin batch generation
4. Admin CSV export
5. `/t/{tagCode}` route
6. Unassigned tag activation flow
7. Login/register continuation
8. Pet creation and binding
9. Public profile display
10. Tag management
11. Basic analytics
12. NFC support
13. Packaging / retail partner pages

Do not start with NFC before the QR activation flow is stable.

---

## 36. Final Product Rule

Every physical tag should follow this rule:

```text
One physical tag = one TagCode
TagCode is printed on the tag
TagCode is inside the QR URL
TagCode is inside the NFC URL if NFC exists
TagCode is used for admin and support lookup
```

Final URL pattern:

```text
https://mypetlink.com/t/{tagCode}
```

Example:

```text
https://mypetlink.com/t/MPL-26A7-K9Q2
```

Final product experience:

```text
Customer buys a tag.
Customer scans the QR or taps NFC.
Customer signs in or registers.
Customer activates the tag for their pet.
If the pet is lost, anyone can scan the tag and contact the owner.
```

The goal is simple:

> Help a lost pet get home safely.
