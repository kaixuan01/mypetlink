// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/services/apiClient";
import {
  ADMIN_TAG_GENERATION_MAX_QUANTITY,
  adminGenerateRetailTags,
} from "@/services/tagService";

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}));

vi.mock("@/services/apiConfig", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/apiConfig")>();
  return { ...actual, canUseApi: () => true };
});

vi.mock("@/services/authStorage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/authStorage")>();
  return {
    ...actual,
    readStoredAuthSession: () => ({ accessToken: "admin-token" }),
  };
});

vi.mock("@/services/apiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/apiClient")>();
  return { ...actual, apiRequest: mocks.apiRequest };
});

function backendTag(index: number, batchNo: string) {
  return {
    id: `tag-${index}`,
    tagCode: `MPL-TEST-${String(index).padStart(4, "0")}`,
    petId: null,
    ownerUserId: null,
    orderId: null,
    orderNumber: null,
    petName: null,
    batchNo,
    hasNfc: true,
    variant: "Lightweight",
    status: "Unclaimed" as const,
    createdAt: "2026-09-10T00:00:00Z",
    updatedAt: "2026-09-10T00:00:00Z",
    activatedAt: null,
  };
}

function generationEnvelope(quantity: number) {
  const batchNo = `MPL-BAT-TEST-${quantity}`;
  return {
    data: {
      batchNo,
      quantity,
      requestedQuantity: quantity,
      generatedQuantity: quantity,
      productVariantId: "variant-1",
      sku: "MYBOSS-LW-QR-NFC",
      productName: "MyPetLink My Boss Pet Tag",
      variantName: "Lightweight",
      currentInventoryCount: quantity + 20,
      tags: Array.from({ length: quantity }, (_, index) => backendTag(index, batchNo)),
    },
    meta: { requestId: `request-${quantity}` },
  };
}

beforeEach(() => {
  mocks.apiRequest.mockReset();
});

describe("adminGenerateRetailTags", () => {
  it.each([1, 50, 51, 300])(
    "sends %i unchanged and accepts only an exactly matching server result",
    async (quantity) => {
      mocks.apiRequest.mockResolvedValue(generationEnvelope(quantity));

      const response = await adminGenerateRetailTags(quantity, "variant-1");

      expect(mocks.apiRequest).toHaveBeenCalledWith(
        "/api/v1/admin/tag-inventory/generate",
        {
          method: "POST",
          body: { quantity, productVariantId: "variant-1" },
        }
      );
      expect(response.data.requestedQuantity).toBe(quantity);
      expect(response.data.generatedQuantity).toBe(quantity);
      expect(response.data.tags).toHaveLength(quantity);
    }
  );

  it.each([0, -1, ADMIN_TAG_GENERATION_MAX_QUANTITY + 1, 1.5, Number.NaN])(
    "rejects invalid quantity %s without sending a request",
    async (quantity) => {
      await expect(adminGenerateRetailTags(quantity, "variant-1")).rejects.toMatchObject({
        status: 400,
        code: "validation_failed",
      });
      expect(mocks.apiRequest).not.toHaveBeenCalled();
    }
  );

  it("refuses to report success when the server count is partial", async () => {
    const partial = generationEnvelope(300);
    partial.data.generatedQuantity = 50;
    partial.data.quantity = 50;
    partial.data.tags = partial.data.tags.slice(0, 50);
    mocks.apiRequest.mockResolvedValue(partial);

    await expect(adminGenerateRetailTags(300, "variant-1")).rejects.toMatchObject({
      status: 502,
      code: "tag_generation_incomplete",
    } satisfies Partial<ApiClientError>);
  });
});
