import { isApiClientError } from "@/services/apiClient";

// Single source of owner-facing wording for the tag catalog and ordering flow.
// Everything a customer reads about a failure comes from here so the same
// condition never gets two slightly different explanations, and so raw backend
// text (field names, enum values, exception messages) never reaches a customer.
//
// Every message answers two questions: what happened, and what to do next.

// Backend validation keys mapped to the field names the order form uses, so a
// server-side failure lands beside the control the customer needs to fix.
const FIELD_KEYS: Record<string, string> = {
  petId: "pet",
  productVariantKey: "product",
  quantity: "product",
  delivery: "addressLine1",
  "delivery.recipientName": "recipientName",
  "delivery.phoneE164": "phone",
  "delivery.addressLine1": "addressLine1",
  "delivery.postcode": "postcode",
  "delivery.city": "city",
  "delivery.state": "state",
};

// Owner-facing replacements for backend validation text. The server wording is
// written for operators ("Address line 1 is required."), so it is never shown.
const FIELD_MESSAGES: Record<string, string> = {
  pet: "Please choose the pet that will use this tag.",
  product: "This tag option is no longer available. Please choose another option.",
  recipientName: "Please enter the name of the person receiving the tag.",
  phone: "Enter a valid Malaysian phone number, for example 012-345 6789.",
  addressLine1: "Please enter the delivery address.",
  postcode: "Please enter the postcode.",
  city: "Please enter the city.",
  state: "Please enter the state.",
};

export type OwnerFieldErrors = Record<string, string>;

/**
 * Field-level errors for the order form, keyed by the form's own field names.
 * Only fields the form knows about are returned; anything else is surfaced
 * through {@link getOwnerOrderErrorMessage} instead of being dropped silently.
 */
export function getOwnerOrderFieldErrors(error: unknown): OwnerFieldErrors {
  if (!isApiClientError(error) || error.code !== "validation_failed" || !error.details) {
    return {};
  }

  const mapped: OwnerFieldErrors = {};
  for (const backendField of Object.keys(error.details)) {
    const key = FIELD_KEYS[backendField];
    if (key && !mapped[key]) {
      mapped[key] = FIELD_MESSAGES[key];
    }
  }
  return mapped;
}

/**
 * One owner-facing sentence explaining a catalog or ordering failure. Never
 * returns backend text, an error code, or a status number.
 */
export function getOwnerOrderErrorMessage(error: unknown): string {
  if (!isApiClientError(error)) {
    return "We could not complete your order right now. Please try again.";
  }

  // A missing connection is a configuration state, not an outage — saying the
  // service is down here would be untrue.
  if (error.code === "connection_not_configured") {
    return "Tag ordering isn’t available in this preview. It needs a configured MyPetLink connection.";
  }

  if (error.status === 0) {
    return "We couldn’t connect right now. Check your internet connection and try again.";
  }

  switch (error.code) {
    case "unauthorized":
      return "Your session has expired. Please sign in again to continue.";
    case "rate_limit_exceeded":
      return "Too many requests. Please wait a moment and try again.";
    // Written for customers already, and more specific than anything generic.
    case "feature_disabled":
      return error.message;
    case "out_of_stock":
      return "This tag option is out of stock right now. Please choose another option.";
    // The order already exists, so claiming a failure would be wrong.
    case "idempotency_key_conflict":
      return "This order has already been submitted. Please check your orders before trying again.";
    case "price_changed":
      return "The price of this tag option has changed. Please review the updated total before continuing.";
    default:
      break;
  }

  if (error.code === "validation_failed") {
    const fields = getOwnerOrderFieldErrors(error);
    const messages = Object.values(fields);
    if (messages.length === 1) return messages[0];
    if (messages.length > 1) return "Please check the highlighted details and try again.";
    return "Please check your order details and try again.";
  }

  if (error.status === 401) return "Your session has expired. Please sign in again to continue.";
  if (error.status === 403) return "You do not have permission to manage this pet.";
  if (error.status === 404) return "This tag option is no longer available. Please choose another option.";
  // Something changed underneath the customer between loading and submitting.
  if (error.status === 409) return "This tag option changed while you were ordering. Please review your selection and try again.";
  if (error.status === 422) return "We couldn’t process this order right now. Please refresh and try again.";

  // Deliberately does not claim the order was not created or that payment
  // failed — the client cannot know either of those from a server error.
  return "We could not complete your order right now. Please try again.";
}
