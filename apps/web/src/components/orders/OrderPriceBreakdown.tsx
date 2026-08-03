import { formatCatalogPrice } from "@/services/tagCatalogService";
import type { TagOrder } from "@/types";

export type OrderPriceLine = {
  id: string;
  productName: string;
  optionName: string;
  features?: string;
  petName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  discountAmount: number;
  finalAmount: number;
  promotionName?: string;
};

export function priceLinesFromOrder(order: TagOrder): OrderPriceLine[] {
  if (order.items?.length) {
    return order.items.map((item, index) => ({
      id: item.id ?? `${order.id}-${index}`,
      productName: item.productName,
      optionName: item.variantName,
      features: featureSummary(item.supportsQr, item.supportsNfc),
      petName: item.petName,
      quantity: item.quantity,
      unitPrice: item.unitBasePrice,
      subtotal: item.subtotal,
      discountAmount: item.discountAmount,
      finalAmount: item.finalAmount,
      promotionName: item.promotionName,
    }));
  }

  const quantity = order.quantity ?? 1;
  const discountAmount = order.discountAmount ?? 0;
  const merchandiseFinal = order.finalAmount
    ?? Math.max(0, (order.totalAmount ?? 0) - (order.deliveryFee ?? 0));
  const merchandiseSubtotal = merchandiseFinal + discountAmount;
  const unitPrice = order.unitBasePrice ?? merchandiseSubtotal / quantity;
  return [{
    id: order.id,
    productName: order.productName ?? order.tagType,
    optionName: order.variantName ?? order.variant,
    features: order.supportsQr != null || order.supportsNfc != null
      ? featureSummary(Boolean(order.supportsQr), Boolean(order.supportsNfc))
      : undefined,
    petName: order.petName ?? "Pet",
    quantity,
    unitPrice,
    subtotal: merchandiseSubtotal,
    discountAmount,
    finalAmount: merchandiseFinal,
    promotionName: order.promotionName,
  }];
}

type OrderPriceBreakdownProps = {
  lines: OrderPriceLine[];
  currency?: string;
  merchandiseSubtotal?: number;
  discountTotal?: number;
  deliveryFee?: number;
  deliveryMethod?: string;
  freeDeliveryReason?: string;
  total?: number;
  deliveryPendingLabel?: string;
  compact?: boolean;
};

export function OrderPriceBreakdown({
  lines,
  currency = "MYR",
  merchandiseSubtotal = lines.reduce((sum, line) => sum + line.subtotal, 0),
  discountTotal = lines.reduce((sum, line) => sum + line.discountAmount, 0),
  deliveryFee,
  deliveryMethod = "Delivery",
  freeDeliveryReason,
  total,
  deliveryPendingLabel,
  compact = false,
}: OrderPriceBreakdownProps) {
  const resolvedTotal = total ?? merchandiseSubtotal - discountTotal + (deliveryFee ?? 0);

  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-pet-border bg-white">
      <div className={compact ? "divide-y divide-pet-border" : "divide-y divide-pet-border"}>
        {lines.map((line) => (
          <div className="grid min-w-0 gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto]" key={line.id}>
            <div className="min-w-0">
              <p className="break-words font-black text-pet-ink">{line.productName}</p>
              <p className="mt-1 break-words text-sm font-semibold text-pet-muted">{line.optionName}</p>
              {line.features ? <p className="mt-1 break-words text-xs font-semibold text-pet-muted">{line.features}</p> : null}
              <p className="mt-1 break-words text-xs font-semibold text-pet-muted">For {line.petName}</p>
              <p className="mt-1 text-xs font-semibold text-pet-muted">
                {line.quantity} × {formatCatalogPrice(line.unitPrice, currency)}
              </p>
              {line.promotionName ? (
                <p className="mt-1 text-xs font-bold text-pet-coral">{line.promotionName}</p>
              ) : null}
            </div>
            <div className="text-left sm:text-right">
              {line.discountAmount > 0 ? (
                <p className="text-xs font-semibold text-pet-muted line-through">
                  {formatCatalogPrice(line.subtotal, currency)}
                </p>
              ) : null}
              <p className="font-black text-pet-ink">
                {formatCatalogPrice(line.finalAmount, currency)}
              </p>
            </div>
          </div>
        ))}
      </div>

      <dl className="space-y-2 border-t border-pet-border bg-pet-cream p-4 text-sm">
        <PriceRow label="Merchandise subtotal" value={formatCatalogPrice(merchandiseSubtotal, currency)} />
        {discountTotal > 0 ? (
          <PriceRow
            label="Discount"
            tone="discount"
            value={`− ${formatCatalogPrice(discountTotal, currency)}`}
          />
        ) : null}
        <PriceRow
          label={deliveryMethod}
          value={
            deliveryFee === undefined
              ? deliveryPendingLabel ?? "Calculated from delivery address"
              : deliveryFee === 0
                ? "Free"
                : formatCatalogPrice(deliveryFee, currency)
          }
        />
        {freeDeliveryReason ? (
          <p className="text-xs font-bold text-pet-sage">{freeDeliveryReason}</p>
        ) : null}
        {deliveryFee !== undefined || total !== undefined ? (
          <PriceRow
            emphasis
            label={`Total (${currency})`}
            value={formatCatalogPrice(resolvedTotal, currency)}
          />
        ) : null}
      </dl>
    </div>
  );
}

function featureSummary(supportsQr: boolean, supportsNfc: boolean) {
  return [supportsQr ? "QR code" : null, supportsNfc ? "NFC tap" : null].filter(Boolean).join(" · ");
}

function PriceRow({
  label,
  value,
  emphasis = false,
  tone,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  tone?: "discount";
}) {
  return (
    <div className={`flex min-w-0 items-start justify-between gap-4 ${emphasis ? "border-t border-pet-border pt-3 text-base" : ""}`}>
      <dt className={`min-w-0 ${emphasis ? "font-black text-pet-ink" : "font-semibold text-pet-muted"}`}>{label}</dt>
      <dd className={`shrink-0 text-right font-black ${tone === "discount" ? "text-pet-sage" : "text-pet-ink"}`}>{value}</dd>
    </div>
  );
}
