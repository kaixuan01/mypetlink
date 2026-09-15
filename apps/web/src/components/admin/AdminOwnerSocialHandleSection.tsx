"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { adminCapabilities, hasCapability } from "@/lib/adminCapabilities";
import { getAdminCapabilities } from "@/services/authService";
import { isApiClientError } from "@/services/apiClient";
import {
  assignAdminOwnerSocialHandle,
  getAdminOwnerSocialHandle,
  type AdminOwnerSocialHandle,
} from "@/services/adminOwnerService";

type AdminOwnerSocialHandleSectionProps = {
  ownerUserId: string;
};

/**
 * Giving an owner's social profile a protected name.
 *
 * Reserved handles — `mypetlink`, `support`, `admin` and the rest — can never be
 * claimed by an owner on their own settings screen, and that stays true whoever
 * ends up holding one. This is the only surface that can assign one, and the
 * API refuses the request outright without the capability behind it, so hiding
 * the control here is a courtesy rather than the protection.
 *
 * Assigning a name does not publish the profile. The two are separate decisions
 * and the copy below says which one is still outstanding, rather than quietly
 * switching Social on for an account whose owner has not.
 */
export function AdminOwnerSocialHandleSection({
  ownerUserId,
}: AdminOwnerSocialHandleSectionProps) {
  const [state, setState] = useState<AdminOwnerSocialHandle | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [pendingReassign, setPendingReassign] = useState(false);

  const canAssign = hasCapability(
    getAdminCapabilities(),
    adminCapabilities.ownerSocialHandleAssign
  );

  const load = useCallback(async () => {
    try {
      setState(await getAdminOwnerSocialHandle(ownerUserId));
    } catch {
      setState(null);
    } finally {
      setLoaded(true);
    }
  }, [ownerUserId]);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const next = await getAdminOwnerSocialHandle(ownerUserId);
        if (active) setState(next);
      } catch {
        if (active) setState(null);
      } finally {
        if (active) setLoaded(true);
      }
    })();

    return () => {
      active = false;
    };
  }, [ownerUserId]);

  async function assign(confirmReassign: boolean) {
    const handle = input.trim();
    if (!handle) return;

    setSaving(true);
    setMessage("");

    try {
      const next = await assignAdminOwnerSocialHandle(ownerUserId, handle, confirmReassign);
      setState(next);
      setInput("");
      setPendingReassign(false);
      setMessage(`Assigned @${next.handle} to this social profile.`);
    } catch (error) {
      if (isApiClientError(error) && error.code === "reserved_handle_assigned") {
        // Somebody already holds it. Taking it off them is a deliberate second
        // action, never a silent consequence of the first.
        setPendingReassign(true);
        setMessage(error.message);
        return;
      }

      setMessage(
        isApiClientError(error)
          ? error.message
          : "We couldn't assign that handle. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return null;
  }

  return (
    <section aria-labelledby="owner-social-handle-heading">
      <h3 className="text-sm font-black text-slate-900" id="owner-social-handle-heading">
        Social handle
      </h3>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {state?.handle ? (
          <>
            <span className="text-sm font-bold text-slate-900">@{state.handle}</span>
            {state.isReservedHandle ? <Badge tone="mint">Reserved name</Badge> : null}
          </>
        ) : (
          <span className="text-sm font-bold text-slate-500">No handle chosen yet</span>
        )}
        <Badge tone={state?.isSocialEnabled ? "mint" : "warm"}>
          {state?.isSocialEnabled ? "Social profile on" : "Social profile off"}
        </Badge>
      </div>

      {state && !state.isSocialEnabled ? (
        <p className="mt-2 text-sm font-semibold text-slate-600">
          A handle on its own is not public. The owner still has to turn their
          social profile on before this name resolves to anything.
        </p>
      ) : null}

      {canAssign ? (
        <div className="mt-3 grid gap-2">
          <label
            className="text-xs font-black uppercase tracking-wide text-slate-500"
            htmlFor={`owner-social-handle-${ownerUserId}`}
          >
            Assign a reserved handle
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-900"
              disabled={saving}
              id={`owner-social-handle-${ownerUserId}`}
              onChange={(event) => {
                setInput(event.target.value);
                setPendingReassign(false);
                setMessage("");
              }}
              placeholder="mypetlink"
              value={input}
            />
            <button
              className="inline-flex min-h-11 items-center rounded-full bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-50"
              disabled={saving || !input.trim()}
              onClick={() => void assign(false)}
              type="button"
            >
              {saving && !pendingReassign ? "Assigning…" : "Assign"}
            </button>
          </div>

          <p className="text-xs font-semibold text-slate-500">
            Only protected names can be assigned here. Owners can never claim
            them themselves, and they stay protected afterwards.
          </p>

          {pendingReassign ? (
            <div
              className="grid gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3"
              data-testid="owner-social-handle-reassign"
            >
              <p className="text-sm font-bold text-amber-900">
                Another social profile already holds @{input.trim().replace(/^@/, "")}.
                Move it to this profile?
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  className="inline-flex min-h-11 items-center rounded-full bg-amber-900 px-4 text-sm font-bold text-white disabled:opacity-50"
                  disabled={saving}
                  onClick={() => void assign(true)}
                  type="button"
                >
                  {saving ? "Reassigning…" : "Reassign it"}
                </button>
                <button
                  className="inline-flex min-h-11 items-center rounded-full border border-slate-300 px-4 text-sm font-bold text-slate-700"
                  onClick={() => {
                    setPendingReassign(false);
                    setMessage("");
                  }}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {message ? (
        <p
          className="mt-2 text-sm font-bold text-slate-700"
          data-testid="owner-social-handle-message"
          role="status"
        >
          {message}
        </p>
      ) : null}

      {loaded && !state ? (
        <button
          className="mt-2 text-sm font-bold text-slate-700 underline"
          onClick={() => void load()}
          type="button"
        >
          Try again
        </button>
      ) : null}
    </section>
  );
}
