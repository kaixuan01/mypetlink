import type { Metadata } from "next";
import Link from "next/link";
import {
  LegalBulletList,
  LegalHero,
  LegalSection,
} from "@/components/marketing/LegalNotice";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { Icon, type IconName } from "@/components/ui/Icon";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Privacy Notice",
};

const lastUpdated = "1 July 2026";

const quickLinks = [
  { id: "introduction", title: "Introduction" },
  { id: "who-we-are", title: "Who we are" },
  { id: "information", title: "Information collected" },
  { id: "publicly-shown", title: "What is public" },
  { id: "use", title: "How we use information" },
  { id: "owner-control", title: "Owner control" },
  { id: "sharing", title: "Sharing" },
  { id: "third-party", title: "Third parties" },
  { id: "cookies", title: "Cookies and analytics" },
  { id: "security", title: "Security" },
  { id: "retention", title: "Retention" },
  { id: "requests", title: "Your requests" },
  { id: "cross-border", title: "Cross-border" },
  { id: "children", title: "Children" },
  { id: "changes", title: "Changes" },
  { id: "contact", title: "Contact" },
];

const informationGroups: {
  title: string;
  body?: string;
  items: string[];
  icon: IconName;
}[] = [
  {
    title: "Account information",
    icon: "users",
    items: [
      "Name or display name",
      "Email",
      "Login method",
      "Phone or WhatsApp number if provided",
      "Account preferences",
    ],
  },
  {
    title: "Pet profile information",
    icon: "paw",
    items: [
      "Pet name, type or species, breed, colour, age or birthday, and gender",
      "Photos, bio, personality tags, favourite things, and general area",
      "Public profile settings chosen by the owner",
    ],
  },
  {
    title: "Safety and contact information",
    icon: "shield",
    items: [
      "Emergency notes and safety notes",
      "WhatsApp and call contact options",
      "Lost Mode details and finder instructions",
      "General location or area chosen by the owner",
    ],
  },
  {
    title: "Care records",
    icon: "record",
    body:
      "Care records are owner-managed and may contain sensitive information if the owner chooses to add it.",
    items: [
      "Vaccination, deworming, grooming, medication, allergy, vet visit, or other pet care notes",
    ],
  },
  {
    title: "Memories and moments",
    icon: "heart",
    items: [
      "Photos, captions, dates, and memory details",
      "Visibility settings such as public, private, or family-only where supported",
    ],
  },
  {
    title: "Smart tag and order information",
    icon: "tag",
    items: [
      "Tag type, tag code, linked pet, order number, delivery details if provided, and order status",
      "Payment reference, payment proof or receipt uploaded by the user, and support messages related to orders",
    ],
  },
  {
    title: "Finder interaction and scan information",
    icon: "qr",
    body:
      "When finder or scan features are enabled, we may collect technical details to support safety, contact, and abuse prevention.",
    items: [
      "Tag scan or page open event, date, and time",
      "Approximate technical information such as browser, device, and IP address if collected",
      "Optional finder-shared location if supported and chosen by the finder",
      "WhatsApp messages or shared WhatsApp locations are handled through WhatsApp and depend on the finder's choice",
    ],
  },
  {
    title: "Technical information",
    icon: "settings",
    items: [
      "Cookies or local storage",
      "Browser and device information",
      "Log data, pages visited, and security or abuse prevention information",
      "Analytics information if analytics is enabled",
    ],
  },
];

const publicProfileItems = [
  "Pet name",
  "Photos",
  "Type or species",
  "Breed",
  "Colour",
  "Age",
  "Bio",
  "Personality tags",
  "Favourite things",
  "General area",
  "Public memories",
  "Owner-approved public notes",
];

const qrSafetyItems = [
  "Pet name and photo",
  "Missing or Lost Mode message if enabled",
  "General area",
  "Safety note",
  "Emergency note",
  "WhatsApp button",
  "Call button",
  "Finder instructions",
];

const privateByDefaultItems = [
  "Full home address",
  "Private care notes",
  "Private memories",
  "Account email",
  "Internal order details",
  "Full payment proof",
  "Private account settings",
];

