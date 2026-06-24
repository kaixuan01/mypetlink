"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import {
  createTagOrder,
  getEstimatedTagPrice,
} from "@/services/tagService";
import type {
  DeliveryDetails,
  Pet,
  TagDesign,
  TagOrder,
  TagType,
} from "@/types";

type TagOrderFlowProps = {
  pets: Pet[];
  preselectedPetId?: string;
  initialTagType?: TagType;
  replacementForTagId?: string;
};

type DeliveryField = keyof DeliveryDetails;

const tagTypes: {
  type: TagType;
  title: string;
  description: string;
}[] = [
  {
    type: "MyPetLink QR Pet Tag",
    title: "MyPetLink QR Pet Tag",
    description: "Easy to scan and works with any smartphone camera.",
  },
  {
    type: "MyPetLink QR + NFC Smart Tag",
    title: "MyPetLink QR + NFC Smart Tag",
    description: "Scan the QR or tap the NFC tag to open the same pet profile.",
  },
];

const designs: TagDesign[] = [
  "Round Tag",
  "Bone Shape",
  "Minimal Tag",
  "Cute Paw Tag",
];

const steps = [
  "Select Pet",
  "Choose Tag Type",
  "Choose Design",
  "Preview",
  "Delivery Details",
  "Confirm Order",
];

const emptyDelivery: DeliveryDetails = {
  recipientName: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  postcode: "",
  city: "",
  state: "",
  notes: "",
};

const qrCells = [
  1, 1, 1, 0, 1, 0, 1, 1, 1,
  1, 0, 1, 0, 0, 1, 1, 0, 1,
  1, 1, 1, 1, 0, 1, 1, 1, 1,
  0, 0, 1, 0, 1, 1, 0, 1, 0,
  1, 0, 0, 1, 1, 0, 1, 0, 1,
  0, 1, 1, 0, 0, 1, 0, 1, 1,
  1, 1, 1, 1, 0, 1, 1, 0, 1,
  1, 0, 1, 0, 1, 0, 0, 1, 0,
  1, 1, 1, 0, 1, 1, 1, 0, 1,
];

