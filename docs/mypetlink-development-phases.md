# MyPetLink Development Phases & Product Roadmap

## Purpose

This document defines the recommended development phases for the MyPetLink project.

Codex / Claude Code / AI coding assistants should refer to this document before implementing large features, admin tools, backend modules, QR/NFC tag logic, or location tracker-related functionality.

The goal is to avoid overbuilding too early and keep the project focused on launching a usable MVP first.

---

## Product Direction

MyPetLink should be built in phases.

The project should not start by building everything at once, especially:

* Full Admin Portal
* Full QR/NFC tag inventory system
* Payment/order/subscription system
* Hardware location tracker
* Complex internal support tools

The first priority is to complete and launch the user-facing product:

```txt
Owner creates pet profile
↓
Owner manages pet information
↓
Owner previews public/QR profile
↓
Finder scans QR or opens public profile
↓
Finder contacts owner
```

This is the core value of MyPetLink.

---

# Phase 0: UI / Product Shape

## Goal

Complete the full user-facing UI first, before building the full backend or admin system.

This phase focuses on shaping the product and making sure the full user journey is clear.

## Build First

```txt
Landing Page
Pricing Page
Privacy Policy
Terms Page
Owner Dashboard
My Pets
Create Pet
View Pet
Edit Pet
Public Profile Preview
QR Safety Profile Preview
Care Records
Moments
Smart Tags mock UI
Account / Settings
```

## Admin Portal Scope

Do not build the full Admin Portal in this phase.

Only add a placeholder if needed:

```txt
/admin
- Coming Soon
- Admin Portal is under development
```

Optional simple static mock pages are allowed, but should not become the main focus:

```txt
Admin Dashboard mock
Tag Management mock
Orders mock
```

## Why Admin Portal Should Wait

A full Admin Portal is not needed yet because the project does not have:

```txt
Real users
Real QR/NFC tags
Real tag orders
Real payment records
Real support cases
Real scan logs
```

Building full admin features too early will slow down the MVP.

---

# Phase 1: Online MVP

## Goal

Build the backend, database, authentication, and launch the first usable version of MyPetLink.

This phase should make MyPetLink usable even without physical QR/NFC tags.

## Launch Scope

```txt
Landing Page
Owner Portal
Public Pet Profile
QR Safety Profile
Basic backend
Supabase database
Supabase Auth
Basic file upload
Basic QR generation/download
```

## User Flow

The first online version should support this flow:

```txt
User logs in with Google
↓
User creates pet profile
↓
User edits pet details
↓
User sets public contact/safety information
↓
User previews public profile
↓
User previews QR safety profile
↓
User downloads QR code
↓
Finder scans QR
↓
Finder opens pet profile
↓
Finder contacts owner
```

## Important Rule

Do not wait for physical QR/NFC tag suppliers before launching the MVP.

Phase 1 should already support digital QR usage.

The user should be able to:

```txt
Download QR code
Print QR code
Save QR image
Share pet profile link
Use QR without buying physical tag
```

This allows the product to go online earlier and helps validate real user interest.

## Backend Scope

Backend and database should support the owner-facing product first.

Recommended early tables/modules:

```txt
users
pets
pet_profiles
public_profile_settings
care_records
moments
uploaded_files
scan_logs
qr_codes
```

Smart Tag-related data can be simple at this stage.

Do not build a full tag inventory system yet.

---

# Phase 2: QR / NFC Smart Tag Pilot

## Goal

Start physical QR/NFC smart tag testing after the basic product is online.

This phase focuses on supplier research, small-batch testing, tag activation, and minimum admin tools.

## Supplier Work

Research and test QR/NFC tag suppliers.

Tasks:

```txt
Find QR tag suppliers
Find NFC tag suppliers
Request samples
Test material quality
Test printing quality
Test QR durability
Test NFC scan behavior
Test phone compatibility
Design tag artwork
Design packaging
Calculate cost
Calculate selling price
```

## Small Batch First

Do not place a large order immediately.

Start with a small pilot batch:

```txt
20 tags
50 tags
100 tags
```

