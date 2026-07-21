"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ManualPaymentPanel } from "@/components/portal/ManualPaymentPanel";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { PhoneNumberInput } from "@/components/ui/PhoneNumberInput";
import { paymentConfig } from "@/config/payment";
import { formatOrderNumber } from "@/lib/orders";
import { readOwnerSettings } from "@/lib/ownerSettings";
import { getPetSummaryLabel } from "@/lib/petDisplay";
import { getActivePets, isActivePet } from "@/lib/petLifecycle";
import { isValidE164, normalizeStoredPhone } from "@/lib/phone";
import { ownerRoutes } from "@/lib/routes";
import { isApiConfigured } from "@/services/apiConfig";
import { getPets } from "@/services/petService";
import {
  formatCatalogPrice,
  listTagProducts,
  type TagProduct,
  type TagProductVariant,
} from "@/services/tagCatalogService";
import { getOwnerOrderFieldErrors } from "@/services/ownerOrderErrors";
import { createTagOrder, getFriendlyTagErrorMessage } from "@/services/tagService";
import type { DeliveryDetails, Pet, TagOrder, TagType } from "@/types";

type TagOrderFlowProps = {
  pets: Pet[];
  preselectedPetId?: string;
  initialTagType?: TagType;
  replacementForTagId?: string;
};

type CatalogChoice = { product: TagProduct; variant: TagProductVariant };
type DeliveryField = keyof DeliveryDetails;

const steps = ["Choose Tag", "Select Pet", "Delivery Details", "Confirm Order"];
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

