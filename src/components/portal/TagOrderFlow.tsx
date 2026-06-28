"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { ManualPaymentPanel } from "@/components/portal/ManualPaymentPanel";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { PhoneNumberInput } from "@/components/ui/PhoneNumberInput";
import { paymentConfig } from "@/config/payment";
import { formatOrderNumber } from "@/lib/orders";
import { isValidE164, normalizeStoredPhone } from "@/lib/phone";
import { readOwnerSettings } from "@/lib/ownerSettings";
import {
  createTagOrder,
  getEstimatedTagPrice,
} from "@/services/tagService";
import type {
  DeliveryDetails,
  Pet,
  TagOrder,
  TagShape,
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

const shapeOptions: { shape: TagShape; label: string; radius: string }[] = [
  { shape: "Round", label: "Round Tag", radius: "rounded-full" },
  { shape: "Bone", label: "Bone Shape", radius: "rounded-[2.5rem]" },
  { shape: "Rounded Square", label: "Minimal Tag", radius: "rounded-[1.5rem]" },
  { shape: "Paw", label: "Cute Paw Tag", radius: "rounded-[2rem]" },
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
  const [shape, setShape] = useState<TagShape>("Round");
  const [delivery, setDelivery] = useState<DeliveryDetails>(emptyDelivery);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [createdOrder, setCreatedOrder] = useState<TagOrder | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedTagType, setSelectedTagType] = useState<TagType | null>(null);

  const orderPrefsKey = useSyncExternalStore(
    subscribeNoop,
    getBrowserOrderPrefsKey,
    getDefaultOrderPrefsKey
  );
  const orderPrefs = useMemo(
    () => parseOrderPrefs(orderPrefsKey),
    [orderPrefsKey]
  );
  const tagType = selectedTagType ?? orderPrefs.tagType ?? initialTagType;
  const replacementFor = orderPrefs.replacementForTagId ?? replacementForTagId;

  const selectedPet = useMemo(
    () => pets.find((pet) => pet.id === petId),
    [petId, pets]
  );
  const estimatedPrice = getEstimatedTagPrice(tagType);
  const shapeOption =
    shapeOptions.find((option) => option.shape === shape) ?? shapeOptions[0];
  const shapeLabel = shapeOption.label;

  // Prefill delivery from the owner's account settings once on mount. Deferred
  // so it runs as a browser-only effect without a synchronous setState.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const settings = readOwnerSettings();
      const inferred = inferCityState(settings.defaultGeneralArea);
      setDelivery((current) => ({
        ...current,
        recipientName: current.recipientName || settings.ownerDisplayName,
        phone:
          current.phone ||
          settings.phoneNumber ||
          settings.whatsappNumber,
        city: current.city || inferred.city,
        state: current.state || inferred.state,
      }));
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const deliveryValid = isDeliveryValid(delivery);
  const previewReady = Boolean(selectedPet) && Boolean(tagType) && Boolean(shape);

  function isStepReachable(index: number) {
    switch (index) {
      case 0:
        return true;
      case 1:
        return Boolean(selectedPet);
      case 2:
        return Boolean(selectedPet) && Boolean(tagType);
      case 3:
      case 4:
        return previewReady;
      case 5:
        return deliveryValid;
      default:
        return false;
    }
  }

  function updateDelivery(field: DeliveryField, value: string) {
    setDelivery((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  }

  function addStepErrors(stepIndex: number, nextErrors: Record<string, string>) {
    if (stepIndex === 0 && !petId) {
      nextErrors.petId = "Choose a pet for this tag.";
    }
    if (stepIndex === 1 && !tagType) {
      nextErrors.tagType = "Choose a tag type.";
    }
    if (stepIndex === 2 && !shape) {
      nextErrors.shape = "Choose a tag design.";
    }
    if (stepIndex === 4) {
      if (!delivery.recipientName.trim()) {
        nextErrors.recipientName = "Add the recipient name.";
      }
      if (!delivery.phone.trim() || !isValidE164(delivery.phone)) {
        nextErrors.phone = "Please enter a valid phone number.";
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

  function validateCurrentStep() {
    const nextErrors: Record<string, string> = {};
    addStepErrors(step, nextErrors);
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function goToStep(index: number) {
    if (isStepReachable(index)) {
      setStep(index);
    }
  }

  function goNext() {
    if (validateCurrentStep()) {
      setStep((current) => Math.min(current + 1, steps.length - 1));
    }
  }

  function selectPet(nextPetId: string) {
    setPetId(nextPetId);
    setErrors((current) => ({ ...current, petId: "" }));
  }

  async function handlePlaceOrder() {
    const nextErrors: Record<string, string> = {};
    [0, 1, 2, 4].forEach((index) => addStepErrors(index, nextErrors));
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setStep(nextErrors.petId ? 0 : nextErrors.tagType ? 1 : nextErrors.shape ? 2 : 4);
      return;
    }

    if (!selectedPet) {
      return;
    }

    setIsSubmitting(true);
    const response = await createTagOrder({
      petId: selectedPet.id,
      tagType,
      shape,
      delivery: { ...delivery, phone: normalizeStoredPhone(delivery.phone) },
      replacementForTagId: replacementFor,
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

  // Payment proof submitted — final success state.
  if (createdOrder && selectedPet && createdOrder.status !== "Pending Payment") {
    return (
      <section className="rounded-[1.75rem] border border-pet-mint bg-[#e8f8f0] p-6 shadow-sm">
        <Badge tone="mint">Payment submitted</Badge>
        <h2 className="mt-4 text-2xl font-black text-pet-ink sm:text-3xl">
          Payment proof submitted.
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-pet-muted">
          We will verify your payment and prepare the tag. You can track the
          status anytime in your orders.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <SummaryItem label="Order number" value={formatOrderNumber(createdOrder)} />
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

  // Order placed, awaiting manual payment proof.
  if (createdOrder && selectedPet) {
    return (
      <ManualPaymentPanel
        order={createdOrder}
        petName={selectedPet.name}
        onSubmitted={(updated) => setCreatedOrder(updated)}
      />
    );
  }

  return (
    <section className="brand-card rounded-[1.75rem] p-5 sm:p-6">
      <ol className="hide-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 sm:grid sm:grid-cols-3 sm:overflow-visible lg:grid-cols-6">
        {steps.map((label, index) => {
          const reachable = isStepReachable(index);
          const isCurrent = index === step;
          const isDone = index < step && reachable;

          return (
            <li className="shrink-0 sm:shrink" key={label}>
              <button
                aria-current={isCurrent ? "step" : undefined}
                aria-disabled={!reachable}
                className={`flex min-h-14 w-40 flex-col justify-center rounded-2xl px-3 py-2 text-left text-xs font-bold transition sm:w-full ${
                  isCurrent
                    ? "bg-pet-teal text-white"
                    : isDone
                      ? "bg-[#e8f8f0] text-pet-sage"
                      : reachable
                        ? "bg-pet-cream text-pet-muted hover:bg-pet-apricot/50"
                        : "cursor-not-allowed bg-pet-cream/60 text-pet-muted/50"
                }`}
                onClick={() => (reachable ? goToStep(index) : undefined)}
                type="button"
              >
                <span className="block text-[10px] uppercase tracking-wide">
                  Step {index + 1}
                </span>
                {label}
              </button>
            </li>
          );
        })}
      </ol>

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
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-teal bg-pet-teal px-5 py-3 text-sm font-bold text-white shadow-lg shadow-[#1570ef]/20 transition hover:bg-[#0f5fd0] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!deliveryValid || isSubmitting}
              onClick={handlePlaceOrder}
              type="button"
            >
              {isSubmitting ? "Placing order..." : "Place Order"}
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
                onClick={() => selectPet(pet.id)}
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
          description="Both tag options open your pet's QR Safety Page."
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
                onClick={() => setSelectedTagType(option.type)}
                type="button"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-black text-pet-ink sm:text-xl">
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
            {shapeOptions.map((option) => (
              <button
                className={`min-h-36 rounded-[1.25rem] border p-4 text-center transition ${
                  shape === option.shape
                    ? "border-pet-coral bg-pet-apricot"
                    : "border-pet-border bg-pet-cream"
                }`}
                key={option.shape}
                onClick={() => setShape(option.shape)}
                type="button"
              >
                <span
                  className={`mx-auto grid h-14 w-14 place-items-center bg-white text-pet-coral ${option.radius}`}
                >
                  <Icon name="tag" className="h-6 w-6" />
                </span>
                <span className="mt-3 block text-sm font-black text-pet-ink">
                  {option.label}
                </span>
              </button>
            ))}
          </div>
        </StepShell>
      );
    }

    if (step === 3) {
      const explanation =
        tagType === "MyPetLink QR + NFC Smart Tag"
          ? `QR scan and NFC tap both open ${selectedPet?.name ?? "your pet"}'s QR Safety Page.`
          : `This QR opens ${selectedPet?.name ?? "your pet"}'s QR Safety Page.`;

      return (
        <StepShell
          title="Preview"
          description="Here is how your pet tag will be prepared."
        >
          <div className="grid gap-6 lg:grid-cols-[300px_1fr] lg:items-start">
            <TagMockup
              petName={selectedPet?.name ?? "Your pet"}
              radius={shapeOption.radius}
              isNfc={tagType === "MyPetLink QR + NFC Smart Tag"}
            />
            <div className="grid gap-4">
              <p className="rounded-[1.25rem] bg-[#e8f3ff] p-4 text-sm font-semibold leading-6 text-pet-ink">
                {explanation}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <SummaryItem label="Selected pet" value={selectedPet?.name ?? "Pet"} />
                <SummaryItem label="Tag type" value={tagType} />
                <SummaryItem label="Design" value={shapeLabel} />
                <SummaryItem label="Estimated price" value={estimatedPrice} />
              </div>
              <div className="rounded-[1.25rem] bg-pet-cream p-4">
                <p className="text-xs font-bold uppercase text-pet-muted">
                  QR destination
                </p>
                <p className="mt-1 font-black text-pet-ink">
                  {selectedPet?.name ?? "Your pet"}&apos;s QR Safety Page
                </p>
                <p className="mt-1 text-xs leading-5 text-pet-muted">
                  The full QR Safety Page link is reserved and shown after your
                  order is placed.
                </p>
              </div>
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
          <p className="mb-4 rounded-[1.25rem] bg-pet-cream p-4 text-sm leading-6 text-pet-muted">
            Your public general area is not a delivery address. Please enter the
            full address for shipping.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Recipient name" error={errors.recipientName}>
              <input
                className="brand-input"
                onChange={(event) =>
                  updateDelivery("recipientName", event.target.value)
                }
                placeholder="Full name"
                type="text"
                value={delivery.recipientName}
              />
            </Field>
            <PhoneNumberInput
              error={errors.phone}
              label="Phone number"
              onChange={(value) => updateDelivery("phone", value)}
              required
              value={delivery.phone}
            />
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
                inputMode="numeric"
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

    // Step 5 — Confirm Order (review before placing).
    const deliverySummary = formatDeliverySummary(delivery);

    return (
      <StepShell
        title="Confirm Order"
        description="Review your tag, delivery details, and amount before payment."
      >
        {deliveryValid ? null : (
          <div className="mb-4 flex flex-col gap-3 rounded-[1.25rem] border border-pet-coral bg-pet-apricot/60 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-bold leading-6 text-[#9b4037]">
              Some delivery details are missing. Complete them before placing
              your order.
            </p>
            <button
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-pet-coral bg-white px-4 text-sm font-bold text-pet-coral"
              onClick={() => setStep(4)}
              type="button"
            >
              Edit Delivery Details
            </button>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <SummaryItem label="Selected pet" value={selectedPet?.name ?? "Pet"} />
          <SummaryItem label="Tag type" value={tagType} />
          <SummaryItem label="Design" value={shapeLabel} />
          <SummaryItem label="Tag price" value={estimatedPrice} />
          <SummaryItem label="Delivery fee" value={paymentConfig.deliveryFee} />
          <SummaryItem label="Total amount" value={estimatedPrice} />
          <SummaryItem
            label="Delivery recipient"
            value={delivery.recipientName || "Not set"}
          />
          <SummaryItem
            label="Delivery address"
            value={deliverySummary || "Not set"}
          />
        </div>
        <p className="mt-4 rounded-[1.25rem] bg-pet-cream p-4 text-sm leading-6 text-pet-muted">
          After you place the order, you can pay with a merchant QR and submit
          your payment proof for verification.
        </p>
      </StepShell>
    );
  }
}

function TagMockup({
  petName,
  radius,
  isNfc,
}: {
  petName: string;
  radius: string;
  isNfc: boolean;
}) {
  return (
    <div className="mx-auto w-full max-w-[280px]">
      <div
        className={`relative mx-auto flex aspect-square w-full flex-col items-center justify-center border-4 border-pet-coral/30 bg-gradient-to-br from-white to-pet-apricot/40 p-5 text-center shadow-lg shadow-[#0d1b3d]/10 ${radius}`}
      >
        <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-pet-teal">
          MyPetLink
        </span>
        <div className="mt-2 grid aspect-square w-24 grid-cols-9 gap-[2px] rounded-xl bg-white p-2 shadow-inner">
          {qrCells.map((cell, index) => (
            <span
              className={cell ? "rounded-[1px] bg-pet-ink" : "bg-transparent"}
              key={`${cell}-${index}`}
            />
          ))}
        </div>
        <p className="mt-3 max-w-full truncate text-base font-black text-pet-ink">
          {petName}
        </p>
        <p className="text-[0.65rem] font-semibold text-pet-muted">
          Scan to open QR Safety Page
        </p>
      </div>
      {isNfc ? (
        <p className="mt-3 text-center">
          <Badge tone="mint">QR + NFC tap enabled</Badge>
        </p>
      ) : null}
    </div>
  );
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

function isDeliveryValid(delivery: DeliveryDetails): boolean {
  return Boolean(
    delivery.recipientName.trim() &&
      delivery.phone.trim() &&
      isValidE164(delivery.phone) &&
      delivery.addressLine1.trim() &&
      delivery.postcode.trim() &&
      delivery.city.trim() &&
      delivery.state.trim()
  );
}

function formatDeliverySummary(delivery: DeliveryDetails): string {
  return [
    delivery.addressLine1,
    delivery.addressLine2,
    [delivery.postcode, delivery.city].map((part) => part.trim()).filter(Boolean).join(" "),
    delivery.state,
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}

function inferCityState(generalArea: string): { city: string; state: string } {
  const parts = (generalArea ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return { city: parts[0], state: parts[parts.length - 1] };
  }

  return { city: "", state: "" };
}

function subscribeNoop() {
  return () => {};
}

function getDefaultOrderPrefsKey() {
  return "";
}

function getBrowserOrderPrefsKey() {
  const params = new URLSearchParams(window.location.search);
  return `${params.get("type") ?? ""}|${params.get("replacementFor") ?? ""}`;
}

function parseOrderPrefs(value: string): {
  tagType?: TagType;
  replacementForTagId?: string;
} {
  const [queryType, replacementForTagId] = value.split("|");

  return {
    tagType:
      queryType === "nfc"
        ? "MyPetLink QR + NFC Smart Tag"
        : queryType === "qr"
          ? "MyPetLink QR Pet Tag"
          : undefined,
    replacementForTagId: replacementForTagId || undefined,
  };
}
