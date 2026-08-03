"use client";

import Image from "next/image";
import Link from "next/link";
import { cloneElement, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement, type ReactNode } from "react";
import { ManualPaymentPanel } from "@/components/portal/ManualPaymentPanel";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { PhoneNumberInput } from "@/components/ui/PhoneNumberInput";
import { formatOrderNumber } from "@/lib/orders";
import { formatOrderProduct, formatStateAndZone } from "@/lib/orderDisplay";
import { readOwnerSettings } from "@/lib/ownerSettings";
import { getPetSummaryLabel } from "@/lib/petDisplay";
import { getActivePets, isActivePet } from "@/lib/petLifecycle";
import { isValidE164, normalizeStoredPhone } from "@/lib/phone";
import { ownerRoutes } from "@/lib/routes";
import { isApiConfigured } from "@/services/apiConfig";
import { getPets } from "@/services/petService";
import {
  getDeliveryQuote,
  listMalaysiaStates,
  resolveLegacyStateCode,
  type DeliveryQuote,
  type MalaysiaState,
} from "@/services/deliveryService";
import {
  formatCatalogPrice,
  listTagProducts,
  type TagProduct,
  type TagProductVariant,
} from "@/services/tagCatalogService";
import { getDeliveryQuoteErrorMessage, getOwnerOrderFieldErrors, isDeliveryUnavailableError } from "@/services/ownerOrderErrors";
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
type DeliveryQuoteState =
  | { status: "idle" | "incomplete" }
  | { status: "loading"; fingerprint: string }
  | { status: "available"; fingerprint: string; quote: DeliveryQuote }
  | { status: "unavailable" | "failed"; fingerprint: string; message: string };

const steps = ["Choose Tag", "Select Pet", "Delivery Details", "Confirm Order"];
const emptyDelivery: DeliveryDetails = {
  recipientName: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  postcode: "",
  city: "",
  state: "",
  stateCode: "",
  notes: "",
};
const requiredDeliveryFields: DeliveryField[] = [
  "recipientName",
  "phone",
  "addressLine1",
  "postcode",
  "city",
  "stateCode",
];

