"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminDetailItem } from "@/components/admin/AdminPanels";
import { formatAdminDateTime } from "@/components/admin/adminDisplay";
import {
  ModerationActionDialog,
  ModerationHistoryList,
  type ModerationDialogInput,
} from "@/components/admin/AdminCommunityModerationParts";
import { Badge } from "@/components/ui/Badge";
import { adminCapabilities, hasCapability } from "@/lib/adminCapabilities";
import {
  accountSuspensionReasons,
  communityContentReasons,
} from "@/lib/communityModeration";
import { getAdminCapabilities } from "@/services/authService";
import { isApiClientError } from "@/services/apiClient";
import {
  directModerationErrorMessage,
  getHouseholdModeration,
  issueCommunityWarning,
  liftCommunityRestriction,
  reinstateOwnerAccount,
  restrictCommunity,
  suspendOwnerAccount,
  type HouseholdCommunityStatus,
  type HouseholdModeration,
} from "@/services/adminCommunityModerationService";

type HouseholdAction = "IssueWarning" | "RestrictCommunity" | "LiftCommunityRestriction" | "SuspendAccount" | "ReinstateAccount";

const communityStatusLabels: Record<HouseholdCommunityStatus, string> = {
  NotSetUp: "Not set up",
  Off: "Off",
  On: "On",
  Restricted: "Restricted",
  Suspended: "Suspended (until lifted)",
};

const actionCopy: Record<HouseholdAction, {
  label: string;
  message: string;
  done: string;
  destructive?: boolean;
}> = {
  IssueWarning: {
    label: "Issue warning",
    message: "The household is told they received a Community warning, and why. Nothing else changes.",
    done: "Warning issued. The household has been told.",
  },
  RestrictCommunity: {
    label: "Restrict Community",
    message: "The household can’t post, comment, reply, like, follow or collaborate until the restriction ends, and their Community Profile, Moments and comments are hidden meanwhile. A timed restriction ends on its own. Their pets, Safety Profiles, Smart Tags, Lost Mode and orders are untouched. If they are already restricted, this sets a new end.",
    done: "Community access restricted. The household has been told.",
    destructive: true,
  },
  LiftCommunityRestriction: {
    label: "Lift Community restriction",
    message: "Community access returns now, with the household’s own Community setting as it was. They aren’t sent anything.",
    done: "Community restriction lifted.",
  },
  SuspendAccount: {
    label: "Suspend account",
    message: "This owner will no longer be able to sign in to MyPetLink at all — not just Community. Use it only for fraud, scams, security abuse or repeated serious violations; for Community behaviour, restrict Community instead. Finders can still reach their pets’ Safety Profiles and Smart Tags.",
    done: "Account suspended. They can no longer sign in.",
    destructive: true,
  },
  ReinstateAccount: {
    label: "Reinstate account",
    message: "This owner will be able to sign in again. Nothing else about their account changes.",
    done: "Account reinstated.",
  },
};

/**
 * A household's moderation standing in the Owner drawer: Community status,
 * warnings, any restriction and its end, and the full history — with Community
 * actions, and account suspension kept visibly apart from them. Shown only to
 * moderators; every button is a courtesy, and the API refuses anything the
 * moderator's access does not allow.
 */