export function TagOrderFlow({
  pets,
  preselectedPetId,
  initialTagType = "MyPetLink QR Pet Tag",
  replacementForTagId,
}: TagOrderFlowProps) {
  const apiMode = isApiConfigured();
  const [availablePets, setAvailablePets] = useState<Pet[]>(apiMode ? [] : pets);
  const [products, setProducts] = useState<TagProduct[]>([]);
  const [selectedVariantKey, setSelectedVariantKey] = useState("");
  const [petId, setPetId] = useState(preselectedPetId ?? "");
  const [delivery, setDelivery] = useState<DeliveryDetails>(emptyDelivery);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  // Non-failure information the customer must act on, e.g. a price that moved
  // between opening the review and placing the order.
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<TagOrder | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);

  const orderPrefsKey = useSyncExternalStore(subscribeNoop, getBrowserOrderPrefsKey, getDefaultOrderPrefsKey);
  const orderPrefs = useMemo(() => parseOrderPrefs(orderPrefsKey), [orderPrefsKey]);
  const replacementFor = orderPrefs.replacementForTagId ?? replacementForTagId;
  const preferredNfc = (orderPrefs.tagType ?? initialTagType).includes("NFC");
  const orderablePets = useMemo(() => getActivePets(availablePets), [availablePets]);
  const choices = useMemo(
    () => products.flatMap((product) => product.variants.map((variant) => ({ product, variant }))),
    [products]
  );
  const selectedChoice = choices.find((choice) => choice.variant.key === selectedVariantKey);
  const selectedPet = orderablePets.find((pet) => pet.id === petId);
  const preselectedPet = preselectedPetId
    ? availablePets.find((pet) => pet.id === preselectedPetId)
    : undefined;

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setLoadError("");
      try {
        const [petResponse, catalog] = await Promise.all([getPets(), listTagProducts()]);
        if (!active) return;
        const nextPets =
          preselectedPetId && !petResponse.data.some((pet) => pet.id === preselectedPetId)
            ? [pets.find((pet) => pet.id === preselectedPetId), ...petResponse.data].filter((pet): pet is Pet => Boolean(pet))
            : petResponse.data;
        const nextOrderable = getActivePets(nextPets);
        const nextChoices = catalog.flatMap((product) => product.variants.map((variant) => ({ product, variant })));
        const preferred = nextChoices.find((choice) => choice.variant.inStock && choice.variant.supportsNfc === preferredNfc)
          ?? nextChoices.find((choice) => choice.variant.inStock);
        setAvailablePets(nextPets);
        setProducts(catalog);
        setSelectedVariantKey((current) => current || preferred?.variant.key || "");
        setPetId((current) =>
          current && nextOrderable.some((pet) => pet.id === current)
            ? current
            : preselectedPetId && nextOrderable.some((pet) => pet.id === preselectedPetId)
              ? preselectedPetId
              : nextOrderable[0]?.id ?? ""
        );
      } catch (caught) {
        if (active) setLoadError(getFriendlyTagErrorMessage(caught));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [pets, preselectedPetId, preferredNfc]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const settings = readOwnerSettings();
      const inferred = inferCityState(settings.defaultGeneralArea);
      setDelivery((current) => ({
        ...current,
        recipientName: current.recipientName || settings.ownerDisplayName,
        phone: current.phone || settings.phoneNumber || settings.whatsappNumber,
        city: current.city || inferred.city,
        state: current.state || inferred.state,
      }));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (preselectedPet && !isActivePet(preselectedPet)) {
    return <EmptyState title="Physical tags are for active profiles" description={`${preselectedPet.name} is not an active pet profile. Existing tag history remains available, but new physical tags can only be ordered for active pets.`} actionHref={ownerRoutes.petTags(preselectedPet.id)} actionLabel="View Smart Tags" />;
  }
  if (loading) return <div className="brand-card rounded-[1.75rem] p-6 text-sm font-semibold text-pet-muted">Loading available tags...</div>;
  if (loadError) return <EmptyState title="Tag products could not load" description={loadError} actionHref={ownerRoutes.dashboard} actionLabel="Back to Dashboard" />;
  if (!orderablePets.length) return <EmptyState title="No active profiles available" description="A physical tag needs an active pet profile so finders can contact you quickly." actionHref={ownerRoutes.petNew} actionLabel="Add Pet" />;
  if (!choices.length) return <EmptyState title="No tag products are available" description="Physical tags are not available to order right now. Please check again soon." actionHref={ownerRoutes.tags} actionLabel="Back to Smart Tags" />;

  if (createdOrder && selectedPet && createdOrder.status !== "Pending Payment") {
    return (
      <section className="rounded-[1.75rem] border border-pet-mint bg-[#e8f8f0] p-6 shadow-sm">
        <Badge tone="mint">Payment submitted</Badge>
        <h2 className="mt-4 text-2xl font-black text-pet-ink sm:text-3xl">Payment proof submitted.</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-pet-muted">We will verify your payment and prepare the tag. You can track the status anytime in your orders.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <SummaryItem label="Order number" value={formatOrderNumber(createdOrder)} />
          <SummaryItem label="Pet tag" value={createdOrder.productName ?? createdOrder.tagType} />
          <SummaryItem label="Order status" value={createdOrder.status} />
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <CTAButton href={ownerRoutes.orders} icon="record">View Orders</CTAButton>
          <CTAButton href={ownerRoutes.petTags(selectedPet.id)} icon="tag" variant="secondary">View Smart Tags</CTAButton>
          <CTAButton href={ownerRoutes.dashboard} variant="outline">Go to Dashboard</CTAButton>
        </div>
      </section>
    );
  }

  if (createdOrder && selectedPet) {
    return <ManualPaymentPanel order={createdOrder} petName={selectedPet.name} onSubmitted={setCreatedOrder} />;
  }

  const deliveryValid = isDeliveryValid(delivery);
  const reachable = [true, Boolean(selectedChoice), Boolean(selectedChoice && selectedPet), Boolean(selectedChoice && selectedPet && deliveryValid)];

  async function placeOrder() {
    const nextErrors = validateAll(selectedChoice, selectedPet, delivery);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setStep(nextErrors.product ? 0 : nextErrors.pet ? 1 : 2);
      return;
    }
    if (!selectedChoice || !selectedPet) return;
    setIsSubmitting(true);
    setFormError("");
    setNotice("");
    // One stable key per submission attempt: kept across retries of the same
    // order so the backend dedupes double-taps/retries, regenerated only after
    // a successful submission.
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = createIdempotencyKey();
    }
    try {
      // Confirm the option and its price are still what the customer is
      // looking at. Placing an order at a stale price, or for an option that
      // has just sold out, would be a surprise on the payment screen — so
      // refresh first and hand the decision back instead of submitting.
      const latest = await listTagProducts();
      const latestChoice = latest
        .flatMap((product) => product.variants.map((variant) => ({ product, variant })))
        .find((choice) => choice.variant.key === selectedChoice.variant.key);

      if (!latestChoice || !latestChoice.variant.inStock) {
        setProducts(latest);
        setStep(0);
        setErrors((current) => ({ ...current, product: "This tag option is no longer available. Please choose another option." }));
        return;
      }

      if (latestChoice.variant.price.finalPrice !== selectedChoice.variant.price.finalPrice) {
        setProducts(latest);
        setStep(3);
        setNotice("The price of this tag option has changed. Please review the updated total, then place your order again.");
        return;
      }

      const response = await createTagOrder({
        petId: selectedPet.id,
        productVariantKey: selectedChoice.variant.key,
        quantity: 1,
        delivery: { ...delivery, phone: normalizeStoredPhone(delivery.phone) },
        replacementForTagId: replacementFor,
        idempotencyKey: idempotencyKeyRef.current,
      });
      idempotencyKeyRef.current = null;
      setCreatedOrder(response.data.order);
    } catch (caught) {
      // Field-level problems belong beside the control that needs fixing;
      // entered details are always kept.
      const fieldErrors = getOwnerOrderFieldErrors(caught);
      if (Object.keys(fieldErrors).length) {
        setErrors((current) => ({ ...current, ...fieldErrors }));
        setStep(fieldErrors.product ? 0 : fieldErrors.pet ? 1 : 2);
      }
      setFormError(getFriendlyTagErrorMessage(caught));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="brand-card min-w-0 rounded-[1.75rem] p-4 sm:p-6">
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {steps.map((label, index) => (
          <li key={label}>
            <button aria-current={step === index ? "step" : undefined} aria-disabled={!reachable[index]} className={`flex min-h-14 w-full flex-col justify-center rounded-2xl px-3 py-2 text-left text-xs font-bold ${step === index ? "bg-pet-teal text-white" : reachable[index] ? "bg-pet-cream text-pet-muted" : "cursor-not-allowed bg-pet-cream/60 text-pet-muted/50"}`} onClick={() => reachable[index] && setStep(index)} type="button">
              <span className="text-[10px] uppercase tracking-wide">Step {index + 1}</span>{label}
            </button>
          </li>
        ))}
      </ol>

      <div className="mt-6">
        {step === 0 ? <ProductStep choices={choices} selectedKey={selectedVariantKey} onSelect={(key) => { setSelectedVariantKey(key); setErrors((current) => ({ ...current, product: "" })); }} error={errors.product} /> : null}
        {step === 1 ? <PetStep pets={orderablePets} selectedPetId={petId} onSelect={(id) => { setPetId(id); setErrors((current) => ({ ...current, pet: "" })); }} error={errors.pet} /> : null}
        {step === 2 ? <DeliveryStep delivery={delivery} errors={errors} onChange={(field, value) => { setDelivery((current) => ({ ...current, [field]: value })); setErrors((current) => ({ ...current, [field]: "" })); }} /> : null}
        {step === 3 && selectedChoice && selectedPet ? <ConfirmationStep choice={selectedChoice} delivery={delivery} pet={selectedPet} /> : null}
      </div>

      <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-bold text-pet-ink" href={selectedPet ? ownerRoutes.petTags(selectedPet.id) : ownerRoutes.tags}>Cancel</Link>
        <div className="flex flex-col gap-3 sm:flex-row">
          {step > 0 ? <button className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-bold text-pet-ink" onClick={() => setStep((current) => current - 1)} type="button">Back</button> : null}
          {step < 3 ? <button className="inline-flex min-h-12 items-center justify-center rounded-full bg-pet-teal px-5 py-3 text-sm font-bold text-white disabled:opacity-50" disabled={!reachable[step + 1]} onClick={() => setStep((current) => current + 1)} type="button">Continue</button> : <button className="inline-flex min-h-12 items-center justify-center rounded-full bg-pet-teal px-5 py-3 text-sm font-bold text-white disabled:opacity-50" disabled={!deliveryValid || isSubmitting} onClick={() => void placeOrder()} type="button">{isSubmitting ? "Placing order..." : "Place Order"}</button>}
        </div>
      </div>
      {notice ? <p className="mt-4 rounded-xl border border-pet-teal/30 bg-[#e8f3ff] p-3 text-sm font-bold text-pet-ink" role="status">{notice}</p> : null}
      {formError ? <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800" role="alert">{formError}</p> : null}
    </section>
  );
}

function ProductStep({ choices, selectedKey, onSelect, error }: { choices: CatalogChoice[]; selectedKey: string; onSelect: (key: string) => void; error?: string }) {
  return <StepShell title="Choose your physical tag" description="Select the exact product and size that suits your pet."><div className="grid min-w-0 gap-4 lg:grid-cols-2">{choices.map(({ product, variant }) => { const image = variant.media[0] ?? product.media[0]; const discounted = variant.price.discountAmount > 0 && variant.price.finalPrice < variant.price.basePrice; return <button aria-pressed={selectedKey === variant.key} className={`min-w-0 overflow-hidden rounded-2xl border text-left transition ${selectedKey === variant.key ? "border-pet-teal bg-[#e8f3ff] ring-2 ring-pet-teal/20" : "border-pet-border bg-white"}`} disabled={!variant.inStock} key={variant.key} onClick={() => onSelect(variant.key)} type="button">{image ? <div className="relative aspect-[16/8] w-full bg-pet-cream"><Image alt={image.altText} className="object-cover" fill sizes="(max-width: 1024px) 100vw, 50vw" src={image.url} unoptimized /></div> : <div className="grid aspect-[16/6] place-items-center bg-pet-cream text-sm font-black text-pet-teal">MyPetLink Smart Tag</div>}<div className="p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-lg font-black text-pet-ink">{product.name}</h3><p className="mt-0.5 text-sm font-semibold text-pet-muted">{variant.name} · {variant.tagVariant}</p></div><Price price={variant.price} /></div><p className="mt-3 text-sm leading-6 text-pet-muted">{product.shortDescription}</p><div className="mt-3 flex flex-wrap gap-2"><FeatureBadges variant={variant} /><Badge tone="soft">{dimensions(variant)}</Badge>{variant.material ? <Badge tone="soft">{variant.material}</Badge> : null}</div>{discounted && variant.price.promotionLabel ? <p className="mt-3 text-xs font-bold text-pet-coral">{variant.price.promotionLabel}</p> : null}<p className={`mt-3 text-xs font-bold ${variant.inStock ? "text-pet-sage" : "text-pet-coral"}`}>{variant.inStock ? "Available" : "Temporarily unavailable — please choose another option"}</p></div></button>; })}</div><ErrorText message={error} /></StepShell>;
}

function PetStep({ pets, selectedPetId, onSelect, error }: { pets: Pet[]; selectedPetId: string; onSelect: (id: string) => void; error?: string }) {
  return <StepShell title="Select pet" description="Choose which pet will use this physical tag."><div className="grid gap-3 md:grid-cols-2">{pets.map((pet) => <button aria-pressed={selectedPetId === pet.id} className={`rounded-2xl border p-4 text-left ${selectedPetId === pet.id ? "border-pet-teal bg-[#e8f3ff]" : "border-pet-border bg-pet-cream"}`} key={pet.id} onClick={() => onSelect(pet.id)} type="button"><p className="text-lg font-black text-pet-ink">{pet.name}</p><p className="mt-1 text-sm text-pet-muted">{getPetSummaryLabel(pet)}</p></button>)}</div><ErrorText message={error} /></StepShell>;
}

function DeliveryStep({ delivery, errors, onChange }: { delivery: DeliveryDetails; errors: Record<string, string>; onChange: (field: DeliveryField, value: string) => void }) {
  return <StepShell title="Delivery details" description="Add the address where your physical tag should be sent."><div className="grid gap-4 md:grid-cols-2"><Field label="Recipient name" error={errors.recipientName}><input className="brand-input" value={delivery.recipientName} onChange={(event) => onChange("recipientName", event.target.value)} /></Field><PhoneNumberInput error={errors.phone} label="Phone number" onChange={(value) => onChange("phone", value)} required value={delivery.phone} />{([ ["addressLine1", "Address line 1", "Street, building, unit"], ["addressLine2", "Address line 2", "Area or landmark"], ["postcode", "Postcode", "47300"], ["city", "City", "Petaling Jaya"], ["state", "State", "Selangor"], ["notes", "Notes for delivery", "Call before delivery"] ] as const).map(([key, label, placeholder]) => <Field error={errors[key]} key={key} label={label}><input className="brand-input" placeholder={placeholder} value={delivery[key]} onChange={(event) => onChange(key, event.target.value)} /></Field>)}</div></StepShell>;
}

function ConfirmationStep({ choice, pet, delivery }: { choice: CatalogChoice; pet: Pet; delivery: DeliveryDetails }) {
  const { product, variant } = choice;
  return <StepShell title="Confirm order" description="Review your tag, delivery details, and price before payment."><div className="grid gap-3 sm:grid-cols-2"><SummaryItem label="Pet tag" value={product.name} /><SummaryItem label="Option" value={`${variant.name} · ${variant.tagVariant}`} /><SummaryItem label="Features" value={featureSummary(variant)} /><SummaryItem label="For this pet" value={pet.name} /><SummaryItem label="Tag price" value={formatCatalogPrice(variant.price.finalPrice, variant.price.currency)} /><SummaryItem label="Delivery" value={paymentConfig.deliveryFee} /><SummaryItem label="Total" value={formatCatalogPrice(variant.price.finalPrice, variant.price.currency)} /><SummaryItem label="Delivery address" value={formatDeliverySummary(delivery)} /></div>{variant.price.discountAmount > 0 ? <p className="mt-4 rounded-xl bg-[#e8f8f0] p-4 text-sm font-bold text-pet-sage">{variant.price.promotionLabel ?? variant.price.promotionName}: you save {formatCatalogPrice(variant.price.discountAmount, variant.price.currency)}.</p> : null}<p className="mt-4 rounded-xl bg-pet-cream p-4 text-sm leading-6 text-pet-muted">We confirm the final amount when you place the order. After that, pay with the merchant QR code and upload your payment proof. Your tag is linked to {pet.name} once it arrives and you activate it.</p></StepShell>;
}

// Features come only from the exact option the customer picked. Nothing here
// is inferred from the product name, the style, or the price — a tag that
// cannot be tapped must never advertise NFC.
function FeatureBadges({ variant }: { variant: Pick<TagProductVariant, "supportsQr" | "supportsNfc"> }) {
  return (
    <>
      {variant.supportsQr ? <Badge tone="mint">QR code</Badge> : null}
      {variant.supportsNfc ? <Badge tone="mint">NFC tap</Badge> : null}
    </>
  );
}
function featureSummary(variant: Pick<TagProductVariant, "supportsQr" | "supportsNfc">) {
  const features = [variant.supportsQr ? "QR code" : null, variant.supportsNfc ? "NFC tap" : null].filter(Boolean);
  return features.length ? features.join(" · ") : "No scanning features";
}
function Price({ price }: { price: TagProductVariant["price"] }) { const discounted = price.discountAmount > 0 && price.finalPrice < price.basePrice; return <div className="text-right"><p className="text-lg font-black text-pet-teal">{formatCatalogPrice(price.finalPrice, price.currency)}</p>{discounted ? <p className="text-xs font-bold text-pet-muted line-through">{formatCatalogPrice(price.basePrice, price.currency)}</p> : null}</div>; }
function StepShell({ title, description, children }: { title: string; description: string; children: ReactNode }) { return <div><h2 className="text-2xl font-black text-pet-ink">{title}</h2><p className="mt-2 text-sm leading-6 text-pet-muted">{description}</p><div className="mt-5">{children}</div></div>; }
function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) { return <label className="grid gap-2"><span className="text-sm font-bold text-pet-ink">{label}</span>{children}<ErrorText message={error} /></label>; }
function ErrorText({ message }: { message?: string }) { return message ? <span className="mt-2 block text-xs font-bold text-red-700">{message}</span> : null; }
function SummaryItem({ label, value }: { label: string; value: string }) { return <div className="min-w-0 rounded-xl bg-pet-cream p-4"><p className="text-xs font-bold uppercase text-pet-muted">{label}</p><p className="mt-1 break-words font-black text-pet-ink">{value || "Not set"}</p></div>; }
function validateAll(choice: CatalogChoice | undefined, pet: Pet | undefined, delivery: DeliveryDetails) { const errors: Record<string, string> = {}; if (!choice) errors.product = "Choose an available physical tag."; if (!pet) errors.pet = "Choose a pet for this tag."; if (!delivery.recipientName.trim()) errors.recipientName = "Add the recipient name."; if (!delivery.phone.trim() || !isValidE164(delivery.phone)) errors.phone = "Please enter a valid phone number."; if (!delivery.addressLine1.trim()) errors.addressLine1 = "Add the delivery address."; if (!delivery.postcode.trim()) errors.postcode = "Add the postcode."; if (!delivery.city.trim()) errors.city = "Add the city."; if (!delivery.state.trim()) errors.state = "Add the state."; return errors; }
function isDeliveryValid(delivery: DeliveryDetails) { return Object.keys(validateAll({} as CatalogChoice, {} as Pet, delivery)).length === 0; }
function dimensions(variant: TagProductVariant) { const values = [variant.widthMm, variant.heightMm, variant.thicknessMm].filter((value): value is number => typeof value === "number"); return values.length ? `${values.join(" × ")} mm` : variant.tagVariant; }
function formatDeliverySummary(delivery: DeliveryDetails) { return [delivery.addressLine1, delivery.addressLine2, [delivery.postcode, delivery.city].filter(Boolean).join(" "), delivery.state].filter((part) => part.trim()).join(", "); }
function inferCityState(area: string) { const parts = (area ?? "").split(",").map((part) => part.trim()).filter(Boolean); return parts.length >= 2 ? { city: parts[0], state: parts.at(-1) ?? "" } : { city: "", state: "" }; }
function createIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function subscribeNoop() { return () => {}; }
function getDefaultOrderPrefsKey() { return ""; }
function getBrowserOrderPrefsKey() { const params = new URLSearchParams(window.location.search); return `${params.get("type") ?? ""}|${params.get("replacementFor") ?? ""}`; }
function parseOrderPrefs(value: string): { tagType?: TagType; replacementForTagId?: string } { const [type, replacementForTagId] = value.split("|"); return { tagType: type === "nfc" ? "MyPetLink QR + NFC Smart Tag" : type === "qr" ? "MyPetLink QR Pet Tag" : undefined, replacementForTagId: replacementForTagId || undefined }; }
