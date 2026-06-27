import type { Metadata } from "next";
import { AppLayout } from "@/components/layouts/AppLayout";
import { PetCard } from "@/components/portal/PetCard";
import { ProfileAccessStatus } from "@/components/portal/ProfileAccessStatus";
import { RecordCard } from "@/components/portal/RecordCard";
import { CTAButton } from "@/components/ui/CTAButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { ownerRoutes } from "@/lib/routes";
import { getPetMoments } from "@/services/momentService";
import { getPets } from "@/services/petService";
import { getPetRecords } from "@/services/recordService";
import { getAllTags, getOrders } from "@/services/tagService";

export const metadata: Metadata = {
  title: "Owner Dashboard",
};

export default async function DashboardPage() {
  const petsResponse = await getPets();
  const pets = petsResponse.data;
  const firstPet = pets[0];
  const recordsResponse = await getPetRecords(pets[0]?.id ?? "");
  const records = recordsResponse.data;
  const tagsResponse = await getAllTags();
  const ordersResponse = await getOrders();
  const momentsResponse = await getPetMoments(pets[0]?.id ?? "");
  const tags = tagsResponse.data;
  const orders = ordersResponse.data;
  const moments = momentsResponse.data;
  const upcomingVaccine = records.find((record) => record.type === "Vaccine");
  const upcomingGrooming = records.find((record) => record.type === "Grooming");
  const upcomingDeworming = records.find(
    (record) => record.type === "Deworming"
  );
  const vetFollowUp = records.find(
    (record) => record.type === "Vet Visit" && record.dueDate
  );

  const recordsNote = firstPet
    ? `Latest records for ${firstPet.name}`
    : "Latest records";
  const addRecordHref = firstPet
    ? ownerRoutes.petRecords(firstPet.id)
    : ownerRoutes.petNew;
  const addMomentHref = firstPet
    ? ownerRoutes.petMomentNew(firstPet.id)
    : ownerRoutes.petNew;
  const publicProfileHref = firstPet ? firstPet.publicProfilePath : ownerRoutes.pets;
  const qrProfileHref = firstPet ? firstPet.finderProfileUrl : ownerRoutes.pets;
  const orderTagHref = firstPet
    ? ownerRoutes.petTagOrder(firstPet.id)
    : ownerRoutes.petNew;

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Owner portal"
        title="Welcome back"
        description="Manage your pets, safety profiles, care records, memories, smart tags, and reminders in one place."
        action={
          <CTAButton href="/pets/new" icon="plus">
            Add Pet
          </CTAButton>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon="pets"
          label="Total pets"
          note="Saved pet profiles"
          value={pets.length}
        />
        <StatCard
          icon="qr"
          label="Active QR profiles"
          note="Visible public finder pages"
          tone="mint"
          value={pets.filter((pet) => pet.qrStatus === "active").length}
        />
        <StatCard
          icon="heart"
          label="Upcoming vaccine"
          note={upcomingVaccine?.dueDate ?? "No due date"}
          tone="teal"
          value={upcomingVaccine ? "1" : "0"}
        />
        <StatCard
          icon="record"
          label="Recent care records"
          note={recordsNote}
          tone="soft"
          value={records.length}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="brand-card rounded-[1.5rem] p-5">
          <h2 className="text-lg font-black text-pet-ink">Smart Tags</h2>
          <div className="mt-4 grid gap-3 text-sm">
            <DashboardMetric
              label="Active tags"
              value={tags.filter((tag) => tag.status === "Active").length}
            />
            <DashboardMetric
              label="Pending orders"
              value={orders.filter((order) => order.status === "Received").length}
            />
            <DashboardMetric label="Replacement available" value="Anytime" />
          </div>
        </section>
        <section className="brand-card rounded-[1.5rem] p-5">
          <h2 className="text-lg font-black text-pet-ink">Pet Moments</h2>
          <div className="mt-4 grid gap-3 text-sm">
            <DashboardMetric label="Recent moments" value={moments.length} />
            <DashboardMetric
              label="Public moments"
              value={
                moments.filter((moment) => moment.visibility === "Public").length
              }
            />
            <DashboardMetric
              label="Private memories"
              value={
                moments.filter((moment) => moment.visibility !== "Public").length
              }
            />
          </div>
        </section>
        <section className="brand-card rounded-[1.5rem] p-5">
          <h2 className="text-lg font-black text-pet-ink">Care Reminders</h2>
          <div className="mt-4 grid gap-3 text-sm">
            <DashboardMetric
              label="Upcoming vaccine"
              value={upcomingVaccine?.dueDate ?? "No due date"}
            />
            <DashboardMetric
              label="Upcoming deworming"
              value={upcomingDeworming?.dueDate ?? "No due date"}
            />
            <DashboardMetric
              label="Upcoming grooming"
              value={upcomingGrooming?.dueDate ?? "No due date"}
            />
            <DashboardMetric
              label="Vet follow-up"
              value={vetFollowUp?.dueDate ?? "None for now"}
            />
          </div>
        </section>
      </div>

      <div className="mt-6">
        <ProfileAccessStatus compact qrStatus={firstPet?.qrStatus} />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <section>
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-2xl font-black text-pet-ink">Your pets</h2>
            <CTAButton href="/pets" variant="secondary">
              View All
            </CTAButton>
          </div>
          <div className="grid gap-4">
            {pets.length ? (
              pets.map((pet) => <PetCard key={pet.id} pet={pet} />)
            ) : (
              <EmptyState
                title="No pets yet"
                description="Add your first pet profile to create a public QR page."
                actionHref="/pets/new"
                actionLabel="Add Pet"
              />
            )}
          </div>
        </section>

        <aside className="grid content-start gap-6">
          <section className="brand-card rounded-[1.75rem] p-5">
            <h2 className="text-xl font-black text-pet-ink">Quick Actions</h2>
            <div className="mt-5 grid gap-3">
              <CTAButton href="/pets/new" icon="plus" fullWidth>
                Add Pet
              </CTAButton>
              <CTAButton
                href={addRecordHref}
                icon="heart"
                variant="primary"
                fullWidth
              >
                Add Care Record
              </CTAButton>
              <CTAButton
                href={addMomentHref}
                icon="plus"
                variant="coral"
                fullWidth
              >
                Add Moment
              </CTAButton>
              <CTAButton
                href={publicProfileHref}
                icon="heart"
                variant="outline"
                target={firstPet ? "_blank" : undefined}
                rel={firstPet ? "noopener noreferrer" : undefined}
                fullWidth
              >
                View Public Profile
              </CTAButton>
              <CTAButton
                href={qrProfileHref}
                icon="qr"
                variant="secondary"
                target={firstPet ? "_blank" : undefined}
                rel={firstPet ? "noopener noreferrer" : undefined}
                fullWidth
              >
                View QR Safety Page
              </CTAButton>
              <CTAButton
                href={orderTagHref}
                icon="tag"
                variant="outline"
                fullWidth
              >
                Order Physical Tag
              </CTAButton>
              <CTAButton href="/orders" icon="record" variant="outline" fullWidth>
                View Orders
              </CTAButton>
            </div>
          </section>

          <section>
            <h2 className="mb-4 text-xl font-black text-pet-ink">
              Recent Records
            </h2>
            <div className="grid gap-3">
              {records.length ? (
                records.slice(0, 3).map((record) => (
                  <RecordCard key={record.id} record={record} />
                ))
              ) : (
                <EmptyState
                  icon="record"
                  title="No records yet"
                  description="Care records will appear here once they are added."
                />
              )}
            </div>
          </section>

          <section className="brand-soft-card rounded-[1.5rem] p-5">
            <h2 className="text-lg font-black text-pet-ink">
              Care Reminders
            </h2>
            <div className="mt-4 grid gap-3 text-sm">
              {records
                .filter((record) => record.dueDate)
                .slice(0, 2)
                .map((record) => (
                  <div
                    className="rounded-2xl bg-white p-4 text-pet-muted shadow-sm"
                    key={record.id}
                  >
                    <p className="font-bold text-pet-ink">{record.title}</p>
                    <p className="mt-1">Due {record.dueDate}</p>
                  </div>
                ))}
            </div>
          </section>
        </aside>
      </div>
    </AppLayout>
  );
}

function DashboardMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[1.1rem] bg-pet-cream px-4 py-3">
      <span className="font-bold text-pet-muted">{label}</span>
      <span className="font-black text-pet-ink">{value}</span>
    </div>
  );
}