The goal is to validate:

```txt
Can users activate the tag easily?
Is the QR/NFC scan reliable?
Is the material good enough?
Is the packaging acceptable?
Are users willing to pay?
```

## Tag Activation Flow

The system should support this flow:

```txt
Owner buys tag
↓
Owner receives tag
↓
Owner scans QR or taps NFC
↓
Activation page opens
↓
Owner logs in or registers
↓
Owner selects existing pet or creates new pet
↓
Owner binds tag to pet
↓
Tag becomes active
```

## Required System Features

```txt
Tag activation page
Tag binding flow
Tag unbinding flow
Tag status
Tag token system
Basic tag management
Basic scan logs
```

## Minimum Admin Portal

Phase 2 requires a minimum Admin Portal, but not a full Admin Portal.

Minimum admin features:

```txt
Generate tag batch
View tag list
View tag status
View bound pet
Unbind tag
Deactivate tag
Check scan logs
Basic user/pet lookup
```

## Admin Portal Rule

Only build admin features required to support QR/NFC tag pilot.

Do not build full reports, advanced permissions, advanced support tools, or complex subscription tools yet.

---

# Phase 3: Complete Owner Portal + Admin Portal + Operation

## Goal

After real users and physical tags exist, complete the operational side of the product.

This phase focuses on full Admin Portal, payment/order/subscription management, and support tools.

## Why This Comes After Phase 2

By this phase, the project should already have:

```txt
Real owners
Real pets
Real QR/NFC tags
Real tag activations
Real scan logs
Real support issues
Real product feedback
```

This makes Admin Portal requirements more accurate.

## Full Admin Portal Scope

```txt
Admin Dashboard
User Management
Pet Lookup
Tag Management
Tag Batch Generation
Tag Activation Management
Order Management
Payment Status
Subscription Management
Scan Logs
Lost Mode Monitoring
Support Tools
Audit Logs
Basic Reports
```

## Owner Portal Enhancements

Enhance the owner-facing product based on real user feedback.

Possible features:

```txt
Premium plan
Family access
Care reminders
Scan history
Found location reports
More document uploads
Lost mode enhancement
Notification settings
Profile theme customization
Advanced pet medical information
```

## Payment / Order Scope

This phase may include:

```txt
Smart tag ordering
Payment integration
Order status
Delivery tracking status
Invoice/receipt
Subscription plan management
Premium upgrade/downgrade
```

## Operation Scope

This phase may include:

```txt
Support dashboard
Manual tag rebinding
Refund/check order status
User issue investigation
Audit logs
Admin action tracking
```

---

# Phase 4: Location Tracker

## Goal

Research and develop a location tracker product only after the QR/NFC product has proven demand.

Location tracker should not be treated as a simple extension of QR/NFC tags.

It is a separate product line with higher complexity.

## Why This Should Wait

QR/NFC tags are:

```txt
Low cost
No battery
No charging
Simple manufacturing
Easy to sell
Low maintenance
Suitable for one-time purchase
```

Location trackers are:

```txt
Hardware product
Battery required
Charging required
GPS/BLE/network required
Firmware involved
Possible SIM/eSIM required
Possible subscription required
Warranty/support required
Higher customer expectation
```

Building this too early may slow down the whole MyPetLink project.

## Start Location Tracker Only When

```txt
Owner Portal is stable
Admin Portal is stable
QR/NFC tag has real users
QR/NFC tag has some sales
Users are asking for tracking
Users are willing to pay higher price or subscription
The business understands the real demand
```

## Possible Tracker Types

### BLE Tracker

```txt
Nearby tracking only
Lower cost
Longer battery life
Not suitable for true long-distance lost pet tracking
```

Suitable for:

```txt
Finding pet nearby
Inside house
Condo area
Short distance search
```

### GPS + SIM Tracker

```txt
Real location tracking
Higher cost
Shorter battery life
May require SIM/eSIM/data plan
Likely needs subscription
Higher support burden
```

Suitable for:

```txt
Premium users
Outdoor pets
Real lost pet tracking
Location history
```

