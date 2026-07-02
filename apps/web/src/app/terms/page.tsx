import type { Metadata } from "next";
import Link from "next/link";
import { LegalBulletList, LegalHero, LegalSection } from "@/components/marketing/LegalNotice";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Terms of Use",
};

const lastUpdated = "1 July 2026";

const quickLinks = [
  { id: "acceptance", title: "Acceptance" },
  { id: "about", title: "About MyPetLink" },
  { id: "owner-responsibility", title: "Owner responsibility" },
  { id: "public-pages", title: "Public pages" },
  { id: "smart-tags", title: "Smart tags" },
  { id: "orders", title: "Orders and payment proof" },
  { id: "lost-mode", title: "Lost Mode" },
  { id: "veterinary-advice", title: "No veterinary advice" },
  { id: "user-content", title: "User content" },
  { id: "prohibited-use", title: "Prohibited use" },
  { id: "availability", title: "Availability" },
  { id: "third-party", title: "Third parties" },
  { id: "liability", title: "Liability" },
  { id: "suspension", title: "Suspension" },
  { id: "law", title: "Governing law" },
  { id: "contact", title: "Contact" },
];

export default function TermsPage() {
  return (
    <PublicLayout>
      <LegalHero
        eyebrow="Terms"
        title="Terms of Use"
        description="Please read these terms before using MyPetLink."
        lastUpdated={lastUpdated}
        links={quickLinks}
      >
        <p>
          These Terms explain the practical rules for using MyPetLink. They
          should be read together with our{" "}
          <Link className="font-bold text-pet-teal hover:underline" href="/privacy">
            Privacy Notice
          </Link>
          .
        </p>
      </LegalHero>

      <section className="bg-white px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-5xl gap-4">
          <LegalSection id="acceptance" number={1} title="Acceptance of Terms">
            <p>
              By using MyPetLink, creating a pet profile, accessing the owner
              portal, ordering a tag, opening a public profile, or scanning a QR
              or NFC tag, you agree to these Terms. If you do not agree, please
              do not use MyPetLink.
            </p>
          </LegalSection>

          <LegalSection id="about" number={2} title="About MyPetLink">
            <LegalBulletList
              items={[
                "MyPetLink helps pet owners create shareable pet profiles and QR Safety Pages.",
                "MyPetLink can support optional physical QR Pet Tags and QR + NFC Smart Tags.",
                "The service is intended to make it easier for someone who finds a pet to contact the owner.",
                "MyPetLink does not guarantee that a lost pet will be found, contacted about, or returned.",
              ]}
            />
          </LegalSection>

          <LegalSection
            id="owner-responsibility"
            number={3}
            title="Account and Owner Responsibility"
          >
            <LegalBulletList
              items={[
                "You are responsible for keeping your account, pet, and contact information accurate.",
                "You should only upload or publish information, photos, notes, and memories that you have the right to share.",
                "You must keep your login details safe and tell us if you believe your account has been misused.",
                "You should update your WhatsApp or phone details if they change, especially when finder contact is enabled.",
                "You are responsible for managing what is public and what stays private on your pet profile and QR Safety Page.",
              ]}
            />
          </LegalSection>

          <LegalSection
            id="public-pages"
            number={4}
            title="Public Pet Profiles and QR Safety Pages"
          >
            <LegalBulletList
              items={[
                "Public Share Profiles and QR Safety Pages may be visible to anyone with the link, QR code, or NFC tag.",
                "Owners choose what details to show publicly through profile and safety settings.",
                "Do not publish sensitive information such as a full home address, private notes, identity details, or anything you are not comfortable sharing.",
                "QR Safety Pages are designed for finder-friendly contact, not full owner disclosure.",
              ]}
              icon="shield"
            />
          </LegalSection>

          <LegalSection
            id="smart-tags"
            number={5}
            title="Smart Tags and Physical Products"
          >
            <LegalBulletList
              items={[
                "QR Pet Tags and QR + NFC Smart Tags are optional one-time add-ons.",
                "Smart tags connect to the pet's QR Safety Page or activation flow.",
                "Tag availability, pricing, design, packaging, and delivery timelines may vary during our early launch and as we improve fulfilment.",
                "A physical tag does not provide GPS tracking.",
                "A QR + NFC tag does not mean real-time tracking.",
                "You are responsible for attaching the tag safely to your pet's collar or accessory.",
                "MyPetLink is not responsible for damage, loss, misuse, or unsafe attachment of tags, except where required by law.",
              ]}
              icon="tag"
            />
          </LegalSection>

          <LegalSection
            id="orders"
            number={6}
            title="Payment Proof, Orders, Delivery, Cancellation, and Refunds"
          >
            <LegalBulletList
              items={[
                "During our early launch, some payment methods may be limited, and payment proof may be reviewed manually before an order is confirmed.",
                "Payment confirmation may require review before an order is prepared.",
                "Orders may only be prepared after payment is confirmed.",
                "Delivery times are estimates and are not guaranteed.",
                "Cancellation and refund handling may depend on the order status, product type, and preparation stage.",
                "Customized or printed tags may not be cancellable after preparation or printing begins, unless required by law.",
                "Tag product details, order steps, and fulfilment processes may be adjusted as we improve the service.",
              ]}
              icon="record"
            />
          </LegalSection>

          <LegalSection id="lost-mode" number={7} title="Lost Mode and Finder Contact">
            <LegalBulletList
              items={[
                "Lost Mode helps show missing pet information and contact options on public safety surfaces.",
                "MyPetLink does not provide emergency rescue, pet recovery services, veterinary services, or police or authority reporting.",
                "Finders may contact the owner through available WhatsApp or call links when those options are enabled.",
                "Owners are responsible for responding to finders and arranging a safe return.",
              ]}
              icon="phone"
            />
          </LegalSection>

          <LegalSection id="veterinary-advice" number={8} title="No Veterinary Advice">
            <p>
              Care records, notes, allergies, medication notes, and reminders are
              for owner reference only. MyPetLink does not provide veterinary
              diagnosis, treatment, or medical advice. Please consult a
              qualified veterinarian for pet health concerns.
            </p>
          </LegalSection>

          <LegalSection id="user-content" number={9} title="User Content">
            <p>
              User content may include pet names, photos, memories, care
              records, notes, public profile text, and safety notes.
            </p>
            <LegalBulletList
              items={[
                "You must not upload unlawful, harmful, offensive, misleading, infringing, abusive, or privacy-violating content.",
                "MyPetLink may remove content or restrict access if content is abusive, unsafe, illegal, or violates these Terms.",
                "You remain responsible for the content you add to MyPetLink.",
              ]}
              icon="record"
            />
          </LegalSection>

          <LegalSection id="prohibited-use" number={10} title="Prohibited Use">
            <LegalBulletList
              items={[
                "Do not misuse QR or NFC tags, links, profiles, or contact buttons.",
                "Do not impersonate another owner or create fake pet profiles for scams, harassment, or misleading activity.",
                "Do not upload malware, spam, abusive content, illegal content, or content that violates another person's rights.",
                "Do not scrape, attack, reverse engineer, overload, disrupt, or try to gain unauthorised access to the service.",
                "Do not use MyPetLink for illegal, harmful, or unsafe activities.",
              ]}
              icon="shield"
            />
          </LegalSection>

          <LegalSection id="availability" number={11} title="Availability and Changes">
            <LegalBulletList
              items={[
                "MyPetLink may change, improve, pause, or discontinue features as the product develops.",
                "Some features may be new, limited, planned, or marked as coming soon.",
                "We do not guarantee that the service will always be uninterrupted, available, or error-free.",
                "GPS Safety is planned for a future release and is not currently available.",
                "Premium Plan features are coming soon and are not currently available for subscription.",
              ]}
              icon="settings"
            />
          </LegalSection>

          <LegalSection id="third-party" number={12} title="Third-Party Services and Links">
            <p>
              MyPetLink may link to or rely on third-party services such as
              WhatsApp, phone dialers, maps, payment or payment proof tools,
              delivery providers, hosting, analytics, and support tools. Those
              services have their own terms and privacy practices. MyPetLink is
              not responsible for third-party platforms.
            </p>
          </LegalSection>

          <LegalSection id="liability" number={13} title="Disclaimer and Limitation of Liability">
            <LegalBulletList
              items={[
                'MyPetLink is provided on an "as is" and "as available" basis.',
                "MyPetLink does not guarantee pet recovery, finder response, tag scan success, uninterrupted service, or error-free operation.",
                "To the maximum extent allowed by law, MyPetLink is not liable for indirect loss, loss of data, lost pets, missed contacts, misuse of public information, or third-party actions.",
              ]}
              icon="shield"
            />
          </LegalSection>

          <LegalSection id="suspension" number={14} title="Suspension or Removal">
            <p>
              MyPetLink may suspend or remove accounts, profiles, tags, or
              content if there is abuse, a safety risk, a legal issue, or a
              violation of these Terms. Users may contact support for help
              deleting, updating, or correcting profile information.
            </p>
          </LegalSection>

          <LegalSection id="law" number={15} title="Governing Law">
            <p>These Terms are governed by the laws of Malaysia.</p>
          </LegalSection>

          <LegalSection id="contact" number={16} title="Contact">
            <p>If you have questions about these Terms, contact:</p>
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