export function TagOrderFlow({
  pets,
  preselectedPetId,
  initialTagType = "MyPetLink QR Pet Tag",
  replacementForTagId,
}: TagOrderFlowProps) {
  const [step, setStep] = useState(0);
  const [petId, setPetId] = useState(preselectedPetId ?? pets[0]?.id ?? "");
  const [tagType, setTagType] = useState<TagType>(initialTagType);
  const [design, setDesign] = useState<TagDesign>("Round Tag");
  const [delivery, setDelivery] = useState<DeliveryDetails>(emptyDelivery);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [createdOrder, setCreatedOrder] = useState<TagOrder | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedPet = useMemo(
    () => pets.find((pet) => pet.id === petId),
    [petId, pets]
  );
  const estimatedPrice = getEstimatedTagPrice(tagType);

  function updateDelivery(field: DeliveryField, value: string) {
    setDelivery((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  }

  function validateCurrentStep() {
    const nextErrors: Record<string, string> = {};

    addStepErrors(step, nextErrors);
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function validateAllSteps() {
    const nextErrors: Record<string, string> = {};

    [0, 1, 2, 4].forEach((stepIndex) => addStepErrors(stepIndex, nextErrors));
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      if (nextErrors.petId) {
        setStep(0);
      } else if (nextErrors.tagType) {
        setStep(1);
      } else if (nextErrors.design) {
        setStep(2);
      } else {
        setStep(4);
      }
    }

    return Object.keys(nextErrors).length === 0;
  }

  function addStepErrors(stepIndex: number, nextErrors: Record<string, string>) {
    if (stepIndex === 0 && !petId) {
      nextErrors.petId = "Choose a pet for this tag.";
    }

    if (stepIndex === 1 && !tagType) {
      nextErrors.tagType = "Choose a tag type.";
    }

    if (stepIndex === 2 && !design) {
      nextErrors.design = "Choose a tag design.";
    }

    if (stepIndex === 4) {
      if (!delivery.recipientName.trim()) {
        nextErrors.recipientName = "Add the recipient name.";
      }
      if (!delivery.phone.trim()) {
        nextErrors.phone = "Add a phone number.";
      }
      if (!delivery.addressLine1.trim()) {
        nextErrors.addressLine1 = "Add the delivery address.";
      }
      if (!delivery.postcode.trim()) {
        nextErrors.postcode = "Add the postcode.";
      }
      if (!delivery.city.trim()) {
        nextErrors.city = "Add the city.";
      }
      if (!delivery.state.trim()) {
        nextErrors.state = "Add the state.";
      }
    }
  }

  function goNext() {
    if (validateCurrentStep()) {
      setStep((current) => Math.min(current + 1, steps.length - 1));
    }
  }

  async function handleConfirm() {
    if (!selectedPet || !validateAllSteps()) {
      return;
    }

    setIsSubmitting(true);
    const response = await createTagOrder({
      petId: selectedPet.id,
      tagType,
      design,
      delivery,
      replacementForTagId,
    });
    setCreatedOrder(response.data.order);
    setIsSubmitting(false);
  }

  if (!pets.length) {
    return (
      <EmptyState
        title="Create a pet profile first"
        description="A physical tag needs a pet profile so finders can contact you quickly."
        actionHref="/pets/new"
        actionLabel="Add Pet"
      />
    );
  }

  if (createdOrder && selectedPet) {
    return (
      <section className="rounded-[1.75rem] border border-pet-mint bg-[#e8f8f0] p-6 shadow-sm">
        <Badge tone="mint">Order received</Badge>
        <h2 className="mt-4 text-3xl font-black text-pet-ink">
          Your tag order has been received.
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-pet-muted">
          We will prepare your pet tag and update the order status here.
        </p>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <SummaryItem label="Pet" value={selectedPet.name} />
          <SummaryItem label="Tag" value={createdOrder.tagType} />
          <SummaryItem label="Status" value={createdOrder.status} />
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <CTAButton href="/orders" icon="record">
            View Orders
          </CTAButton>
          <CTAButton
            href={`/pets/${selectedPet.id}/tags`}
            icon="tag"
            variant="secondary"
          >
            View Smart Tags
          </CTAButton>
          <CTAButton href="/dashboard" variant="outline">
            Go to Dashboard
          </CTAButton>
        </div>
      </section>
    );
  }

  return (
    <section className="brand-card rounded-[1.75rem] p-5 sm:p-6">
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {steps.map((label, index) => (
          <button
            className={`min-h-14 rounded-2xl px-3 py-2 text-xs font-bold transition ${
              index === step
                ? "bg-pet-teal text-white"
                : index < step
                  ? "bg-[#e8f8f0] text-pet-sage"
                  : "bg-pet-cream text-pet-muted"
            }`}
            key={label}
            onClick={() => setStep(index)}
            type="button"
          >
            <span className="block text-[10px] uppercase">Step {index + 1}</span>
            {label}
          </button>
        ))}
      </div>

      <div className="mt-6">{renderStep()}</div>

      <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-bold text-pet-ink transition hover:bg-pet-cream"
          href={selectedPet ? `/pets/${selectedPet.id}/tags` : "/tags"}
        >
          Cancel
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row">
          {step > 0 ? (
            <button
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-bold text-pet-ink transition hover:bg-pet-cream"
              onClick={() => setStep((current) => Math.max(current - 1, 0))}
              type="button"
            >
              Back
            </button>
          ) : null}
          {step < steps.length - 1 ? (
            <button
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-teal bg-pet-teal px-5 py-3 text-sm font-bold text-white shadow-lg shadow-[#1570ef]/20 transition hover:bg-[#0f5fd0]"
              onClick={goNext}
              type="button"
            >
              Continue
            </button>
          ) : (
            <button
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-teal bg-pet-teal px-5 py-3 text-sm font-bold text-white shadow-lg shadow-[#1570ef]/20 transition hover:bg-[#0f5fd0] disabled:cursor-wait disabled:opacity-70"
              disabled={isSubmitting}
              onClick={handleConfirm}
              type="button"
            >
              {isSubmitting ? "Confirming..." : "Confirm Order"}
            </button>
          )}
        </div>
      </div>
    </section>
  );

  function renderStep() {
    if (step === 0) {
      return (
        <StepShell
          title="Select Pet"
          description="Choose which pet this tag belongs to."
        >
          <div className="grid gap-3 md:grid-cols-2">
            {pets.map((pet) => (
              <button
                className={`rounded-[1.25rem] border p-4 text-left transition ${
                  petId === pet.id
                    ? "border-pet-teal bg-[#e8f3ff]"
                    : "border-pet-border bg-pet-cream"
                }`}
                key={pet.id}
                onClick={() => {
                  setPetId(pet.id);
                  setErrors((current) => ({ ...current, petId: "" }));
                }}
                type="button"
              >
                <p className="text-lg font-black text-pet-ink">{pet.name}</p>
                <p className="mt-1 text-sm text-pet-muted">
                  {pet.species} - {pet.breed}
                </p>
              </button>
            ))}
          </div>
          <ErrorText message={errors.petId} />
        </StepShell>
      );
    }

    if (step === 1) {
      return (
        <StepShell
          title="Choose Tag Type"
          description="Both tag options open your pet's safe profile."
        >
          <div className="grid gap-4 md:grid-cols-2">
            {tagTypes.map((option) => (
              <button
                className={`rounded-[1.25rem] border p-5 text-left transition ${
                  tagType === option.type
                    ? "border-pet-teal bg-[#e8f3ff]"
                    : "border-pet-border bg-pet-cream"
                }`}
                key={option.type}
                onClick={() => setTagType(option.type)}
                type="button"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xl font-black text-pet-ink">
                    {option.title}
                  </h3>
                  <Badge tone={option.type.includes("NFC") ? "mint" : "warm"}>
                    {getEstimatedTagPrice(option.type)}
                  </Badge>
                </div>
                <p className="mt-3 text-sm leading-6 text-pet-muted">
                  {option.description}
                </p>
              </button>
            ))}
          </div>
        </StepShell>
      );
    }

    if (step === 2) {
      return (
        <StepShell
          title="Choose Design"
          description="Pick a shape that feels right for your pet."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {designs.map((option) => (
              <button
                className={`min-h-36 rounded-[1.25rem] border p-4 text-center transition ${
                  design === option
                    ? "border-pet-coral bg-pet-apricot"
                    : "border-pet-border bg-pet-cream"
                }`}
                key={option}
                onClick={() => setDesign(option)}
                type="button"
              >
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white text-pet-coral">
                  <Icon name="tag" className="h-6 w-6" />
                </span>
                <span className="mt-3 block text-sm font-black text-pet-ink">
                  {option}
                </span>
              </button>
            ))}
          </div>
        </StepShell>
      );
    }

    if (step === 3) {
      return (
        <StepShell
          title="Preview"
          description="Check how the tag will be prepared for your pet."
        >
          <div className="grid gap-5 lg:grid-cols-[220px_1fr] lg:items-center">
            <div className="rounded-[1.5rem] bg-pet-cream p-5 text-center">
              <div className="mx-auto grid aspect-square max-w-44 grid-cols-9 gap-1 rounded-[1.25rem] bg-white p-4 shadow-inner">
                {qrCells.map((cell, index) => (
                  <span
                    className={
                      cell
                        ? "rounded-[0.2rem] bg-pet-ink"
                        : "rounded-sm bg-transparent"
                    }
                    key={`${cell}-${index}`}
                  />
                ))}
              </div>
              {tagType === "MyPetLink QR + NFC Smart Tag" ? (
                <Badge tone="mint">NFC tap enabled</Badge>
              ) : null}
            </div>
            <div className="grid gap-3">
              <SummaryItem label="Pet" value={selectedPet?.name ?? "Pet"} />
              <SummaryItem label="Tag type" value={tagType} />
              <SummaryItem label="Design" value={design} />
              <SummaryItem
                label="Profile"
                value={selectedPet?.finderProfileUrl ?? "/t/your-tag"}
              />
            </div>
          </div>
        </StepShell>
      );
    }

    if (step === 4) {
      return (
        <StepShell
          title="Delivery Details"
          description="Add the address where your pet tag should be sent."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Recipient name" error={errors.recipientName}>
              <input
                className="brand-input"
                onChange={(event) =>
                  updateDelivery("recipientName", event.target.value)
                }
                placeholder="Aina Rahman"
                type="text"
                value={delivery.recipientName}
              />
            </Field>
            <Field label="Phone number" error={errors.phone}>
              <input
                className="brand-input"
                onChange={(event) => updateDelivery("phone", event.target.value)}
                placeholder="+60123456789"
                type="tel"
                value={delivery.phone}
              />
            </Field>
            <Field label="Address line 1" error={errors.addressLine1}>
              <input
                className="brand-input"
                onChange={(event) =>
                  updateDelivery("addressLine1", event.target.value)
                }
                placeholder="Street, building, unit"
                type="text"
                value={delivery.addressLine1}
              />
            </Field>
            <Field label="Address line 2" error={errors.addressLine2}>
              <input
                className="brand-input"
                onChange={(event) =>
                  updateDelivery("addressLine2", event.target.value)
                }
                placeholder="Area or landmark"
                type="text"
                value={delivery.addressLine2}
              />
            </Field>
            <Field label="Postcode" error={errors.postcode}>
              <input
                className="brand-input"
                onChange={(event) =>
                  updateDelivery("postcode", event.target.value)
                }
                placeholder="47300"
                type="text"
                value={delivery.postcode}
              />
            </Field>
            <Field label="City" error={errors.city}>
              <input
                className="brand-input"
                onChange={(event) => updateDelivery("city", event.target.value)}
                placeholder="Petaling Jaya"
                type="text"
                value={delivery.city}
              />
            </Field>
            <Field label="State" error={errors.state}>
              <input
                className="brand-input"
                onChange={(event) => updateDelivery("state", event.target.value)}
                placeholder="Selangor"
                type="text"
                value={delivery.state}
              />
            </Field>
            <Field label="Notes for delivery" error={errors.notes}>
              <input
                className="brand-input"
                onChange={(event) => updateDelivery("notes", event.target.value)}
                placeholder="Call before delivery"
                type="text"
                value={delivery.notes}
              />
            </Field>
          </div>
        </StepShell>
      );
    }

    return (
      <StepShell
        title="Confirm Order"
        description="Review the tag, pet, delivery details, and estimated price."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <SummaryItem label="Selected pet" value={selectedPet?.name ?? "Pet"} />
          <SummaryItem label="Tag type" value={tagType} />
          <SummaryItem label="Design" value={design} />
          <SummaryItem label="Estimated price" value={estimatedPrice} />
          <SummaryItem label="Recipient" value={delivery.recipientName} />
          <SummaryItem
            label="Delivery"
            value={`${delivery.addressLine1}, ${delivery.postcode} ${delivery.city}, ${delivery.state}`}
          />
          <SummaryItem label="Order status" value="Received after confirmation" />
        </div>
      </StepShell>
    );
  }
}

function StepShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h2 className="text-2xl font-black text-pet-ink">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-pet-muted">{description}</p>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-bold text-pet-ink">{label}</span>
      {children}
      <ErrorText message={error} />
    </label>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.25rem] bg-pet-cream p-4">
      <p className="text-xs font-bold uppercase text-pet-muted">{label}</p>
      <p className="mt-1 break-words font-black text-pet-ink">{value}</p>
    </div>
  );
}

function ErrorText({ message }: { message?: string }) {
  return message ? (
    <span className="text-xs font-bold text-[#a63c2e]">{message}</span>
  ) : null;
}