### White-Label / Partner Tracker

This may be the best option before building custom hardware.

Approach:

```txt
Find existing tracker manufacturer
Test ready-made tracker
Add MyPetLink branding
Integrate tracker data into MyPetLink
Sell as premium product
Offer monthly subscription if needed
```

This reduces hardware development risk.

---

# Recommended Phase Summary

```txt
Phase 0:
Finish Landing + Owner Portal UI

Phase 1:
Build backend + database
Launch Landing + Owner Portal + Public/QR Profile
Allow users to create pet profile and download QR

Phase 2:
Find QR/NFC tag supplier
Build tag activation flow
Build minimum Admin Portal for tag management
Run small physical tag pilot

Phase 3:
Complete Admin Portal
Add payment, order, subscription, support, and operation tools
Improve Owner Portal based on real users

Phase 4:
Research location tracker
Partner or build tracker only after QR/NFC demand is proven
```

---

# Current Priority

The current priority is:

```txt
1. Complete Landing Page UI
2. Complete Owner Portal UI
3. Complete Public Profile UI
4. Complete QR Safety Profile UI
5. Review full user journey
6. Build backend + Supabase DB for Owner Portal
7. Launch MVP online
```

Admin Portal should not be the main priority now.

Location tracker should not be started now.

Physical QR/NFC supplier research can start lightly, but implementation should wait until the online MVP is usable.

---

# Important Product Rules

## QR Safety Profile Must Exist in Phase 1

The QR Safety Profile should not wait until physical tags exist.

Phase 1 should already support digital QR code generation.

```txt
Phase 1:
Downloadable QR code

Phase 2:
Physical QR/NFC smart tag
```

## Finder Contact Must Not Be Locked Behind Premium

Basic finder contact is a safety feature.

A finder scanning the QR should be able to contact the owner based on the owner’s public contact settings.

Premium can add advanced features, but should not block basic pet recovery.

## Do Not Overbuild Admin Too Early

Admin Portal should grow based on real operational needs.

Start with minimum admin tools only when physical tag pilot starts.

## Do Not Build Location Tracker Too Early

Location tracker is a much larger product with hardware, battery, firmware, connectivity, warranty, and support concerns.

It should only be considered after the QR/NFC product shows demand.

---

# AI Coding Assistant Rules

Codex / Claude Code should follow these rules when working on MyPetLink.

## Must Follow

```txt
Prioritize Landing Page, Owner Portal, Public Profile, and QR Safety Profile first.
Keep Admin Portal minimal until Phase 2.
Keep full Admin Portal for Phase 3.
Keep location tracker for Phase 4.
Build digital QR support before physical tag support.
Allow owner to create pet and download QR in MVP.
Keep finder contact available as a basic safety feature.
Use phased development instead of building everything at once.
```

## Must Not Do

```txt
Do not build full Admin Portal during Phase 0.
Do not block MVP launch while waiting for QR/NFC suppliers.
Do not require physical tag before QR profile can work.
Do not build location tracker before QR/NFC demand is proven.
Do not build complex tag inventory before physical tag pilot.
Do not overbuild payment/subscription/order system before users exist.
Do not expose internal database IDs in public profile or QR URLs.
```

## Should Prefer

```txt
Simple MVP first.
Customer-facing flow before internal admin flow.
Real user feedback before advanced operation tools.
Digital QR before physical QR/NFC.
Small-batch pilot before mass tag order.
Partner/white-label tracker before custom tracker hardware.
```

---

# Final Direction

The approved development direction for MyPetLink is:

```txt
Do not develop full Admin Portal first.

First:
- Complete Landing Page
- Complete Owner Portal
- Complete Public Profile
- Complete QR Safety Profile

Then:
- Build backend and Supabase database
- Launch online MVP

Then:
- Find QR/NFC tag supplier
- Build activation flow
- Build minimum tag admin tools
- Run small pilot

Then:
- Complete full Admin Portal
- Add payment/order/subscription/support operation

Finally:
- Research and possibly develop location tracker
```

This keeps MyPetLink focused, realistic, and launchable.