export function TagOrderFlow({
  pets,
  preselectedPetId,
  initialTagType = "MyPetLink QR Pet Tag",
  replacementForTagId,
}: TagOrderFlowProps) {
  const apiMode = isApiConfigured();
  const [availablePets, setAvailablePets] = useState<Pet[]>(apiMode ? [] : pets);
  const [products, setProducts] = useState<TagProduct[]>([]);
  const [states, setStates] = useState<MalaysiaState[]>([]);
  const [quoteState, setQuoteState] = useState<DeliveryQuoteState>({ status: "idle" });
  const [selectedVariantKey, setSelectedVariantKey] = useState("");
  const [petId, setPetId] = useState(preselectedPetId ?? "");
  const [delivery, setDelivery] = useState<DeliveryDetails>(emptyDelivery);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [formError, setFormError] = useState("");
  // Non-failure information the customer must act on, e.g. a price that moved
  // between opening the review and placing the order.
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<TagOrder | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);
  const quoteRequestRef = useRef(0);
  const quoteControllerRef = useRef<AbortController | null>(null);
  const [quoteRetry, setQuoteRetry] = useState(0);

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
  const hasAvailableChoice = choices.some((choice) => choice.variant.inStock);
  const selectedPet = orderablePets.find((pet) => pet.id === petId);
  const preselectedPet = preselectedPetId
    ? availablePets.find((pet) => pet.id === preselectedPetId)
    : undefined;
  const deliveryValid = isDeliveryValid(delivery);
  const quoteFingerprint = createDeliveryQuoteFingerprint(delivery, selectedVariantKey);
  const quote =
    quoteState.status === "available" && quoteState.fingerprint === quoteFingerprint
      ? quoteState.quote
      : null;

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setLoadError("");
      try {
        const [petResponse, catalog, malaysiaStates] = await Promise.all([
          getPets(), listTagProducts(), listMalaysiaStates(),
        ]);
        if (!active) return;
        const nextPets = petResponse.data;
        const nextOrderable = getActivePets(nextPets);
        const nextChoices = catalog.flatMap((product) => product.variants.map((variant) => ({ product, variant })));
        const preferred = nextChoices.find((choice) => choice.variant.inStock && choice.variant.supportsNfc === preferredNfc)
          ?? nextChoices.find((choice) => choice.variant.inStock);
        setAvailablePets(nextPets);
        setProducts(catalog);
        setStates(malaysiaStates);
        setSelectedVariantKey((current) => current || preferred?.variant.key || "");
        setPetId((current) =>
          current && nextOrderable.some((pet) => pet.id === current)
            ? current
            : preselectedPetId && nextOrderable.some((pet) => pet.id === preselectedPetId)
              ? preselectedPetId
              : nextOrderable.length === 1
                ? nextOrderable[0].id
                : ""
        );
      } catch (caught) {
        if (active) setLoadError(getFriendlyTagErrorMessage(caught));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [loadAttempt, pets, preselectedPetId, preferredNfc]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const settings = readOwnerSettings();
      const inferred = inferCityState(settings.defaultGeneralArea, states);
      setDelivery((current) => ({
        ...current,
        recipientName: current.recipientName || settings.ownerDisplayName,
        phone: current.phone || settings.phoneNumber || settings.whatsappNumber,
        city: current.city || inferred.city,
        state: current.state || inferred.state,
        stateCode: current.stateCode || inferred.stateCode,
      }));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [states]);

  useEffect(() => {
    const requestNumber = ++quoteRequestRef.current;
    quoteControllerRef.current?.abort();

    if (!selectedVariantKey || !deliveryValid) {
      return;
    }

    const controller = new AbortController();
    quoteControllerRef.current = controller;
    const timer = window.setTimeout(() => {
      if (requestNumber === quoteRequestRef.current) {
        setQuoteState({ status: "loading", fingerprint: quoteFingerprint });
      }
      getDeliveryQuote(delivery.stateCode!, selectedVariantKey, controller.signal)
        .then((nextQuote) => {
          if (requestNumber === quoteRequestRef.current) {
            setQuoteState({
              status: "available",
              fingerprint: quoteFingerprint,
              quote: nextQuote,
            });
          }
        })
        .catch((caught) => {
          if (!controller.signal.aborted && requestNumber === quoteRequestRef.current) {
            setQuoteState({
              status: isDeliveryUnavailableError(caught) ? "unavailable" : "failed",
              fingerprint: quoteFingerprint,
              message: getDeliveryQuoteErrorMessage(caught),
            });
          }
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      if (quoteControllerRef.current === controller) {
        quoteControllerRef.current = null;
      }
    };
  }, [delivery.stateCode, deliveryValid, quoteFingerprint, quoteRetry, selectedVariantKey]);

  if (preselectedPet && !isActivePet(preselectedPet)) {
    return <EmptyState title="Physical tags are for active profiles" description={`${preselectedPet.name} is not an active pet profile. Existing tag history remains available, but new physical tags can only be ordered for active pets.`} actionHref={ownerRoutes.petTags(preselectedPet.id)} actionLabel="View Smart Tags" />;
  }
  if (loading) return <div className="brand-card rounded-[1.75rem] p-6 text-sm font-semibold text-pet-muted">Loading available tags...</div>;
  if (loadError) return <EmptyState title="Order details could not load" description={`${loadError} Your Smart Tag order has not started yet.`} actionOnClick={() => setLoadAttempt((current) => current + 1)} actionLabel="Try Again" />;
  if (!orderablePets.length) return <EmptyState title="No active profiles available" description="A physical tag needs an active pet profile so finders can contact you quickly." actionHref={ownerRoutes.petNewForTagOrder()} actionLabel="Add Pet" />;
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

  const reachable = [true, Boolean(selectedChoice), Boolean(selectedChoice && selectedPet), Boolean(selectedChoice && selectedPet && deliveryValid && quote)];

  async function placeOrder() {
    const nextErrors = validateAll(selectedChoice, selectedPet, delivery);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setStep(nextErrors.product ? 0 : nextErrors.pet ? 1 : 2);
      window.setTimeout(() => focusFirstInvalidField(nextErrors), 0);
      return;
    }
    if (!selectedChoice || !selectedPet || !quote || quoteState.status !== "available") return;
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

  function invalidateCurrentQuote(nextState: DeliveryQuoteState) {
    quoteRequestRef.current += 1;
    quoteControllerRef.current?.abort();
    quoteControllerRef.current = null;
    setQuoteState(nextState);
  }

  function handleProductSelect(key: string) {
    if (key !== selectedVariantKey) {
      const fingerprint = createDeliveryQuoteFingerprint(delivery, key);
      invalidateCurrentQuote(
        isDeliveryValid(delivery)
          ? { status: "loading", fingerprint }
          : { status: "incomplete" }
      );
    }
    setSelectedVariantKey(key);
    setErrors((current) => ({ ...current, product: "" }));
  }

  function handleDeliveryChange(field: DeliveryField, value: string) {
    const nextDelivery = {
      ...delivery,
      [field]: value,
      ...(field === "stateCode"
        ? { state: states.find((item) => item.code === value)?.name ?? "" }
        : {}),
    };
    const nextDeliveryValid = isDeliveryValid(nextDelivery);
    const nextFingerprint = createDeliveryQuoteFingerprint(
      nextDelivery,
      selectedVariantKey
    );
    const requiredFieldChanged = requiredDeliveryFields.includes(field);

    if (requiredFieldChanged && !nextDeliveryValid) {
      invalidateCurrentQuote({ status: "incomplete" });
    } else if (
      nextDeliveryValid &&
      (!deliveryValid || nextFingerprint !== quoteFingerprint)
    ) {
      invalidateCurrentQuote({ status: "loading", fingerprint: nextFingerprint });
    }

    setDelivery(nextDelivery);
    setErrors((current) => ({ ...current, [field]: "" }));
  }

  function retryDeliveryQuote() {
    if (quoteState.status !== "failed") return;
    invalidateCurrentQuote({ status: "loading", fingerprint: quoteFingerprint });
    setQuoteRetry((value) => value + 1);
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
        {step === 0 ? <ProductStep choices={choices} selectedKey={selectedVariantKey} onSelect={handleProductSelect} error={errors.product} /> : null}
        {step === 1 ? <PetStep pets={orderablePets} selectedPetId={petId} onSelect={(id) => { setPetId(id); setErrors((current) => ({ ...current, pet: "" })); }} error={errors.pet} /> : null}
        {step === 2 ? <DeliveryStep delivery={delivery} states={states} errors={errors} quoteState={quoteState} onRetry={retryDeliveryQuote} onChange={handleDeliveryChange} /> : null}
        {step === 3 && selectedChoice && selectedPet ? <ConfirmationStep choice={selectedChoice} delivery={delivery} pet={selectedPet} quote={quote} quoteState={quoteState} /> : null}
      </div>

      <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-bold text-pet-ink" href={selectedPet ? ownerRoutes.petTags(selectedPet.id) : ownerRoutes.tags}>Cancel</Link>
        <div className="flex flex-col gap-3 sm:flex-row">
          {step > 0 ? <button className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-bold text-pet-ink" onClick={() => setStep((current) => current - 1)} type="button">Back</button> : null}
          {step < 3 ? <button className="inline-flex min-h-12 items-center justify-center rounded-full bg-pet-teal px-5 py-3 text-sm font-bold text-white disabled:opacity-50" disabled={!reachable[step + 1] || (step === 0 && !hasAvailableChoice)} onClick={() => setStep((current) => current + 1)} type="button">Continue</button> : <button className="inline-flex min-h-12 items-center justify-center rounded-full bg-pet-teal px-5 py-3 text-sm font-bold text-white disabled:opacity-50" disabled={!deliveryValid || !quote || quoteState.status !== "available" || isSubmitting} onClick={() => void placeOrder()} type="button">{isSubmitting ? "Placing order..." : quoteState.status === "loading" ? "Updating delivery..." : "Place Order"}</button>}
        </div>
      </div>
      {notice ? <p className="mt-4 rounded-xl border border-pet-teal/30 bg-[#e8f3ff] p-3 text-sm font-bold text-pet-ink" role="status">{notice}</p> : null}
      {formError ? <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800" role="alert">{formError}</p> : null}
    </section>
  );
}

function ProductStep({ choices, selectedKey, onSelect, error }: { choices: CatalogChoice[]; selectedKey: string; onSelect: (key: string) => void; error?: string }) {
  const hasAvailableChoice = choices.some(({ variant }) => variant.inStock);
  return <StepShell title="Choose your physical tag" description="Select the exact product and size that suits your pet.">{!hasAvailableChoice ? <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900" role="status">This product is temporarily unavailable. Please check again later.</p> : null}<div className="grid min-w-0 gap-4 lg:grid-cols-2">{choices.map(({ product, variant }) => { const image = variant.media[0] ?? product.media[0]; const discounted = variant.price.discountAmount > 0 && variant.price.finalPrice < variant.price.basePrice; return <button aria-pressed={selectedKey === variant.key} className={`min-w-0 overflow-hidden rounded-2xl border text-left transition ${selectedKey === variant.key ? "border-pet-teal bg-[#e8f3ff] ring-2 ring-pet-teal/20" : "border-pet-border bg-white"}`} disabled={!variant.inStock} key={variant.key} onClick={() => onSelect(variant.key)} type="button">{image ? <div className="relative aspect-[16/8] w-full bg-pet-cream"><Image alt={image.altText} className="object-cover" fill sizes="(max-width: 1024px) 100vw, 50vw" src={image.url} unoptimized /></div> : <div className="grid aspect-[16/6] place-items-center bg-gradient-to-br from-[#eef6ff] to-pet-cream text-sm font-black text-pet-teal"><span className="rounded-full border border-pet-border bg-white px-4 py-2">Product image coming soon</span></div>}<div className="p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h3 className="break-words text-lg font-black text-pet-ink">{product.name}</h3><p className="mt-0.5 text-sm font-semibold text-pet-muted">{formatProductOption(variant)}</p></div><Price price={variant.price} /></div><p className="mt-3 text-sm leading-6 text-pet-muted">{product.shortDescription}</p><div className="mt-3 flex flex-wrap gap-2"><FeatureBadges variant={variant} /><Badge tone="soft">{dimensions(variant)}</Badge>{variant.material ? <Badge tone="soft">{variant.material}</Badge> : null}</div>{discounted && variant.price.promotionLabel ? <p className="mt-3 text-xs font-bold text-pet-coral">{variant.price.promotionLabel}</p> : null}<p className={`mt-3 text-xs font-bold ${variant.inStock ? "text-pet-sage" : "text-pet-coral"}`}>{variant.inStock ? "Available" : hasAvailableChoice ? "Temporarily unavailable — please choose another option" : "Temporarily unavailable"}</p></div></button>; })}</div><ErrorText message={error} /></StepShell>;
}

function PetStep({ pets, selectedPetId, onSelect, error }: { pets: Pet[]; selectedPetId: string; onSelect: (id: string) => void; error?: string }) {
  return <StepShell title="Select pet" description="Choose which pet will use this physical tag."><div className="grid gap-3 md:grid-cols-2">{pets.map((pet) => <button aria-pressed={selectedPetId === pet.id} className={`rounded-2xl border p-4 text-left ${selectedPetId === pet.id ? "border-pet-teal bg-[#e8f3ff]" : "border-pet-border bg-pet-cream"}`} key={pet.id} onClick={() => onSelect(pet.id)} type="button"><p className="text-lg font-black text-pet-ink">{pet.name}</p><p className="mt-1 text-sm text-pet-muted">{getPetSummaryLabel(pet)}</p></button>)}</div><ErrorText message={error} /></StepShell>;
}

function DeliveryStep({ delivery, states, errors, quoteState, onRetry, onChange }: { delivery: DeliveryDetails; states: MalaysiaState[]; errors: Record<string, string>; quoteState: DeliveryQuoteState; onRetry: () => void; onChange: (field: DeliveryField, value: string) => void }) {
  return <StepShell title="Delivery details" description="Malaysia delivery only. Select the state where your physical tag should be sent."><div className="grid gap-4 md:grid-cols-2"><Field id="delivery-recipientName" label="Recipient name" error={errors.recipientName} required><input className="brand-input" value={delivery.recipientName} onChange={(event) => onChange("recipientName", event.target.value)} /></Field><PhoneNumberInput error={errors.phone} label="Phone number" onChange={(value) => onChange("phone", value)} required value={delivery.phone} />{([ ["addressLine1", "Address line 1", "Street, building, unit", true], ["addressLine2", "Address line 2", "Area or landmark", false], ["postcode", "Postcode", "47300", true], ["city", "City", "Petaling Jaya", true], ["notes", "Notes for delivery", "Call before delivery", false] ] as const).map(([key, label, placeholder, required]) => <Field error={errors[key]} id={`delivery-${key}`} key={key} label={label} required={required}><input className="brand-input" placeholder={placeholder} value={delivery[key]} onChange={(event) => onChange(key, event.target.value)} /></Field>)}<Field id="delivery-stateCode" label="State" error={errors.stateCode} required><select className="brand-input" value={delivery.stateCode ?? ""} onChange={(event) => onChange("stateCode", event.target.value)}><option value="">Select a state</option>{states.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}</select></Field><Field id="delivery-country" label="Country"><input className="brand-input bg-pet-cream" readOnly value="Malaysia" /></Field></div><div aria-atomic="true" aria-live="polite" className="mt-4" data-testid="delivery-quote-status">{quoteState.status === "loading" ? <p className="rounded-xl bg-pet-cream p-3 text-sm font-bold text-pet-muted">Calculating delivery...</p> : quoteState.status === "available" ? <p className="rounded-xl bg-[#e8f8f0] p-3 text-sm font-bold text-pet-sage">Delivery is available for the selected address. Delivery fee: {formatCatalogPrice(quoteState.quote.deliveryFee, quoteState.quote.currency)}.</p> : quoteState.status === "unavailable" || quoteState.status === "failed" ? <div className="rounded-xl border border-red-200 bg-red-50 p-3"><p className="text-sm font-bold text-red-800">{quoteState.message}</p>{quoteState.status === "failed" ? <button className="mt-2 text-sm font-black text-pet-teal underline" onClick={onRetry} type="button">Try delivery quote again</button> : null}</div> : null}</div></StepShell>;
}

function ConfirmationStep({ choice, pet, delivery, quote, quoteState }: { choice: CatalogChoice; pet: Pet; delivery: DeliveryDetails; quote: DeliveryQuote | null; quoteState: DeliveryQuoteState }) {
  const { product, variant } = choice;
  if (quoteState.status === "loading") return <StepShell title="Confirm order" description="Updating the delivery amount for your selected state."><p className="rounded-xl bg-pet-cream p-4 text-sm font-bold text-pet-muted">Calculating delivery...</p></StepShell>;
  if (!quote) return <StepShell title="Confirm order" description="We need a current delivery amount before this order can be placed."><p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">{quoteState.status === "unavailable" || quoteState.status === "failed" ? quoteState.message : "Complete the delivery details to calculate delivery."}</p></StepShell>;
  return <StepShell title="Confirm order" description="Review your tag, delivery details, and price before payment."><div className="grid gap-3 sm:grid-cols-2"><SummaryItem label="Pet tag" value={product.name} /><SummaryItem label="Option" value={formatProductOption(variant)} /><SummaryItem label="Features" value={featureSummary(variant)} /><SummaryItem label="For this pet" value={pet.name} /><SummaryItem label="Item subtotal" value={formatCatalogPrice(quote.itemSubtotal, quote.currency)} />{quote.discountAmount > 0 ? <SummaryItem label="Discount" value={`− ${formatCatalogPrice(quote.discountAmount, quote.currency)}`} /> : null}<SummaryItem label={quote.deliveryMethod} value={quote.deliveryFee === 0 ? "Free" : formatCatalogPrice(quote.deliveryFee, quote.currency)} /><SummaryItem label="Total" value={formatCatalogPrice(quote.total, quote.currency)} /><SummaryItem label="Delivery area" value={formatStateAndZone(quote.stateName, quote.zoneName)} /><SummaryItem label="Delivery address" value={formatDeliverySummary(delivery)} /></div>{quote.freeDeliveryReason ? <p className="mt-4 rounded-xl bg-[#e8f8f0] p-4 text-sm font-bold text-pet-sage">{quote.freeDeliveryReason}</p> : null}<p className="mt-4 rounded-xl bg-pet-cream p-4 text-sm leading-6 text-pet-muted">This total includes delivery to {quote.stateName}. After placing the order, pay with the merchant QR code and upload your payment proof. Your tag is linked to {pet.name} once it arrives and you activate it.</p></StepShell>;
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
function Field({ id, label, error, required = false, children }: { id: string; label: string; error?: string; required?: boolean; children: ReactNode }) { const child = children as ReactElement<Record<string, unknown>>; const errorId = `${id}-error`; return <div className="grid gap-2"><label className="text-sm font-bold text-pet-ink" htmlFor={id}>{label}{required ? <span aria-hidden="true"> *</span> : null}</label>{cloneElement(child, { id, required: required || undefined, "aria-required": required || undefined, "aria-invalid": Boolean(error) || undefined, "aria-describedby": error ? errorId : undefined })}{error ? <span className="text-xs font-bold text-red-700" id={errorId}>{error}</span> : null}</div>; }
function ErrorText({ message }: { message?: string }) { return message ? <span className="mt-2 block text-xs font-bold text-red-700">{message}</span> : null; }
function SummaryItem({ label, value }: { label: string; value: string }) { return <div className="min-w-0 rounded-xl bg-pet-cream p-4"><p className="text-xs font-bold uppercase text-pet-muted">{label}</p><p className="mt-1 break-words font-black text-pet-ink">{value || "Not set"}</p></div>; }
function validateAll(choice: CatalogChoice | undefined, pet: Pet | undefined, delivery: DeliveryDetails) { const errors: Record<string, string> = {}; if (!choice) errors.product = "Choose an available physical tag."; if (!pet) errors.pet = "Choose a pet for this tag."; if (!delivery.recipientName.trim()) errors.recipientName = "Add the recipient name."; if (!delivery.phone.trim() || !isValidE164(delivery.phone)) errors.phone = "Please enter a valid phone number."; if (!delivery.addressLine1.trim()) errors.addressLine1 = "Add the delivery address."; if (!delivery.postcode.trim()) errors.postcode = "Add the postcode."; if (!delivery.city.trim()) errors.city = "Add the city."; if (!delivery.stateCode?.trim()) errors.stateCode = "Please select a state for your delivery address."; return errors; }
function isDeliveryValid(delivery: DeliveryDetails) { return Object.keys(validateAll({} as CatalogChoice, {} as Pet, delivery)).length === 0; }
function dimensions(variant: TagProductVariant) { const values = [variant.widthMm, variant.heightMm, variant.thicknessMm].filter((value): value is number => typeof value === "number"); return values.length ? `${values.join(" × ")} mm` : variant.tagVariant; }
function formatProductOption(variant: Pick<TagProductVariant, "name" | "tagVariant">) { return formatOrderProduct(variant.name, variant.tagVariant); }
function focusFirstInvalidField(errors: Record<string, string>) { const ids: Record<string, string> = { recipientName: "delivery-recipientName", addressLine1: "delivery-addressLine1", postcode: "delivery-postcode", city: "delivery-city", stateCode: "delivery-stateCode" }; const key = Object.keys(errors).find((item) => ids[item]); if (key) document.getElementById(ids[key])?.focus(); }
function formatDeliverySummary(delivery: DeliveryDetails) { return [delivery.addressLine1, delivery.addressLine2, [delivery.postcode, delivery.city].filter(Boolean).join(" "), delivery.state].filter((part) => part.trim()).join(", "); }
function createDeliveryQuoteFingerprint(delivery: DeliveryDetails, productVariantKey: string) {
  return JSON.stringify({
    addressLine1: delivery.addressLine1.trim().toLocaleLowerCase(),
    postcode: delivery.postcode.trim().toLocaleUpperCase(),
    city: delivery.city.trim().toLocaleLowerCase(),
    stateCode: delivery.stateCode?.trim().toLocaleUpperCase() ?? "",
    country: "MY",
    productVariantKey,
    quantity: 1,
  });
}
function inferCityState(area: string, states: MalaysiaState[]) { const parts = (area ?? "").split(",").map((part) => part.trim()).filter(Boolean); const stateValue = parts.length >= 2 ? parts.at(-1) ?? "" : area; const stateCode = resolveLegacyStateCode(stateValue, states); const state = states.find((item) => item.code === stateCode)?.name ?? ""; return { city: parts.length >= 2 ? parts[0] : "", state, stateCode }; }
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