export default function PrivacyPage() {
  return (
    <PublicLayout>
      <LegalHero
        eyebrow="Privacy"
        title="Privacy Notice"
        description="How MyPetLink collects, uses, shares, and protects information."
        lastUpdated={lastUpdated}
        links={quickLinks}
      >
        <p>
          MyPetLink is designed so QR Safety Pages help finders contact owners
          without exposing more information than necessary. This Notice explains
          what information may be collected, how it is used, and the choices pet
          owners have. It should be read together with our{" "}
          <Link className="font-bold text-pet-teal hover:underline" href="/terms">
            Terms of Use
          </Link>
          .
        </p>
      </LegalHero>

      <section className="bg-white px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-5xl gap-4">
          <LegalSection id="introduction" number={1} title="Introduction">
            <p>
              MyPetLink respects owner privacy. Public pet pages should show
              enough information to help a pet get home, while keeping sensitive
              owner details private unless the owner chooses to share them.
            </p>
            <p>
              Some features may only collect information when they are
              available, enabled, or when you choose to provide that
              information.
            </p>
          </LegalSection>

          <LegalSection id="who-we-are" number={2} title="Who We Are">
            <div className="rounded-[1.25rem] bg-pet-cream p-4">
              <p className="font-black text-pet-ink">
                {siteConfig.productName} by {siteConfig.companyName}
              </p>
              <p>{siteConfig.country}</p>
              <p>Business Registration No.: {siteConfig.businessRegistrationNo}</p>
              <p>
                <a
                  className="font-bold text-pet-teal hover:underline"
                  href={`mailto:${siteConfig.supportEmail}`}
                >
                  {siteConfig.supportEmail}
                </a>
              </p>
            </div>
          </LegalSection>

          <LegalSection id="information" number={3} title="Information We Collect">
            <p>
              We may collect the following types of information if you provide
              them, use the feature, or the feature is enabled.
            </p>
            <div className="grid gap-3">
              {informationGroups.map((group) => (
                <InfoGroup
                  body={group.body}
                  icon={group.icon}
                  items={group.items}
                  key={group.title}
                  title={group.title}
                />
              ))}
            </div>
          </LegalSection>

          <LegalSection id="publicly-shown" number={4} title="What Is Shown Publicly">
            <p>
              Public pages are controlled by owner settings. The exact fields
              shown can vary based on what the owner adds and marks public.
            </p>
            <div className="grid gap-3 lg:grid-cols-3">
              <VisibilityCard
                icon="heart"
                title="Public Share Profile may show"
                items={publicProfileItems}
              />
              <VisibilityCard
                icon="qr"
                title="QR Safety Page may show"
                items={qrSafetyItems}
              />
              <VisibilityCard
                icon="shield"
                title="Not shown publicly by default"
                items={privateByDefaultItems}
              />
            </div>
          </LegalSection>

          <LegalSection id="use" number={5} title="How We Use Information">
            <LegalBulletList
              items={[
                "Create and manage pet profiles.",
                "Display Public Share Profiles and QR Safety Pages based on owner settings.",
                "Enable finder contact through WhatsApp, call, or related contact options.",
                "Manage Lost Mode, safety notes, care records, and memories.",
                "Process smart tag orders and payment proof where applicable.",
                "Provide support and respond to owner requests.",
                "Improve the service and user experience.",
                "Prevent abuse, fraud, spam, or misuse.",
                "Comply with legal obligations where required.",
              ]}
              icon="settings"
            />
          </LegalSection>

          <LegalSection id="owner-control" number={6} title="Public Pages and Owner Control">
            <LegalBulletList
              items={[
                "Public pages are accessible to anyone with the link, QR code, or NFC tag.",
                "Owners control what information they add and what is marked public.",
                "Owners should avoid adding sensitive personal information to public fields.",
                "Removing public information from MyPetLink may not remove copies already saved, screenshotted, indexed, or shared by others.",
              ]}
              icon="shield"
            />
          </LegalSection>

          <LegalSection id="sharing" number={7} title="Sharing and Disclosure">
            <p>
              MyPetLink may share information with service providers and other
              parties where needed to provide, protect, or operate the service.
            </p>
            <LegalBulletList
              items={[
                "Hosting and cloud service providers.",
                "Email, support, or customer communication tools.",
                "Analytics providers if analytics is used.",
                "Payment or payment proof review tools if used.",
                "Delivery or courier partners for tag orders.",
                "Professional advisers where needed.",
                "Legal or regulatory authorities if required.",
                "A buyer or successor if business ownership changes.",
              ]}
              icon="users"
            />
          </LegalSection>

          <LegalSection id="third-party" number={8} title="Third-Party Services">
            <p>
              MyPetLink may link to or work with third-party services such as
              WhatsApp, phone dialers, map or location services, payment, bank
              or eWallet services, delivery providers, Cloudflare or hosting
              providers, Google login if enabled, and support tools.
            </p>
            <p>
              Third-party services have their own privacy policies and practices.
              MyPetLink does not control how those services process information.
            </p>
          </LegalSection>

          <LegalSection id="cookies" number={9} title="Cookies, Local Storage, and Analytics">
            <LegalBulletList
              items={[
                "MyPetLink may use cookies or local storage to keep users signed in, remember preferences, save information you choose to keep on your device, and improve the service.",
                "Analytics may be used to understand page usage and improve features if enabled.",
                "You can manage cookies through your browser settings, but some features may not work properly if cookies or local storage are disabled.",
              ]}
              icon="settings"
            />
          </LegalSection>

          <LegalSection id="security" number={10} title="Data Security">
            <LegalBulletList
              items={[
                "MyPetLink uses reasonable technical and organisational measures to protect information.",
                "No online service is 100% secure.",
                "Users should keep login details private and avoid publishing sensitive information on public pages.",
              ]}
              icon="shield"
            />
          </LegalSection>

          <LegalSection id="retention" number={11} title="Data Retention">
            <p>
              Information is kept as long as needed to provide the service,
              manage accounts, profiles, tags, orders, support, safety, legal,
              and record purposes. Users may request deletion or updates.
            </p>
            <p>
              Some records may be kept where needed for legal, support, fraud
              prevention, accounting, or order history purposes.
            </p>
          </LegalSection>

          <LegalSection
            id="requests"
            number={12}
            title="Access, Correction, Withdrawal, and Deletion Requests"
          >
            <LegalBulletList
              items={[
                "You may request access to personal data we hold about you.",
                "You may request correction of inaccurate personal data.",
                "You may request deletion where applicable.",
                "You may withdraw consent where processing is based on consent, subject to legal and operational limits.",
                "You can contact support for help with these requests.",
              ]}
              icon="record"
            />
          </LegalSection>

          <LegalSection id="cross-border" number={13} title="Cross-Border Processing">
            <p>
              Some service providers may process or store information outside
              Malaysia. MyPetLink will take reasonable steps to protect
              information when using such providers.
            </p>
          </LegalSection>

          <LegalSection id="children" number={14} title="Children and Minors">
            <LegalBulletList
              items={[
                "MyPetLink is intended for pet owners.",
                "If a user is under the age of majority, they should use MyPetLink with parent or guardian consent.",
                "We do not knowingly collect information from children without appropriate consent.",
              ]}
              icon="users"
            />
          </LegalSection>

          <LegalSection id="changes" number={15} title="Changes to This Privacy Notice">
            <p>
              This Privacy Notice may be updated from time to time. The updated
              date will be shown on this page. Continued use of MyPetLink means
              you accept the updated Notice where applicable.
            </p>
          </LegalSection>

          <LegalSection id="contact" number={16} title="Contact">
            <p>
              For privacy questions, access or correction requests, deletion
              requests, or support, contact:
            </p>
            <div className="rounded-[1.25rem] bg-pet-cream p-4">
              <p className="font-black text-pet-ink">
                {siteConfig.productName} by {siteConfig.companyName}
              </p>
              <p>{siteConfig.country}</p>
              <p>Business Registration No.: {siteConfig.businessRegistrationNo}</p>
              <p>
                <a
                  className="font-bold text-pet-teal hover:underline"
                  href={`mailto:${siteConfig.supportEmail}`}
                >
                  {siteConfig.supportEmail}
                </a>
              </p>
            </div>
          </LegalSection>
        </div>
      </section>
    </PublicLayout>
  );
}

function InfoGroup({
  body,
  icon,
  items,
  title,
}: {
  body?: string;
  icon: IconName;
  items: string[];
  title: string;
}) {
  return (
    <div className="rounded-[1.25rem] bg-pet-cream p-4">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-pet-teal shadow-sm">
          <Icon name={icon} className="h-5 w-5" />
        </span>
        <h3 className="font-black text-pet-ink">{title}</h3>
      </div>
      {body ? <p className="mt-3 text-sm leading-6">{body}</p> : null}
      <div className="mt-3">
        <LegalBulletList items={items} icon={icon} />
      </div>
    </div>
  );
}

function VisibilityCard({
  icon,
  items,
  title,
}: {
  icon: IconName;
  items: string[];
  title: string;
}) {
  return (
    <div className="rounded-[1.25rem] bg-pet-cream p-4">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-pet-teal shadow-sm">
          <Icon name={icon} className="h-5 w-5" />
        </span>
        <h3 className="text-sm font-black leading-5 text-pet-ink">{title}</h3>
      </div>
      <div className="mt-3">
        <LegalBulletList items={items} icon={icon} />
      </div>
    </div>
  );
}
