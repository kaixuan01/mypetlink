import { apiRequest } from "@/services/apiClient";

export type MalaysiaState = {
  code: string;
  name: string;
  zoneCode: string;
  zoneName: string;
  aliases: string[];
};

export type DeliveryQuote = {
  stateCode: string;
  stateName: string;
  country: string;
  zoneCode: string;
  zoneName: string;
  deliveryMethod: string;
  itemSubtotal: number;
  discountAmount: number;
  deliveryFee: number;
  isFreeDelivery: boolean;
  freeDeliveryReason?: string | null;
  total: number;
  currency: string;
};

export async function listMalaysiaStates() {
  const response = await apiRequest<MalaysiaState[]>("/api/v1/delivery/states");
  return response.data ?? [];
}

export async function getDeliveryQuote(
  stateCode: string,
  items: Array<{ productVariantKey: string; quantity: number }>,
  signal?: AbortSignal
) {
  const response = await apiRequest<DeliveryQuote>("/api/v1/delivery/quote", {
    method: "POST",
    body: { stateCode, items },
    signal,
  });
  if (!response.data) throw new Error("Delivery quote was not returned.");
  return response.data;
}

export function resolveLegacyStateCode(value: string | undefined, states: MalaysiaState[]) {
  const candidate = value?.trim().toLocaleLowerCase();
  if (!candidate) return "";
  return states.find((state) =>
    [state.code, state.name, ...state.aliases].some(
      (name) => name.toLocaleLowerCase() === candidate
    )
  )?.code ?? "";
}
