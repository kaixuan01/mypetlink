"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminActionButton,
  AdminDetailItem,
  AdminFilterTabs,
  AdminNotice,
  AdminSection,
} from "@/components/admin/AdminPanels";
import { orderStatusTone } from "@/components/admin/adminDisplay";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  formatOrderNumber,
  getOrderStatusDisplay,
} from "@/lib/orders";
import { getAdminData, type AdminData } from "@/services/adminService";
import {
  adminConfirmOrderPayment,
  adminRejectOrderPayment,
} from "@/services/tagService";

type ProofFilter = "queue" | "reviewed" | "all";

export function AdminPaymentProofsManager({
  initialData,
}: {
  initialData: AdminData;
}) {
  const [data, setData] = useState(initialData);
  const [filter, setFilter] = useState<ProofFilter>("queue");
  const [message, setMessage] = useState("");
  const [pendingRejectId, setPendingRejectId] = useState("");

  const refresh = useCallback(async () => {
    setData(await getAdminData());
  }, []);

  useEffect(() => {
    let active = true;

    getAdminData()
      .then((next) => {
        if (active) {
          setData(next);
        }
      })
      .catch(() => {
        if (active) {
          setMessage("We could not load payment proofs. Please refresh to try again.");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const petMap = useMemo(
    () => new Map(data.pets.map((pet) => [pet.id, pet])),
    [data.pets]
  );

  const submissions = useMemo(
    () => data.orders.filter((order) => order.paymentSubmittedDate),
    [data.orders]
  );

  const queue = submissions.filter(
    (order) => order.status === "Payment Submitted"
  );
  const reviewed = submissions.filter(
    (order) => order.status !== "Payment Submitted"
  );
  const visible =
    filter === "queue" ? queue : filter === "reviewed" ? reviewed : submissions;

  async function approve(orderId: string) {
    const order = data.orders.find((item) => item.id === orderId);
    const result = await adminConfirmOrderPayment(orderId);
    await refresh();
    setMessage(
      result.data && order
        ? `Payment confirmed for ${formatOrderNumber(order)}.`
        : "This payment proof could not be updated from its current status."
    );
  }

  async function confirmReject() {
    const order = data.orders.find((item) => item.id === pendingRejectId);
    setPendingRejectId("");

    if (!order) {
      return;
    }

    const result = await adminRejectOrderPayment(
      order.id,
      "We could not verify this payment proof. Please resubmit your receipt or screenshot."
    );
    await refresh();
    setMessage(
      result.data
        ? `${formatOrderNumber(order)} returned to Pending Payment for resubmission.`
        : "This payment proof could not be updated from its current status."
    );
  }

  return (
    <div className="grid gap-4">
      <AdminNotice>
        Payments are reviewed manually in this early launch phase. Approving a
        proof confirms the payment; requesting resubmission returns the order to
        Pending Payment without cancelling it.
      </AdminNotice>
      <AdminSection
        title="Payment proof review"
        description="Uploaded receipts and transaction references awaiting manual confirmation."
      >
        <AdminFilterTabs
          active={filter}
          filters={[
            { id: "queue", label: "Awaiting review", count: queue.length },
            { id: "reviewed", label: "Reviewed", count: reviewed.length },
            { id: "all", label: "All", count: submissions.length },
          ]}
          onChange={setFilter}
        />
        {message ? (
          <p className="px-4 pt-3 text-sm font-bold text-[#1b4f9c]">{message}</p>
        ) : null}
        <div className="grid gap-3 p-4">
          {visible.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-500">
              {filter === "queue"
                ? "No payment proofs waiting for review."
                : "No payment proof submissions here yet."}
            </p>
          ) : (
            visible.map((order) => {
              const pet = petMap.get(order.petId);
              const awaiting = order.status === "Payment Submitted";

              return (
                <article
                  className="rounded-2xl border border-slate-200 p-4"
                  key={order.id}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-black text-slate-950">
                      {formatOrderNumber(order)}
                    </h3>
                    <Badge tone={orderStatusTone[order.status]}>
                      {getOrderStatusDisplay(order.status)}
                    </Badge>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <AdminDetailItem
                      label="Owner"
                      value={pet?.owner.name ?? "Owner"}
                    />
                    <AdminDetailItem
                      label="Pet"
                      value={pet?.name ?? "Pet profile"}
                    />
                    <AdminDetailItem label="Amount" value={order.estimatedPrice} />
                    <AdminDetailItem
                      label="Payment reference"
                      value={order.paymentReference ?? "Not provided"}
                    />
                    <AdminDetailItem
                      label="Uploaded proof"
                      value={order.paymentProofName ?? "Not provided"}
                    />
                    <AdminDetailItem
                      label="Submitted"
                      value={order.paymentSubmittedDate ?? ""}
                    />
                    <AdminDetailItem
                      label="Owner note"
                      value={order.paymentNote ?? "None"}
                    />
                    <AdminDetailItem
                      label="Confirmed"
                      value={order.paymentConfirmedDate ?? "Not confirmed"}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {awaiting ? (
                      <>
                        <AdminActionButton
                          onClick={() => void approve(order.id)}
                          tone="primary"
                        >
                          Approve &amp; Confirm Payment
                        </AdminActionButton>
                        <AdminActionButton
                          onClick={() => setPendingRejectId(order.id)}
                          tone="danger"
                        >
                          Request Resubmission
                        </AdminActionButton>
                      </>
                    ) : null}
                    <Link
                      className="inline-flex min-h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-extrabold text-slate-700 transition hover:bg-slate-50"
                      href={`/admin/orders?order=${encodeURIComponent(formatOrderNumber(order))}`}
                    >
                      View Order
                    </Link>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </AdminSection>

      <ConfirmDialog
        confirmLabel="Request Resubmission"
        destructive
        message="The order will return to Pending Payment with a friendly note asking the owner to resubmit their receipt. The order is not cancelled."
        onCancel={() => setPendingRejectId("")}
        onConfirm={() => void confirmReject()}
        open={Boolean(pendingRejectId)}
        title="Request payment proof resubmission?"
      />
    </div>
  );
}