export function AdminOwnerModerationSection({
  ownerUserId,
  onAccountChanged,
}: {
  ownerUserId: string;
  onAccountChanged?: () => void;
}) {
  const access = getAdminCapabilities();
  const canView = hasCapability(access, adminCapabilities.communityReportsView);
  const allowed: Record<HouseholdAction, boolean> = {
    IssueWarning: hasCapability(access, adminCapabilities.communityReportsResolve),
    RestrictCommunity: hasCapability(access, adminCapabilities.communityModerationEnforce),
    LiftCommunityRestriction: hasCapability(access, adminCapabilities.communityModerationEnforce),
    SuspendAccount: hasCapability(access, adminCapabilities.ownersSuspend),
    ReinstateAccount: hasCapability(access, adminCapabilities.ownersSuspend),
  };
  const [state, setState] = useState<{ key: string; household: HouseholdModeration | null; error: string } | null>(null);
  const [revision, setRevision] = useState(0);
  const [pending, setPending] = useState<{ action: HouseholdAction; key: number } | null>(null);
  const [dialogError, setDialogError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const key = `${ownerUserId}#${revision}`;

  useEffect(() => {
    if (!canView) return;
    const controller = new AbortController();
    getHouseholdModeration(ownerUserId, controller.signal)
      .then((household) => { if (!controller.signal.aborted) setState({ key, household, error: "" }); })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({
          key,
          household: null,
          error: isApiClientError(error) && error.code === "moderation_conflict_of_interest"
            ? "Another moderator needs to review your own household."
            : "We couldn’t load this household’s moderation history. Please try again.",
        });
      });
    return () => controller.abort();
  }, [canView, key, ownerUserId]);

  const reload = useCallback(() => setRevision((value) => value + 1), []);

  if (!canView) return null;

  const current = state?.key === key ? state : null;
  const household = current?.household ?? null;
  const offered = (action: HouseholdAction) => Boolean(household?.availableActions.includes(action)) && allowed[action];

  const submit = async (input: ModerationDialogInput) => {
    if (busyRef.current || !pending) return;
    const action = pending.action;
    busyRef.current = true;
    setBusy(true);
    setDialogError("");
    try {
      switch (action) {
        case "IssueWarning":
          if (!input.reason) return;
          await issueCommunityWarning(ownerUserId, input.reason, input.remark);
          break;
        case "RestrictCommunity":
          if (!input.reason || !input.duration) return;
          await restrictCommunity(ownerUserId, input.reason, input.duration, input.remark);
          break;
        case "LiftCommunityRestriction":
          await liftCommunityRestriction(ownerUserId, input.remark);
          break;
        case "SuspendAccount":
          if (!input.reason) return;
          await suspendOwnerAccount(ownerUserId, input.reason, input.remark);
          break;
        case "ReinstateAccount":
          await reinstateOwnerAccount(ownerUserId, input.remark);
          break;
      }
      setPending(null);
      setNotice(actionCopy[action].done);
      reload();
      if (action === "SuspendAccount" || action === "ReinstateAccount") onAccountChanged?.();
    } catch (error) {
      const message = directModerationErrorMessage(error);
      if (isApiClientError(error) && (error.status === 403 || error.status === 409)) {
        setPending(null);
        setNotice(message);
        reload();
      } else {
        setDialogError(message);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const button = (action: HouseholdAction) =>
    offered(action) ? (
      <button
        className={`inline-flex min-h-10 items-center justify-center rounded-full border px-4 text-xs font-extrabold transition ${
          actionCopy[action].destructive
            ? "border-[#ffd2c9] bg-[#ffe8e3] text-[#a63c2e] hover:bg-[#ffd8cf]"
            : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
        }`}
        key={action}
        onClick={() => { setDialogError(""); setNotice(""); setPending({ action, key: Date.now() }); }}
        type="button"
      >
        {actionCopy[action].label}
      </button>
    ) : null;

  return (
    <section aria-labelledby="owner-moderation-heading" data-testid="owner-moderation-section">
      <h3 className="text-sm font-black text-slate-900" id="owner-moderation-heading">Community moderation</h3>
      {notice ? <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700" role="status">{notice}</p> : null}
      {!current ? <p className="mt-2 text-sm font-semibold text-slate-500" role="status">Loading moderation history…</p> : null}
      {current?.error ? (
        <div className="mt-2 grid gap-2">
          <p className="text-sm font-semibold text-red-700" role="alert">{current.error}</p>
          <button className="w-fit text-sm font-bold text-pet-teal underline" onClick={reload} type="button">Try again</button>
        </div>
      ) : null}
      {household ? (
        <div className="mt-2 grid gap-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <AdminDetailItem label="Community status" value={communityStatusLabels[household.communityStatus] ?? household.communityStatus} />
            <AdminDetailItem label="Warnings" value={String(household.warningCount)} />
            <AdminDetailItem label="Active restriction" value={household.restrictedAt ? `Since ${formatAdminDateTime(household.restrictedAt)}` : "None"} />
            <AdminDetailItem
              label="Restriction ends"
              value={household.restrictedAt ? (household.restrictedUntil ? formatAdminDateTime(household.restrictedUntil) : "When lifted") : "—"}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {button("IssueWarning")}
            {button("RestrictCommunity")}
            {button("LiftCommunityRestriction")}
          </div>

          <div className="grid gap-2 rounded-xl border border-[#ffd2c9] p-3" data-testid="owner-account-suspension">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-extrabold uppercase text-slate-500">Account</span>
              <Badge tone={household.accountStatus === "Active" ? "mint" : "danger"}>{household.accountStatus}</Badge>
            </div>
            <p className="text-xs font-semibold leading-5 text-slate-600">
              Suspending an account stops sign-in to all of MyPetLink. It is separate from Community restriction and reserved for fraud, scams, security abuse or repeated serious violations.
            </p>
            <div className="flex flex-wrap gap-2">
              {button("SuspendAccount")}
              {button("ReinstateAccount")}
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-xs font-extrabold uppercase text-slate-500">Moderation history</h4>
            <ModerationHistoryList items={household.history} total={household.historyTotal} />
          </div>
        </div>
      ) : null}
      {pending ? (
        <ModerationActionDialog
          key={pending.key}
          title={actionCopy[pending.action].label}
          message={actionCopy[pending.action].message}
          confirmLabel={actionCopy[pending.action].label}
          destructive={actionCopy[pending.action].destructive}
          reasons={
            pending.action === "SuspendAccount" ? accountSuspensionReasons
              : pending.action === "IssueWarning" || pending.action === "RestrictCommunity" ? communityContentReasons
                : undefined
          }
          withDuration={pending.action === "RestrictCommunity"}
          busy={busy}
          error={dialogError}
          onCancel={() => setPending(null)}
          onConfirm={(input) => void submit(input)}
        />
      ) : null}
    </section>
  );
}
