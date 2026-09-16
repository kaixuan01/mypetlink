"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { MobileAppHeader } from "@/components/layouts/MobileAppHeader";
import { GlobalAddMenu } from "@/components/portal/GlobalAddMenu";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon } from "@/components/ui/Icon";
import {
  getOwnerHeaderAction,
  type OwnerHeaderPageContext,
} from "@/lib/ownerHeaderActions";
import { getPetLimitStateFromPets } from "@/lib/planLimits";
import { marketingRoutes, ownerRoutes } from "@/lib/routes";
import { getPets } from "@/services/petService";
import type { PetListItem } from "@/types";

type PetsStatus = "loading" | "ready" | "error";

type RegisteredPageContext = OwnerHeaderPageContext & {
  registrationId: number;
};

type OwnerHeaderActionsContextValue = {
  pageContext: RegisteredPageContext | null;
  pets: PetListItem[] | null;
  petsStatus: PetsStatus;
  registerPageContext: (
    context: Omit<OwnerHeaderPageContext, "pathname">
  ) => () => void;
};

const OwnerHeaderActionsContext =
  createContext<OwnerHeaderActionsContextValue | null>(null);

export function OwnerHeaderActionsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const nextRegistrationId = useRef(0);
  const [pets, setPets] = useState<PetListItem[] | null>(null);
  const [petsStatus, setPetsStatus] = useState<PetsStatus>("loading");
  const [pageContext, setPageContext] =
    useState<RegisteredPageContext | null>(null);

  useEffect(() => {
    let active = true;

    queueMicrotask(() => {
      if (active) {
        setPets(null);
        setPetsStatus("loading");
      }
    });

    getPets()
      .then((response) => {
        if (active) {
          setPets(response.data);
          setPetsStatus("ready");
        }
      })
      .catch(() => {
        if (active) {
          setPets([]);
          setPetsStatus("error");
        }
      });

    return () => {
      active = false;
    };
  }, [pathname]);

  const registerPageContext = useCallback(
    (context: Omit<OwnerHeaderPageContext, "pathname">) => {
      const registrationId = ++nextRegistrationId.current;

      setPageContext({
        ...context,
        pathname,
        registrationId,
      });

      return () => {
        setPageContext((current) =>
          current?.registrationId === registrationId ? null : current
        );
      };
    },
    [pathname]
  );

  const value = useMemo(
    () => ({ pets, petsStatus, pageContext, registerPageContext }),
    [pageContext, pets, petsStatus, registerPageContext]
  );

  return (
    <OwnerHeaderActionsContext.Provider value={value}>
      {children}
    </OwnerHeaderActionsContext.Provider>
  );
}

/**
 * Read-only access to the owner's pets that this provider already loads for the
 * header on every owner route. Consumers get the real signed-in owner's pets
 * without issuing another request; `pets` is null until that load settles.
 */
export function useOwnerPets() {
  const ownerHeader = useContext(OwnerHeaderActionsContext);
  return {
    pets: ownerHeader?.pets ?? null,
    petsStatus: ownerHeader?.petsStatus ?? "loading",
  };
}

export function useOwnerHeaderPageContext(
  context: Omit<OwnerHeaderPageContext, "pathname">
) {
  const registerPageContext = useContext(
    OwnerHeaderActionsContext
  )?.registerPageContext;
  const { canCreate, onCreate, petId, section, status } = context;

  useEffect(() => {
    if (!registerPageContext) {
      return undefined;
    }

    return registerPageContext({
      canCreate,
      onCreate,
      petId,
      section,
      status,
    });
  }, [canCreate, onCreate, petId, registerPageContext, section, status]);
}

/**
 * The Owner Portal's contribution to the shared mobile header: its page action,
 * and nothing else.
 *
 * The header itself — brand, mode switch, compact state, sticky behaviour — is
 * `MobileAppHeader`, which both halves of the product render. This used to own
 * all of it, which is how the compact bar ended up conditional on there being an
 * action and how Community ended up without one.
 */
export function OwnerPortalHeader() {
  const pathname = usePathname();
  const ownerHeader = useContext(OwnerHeaderActionsContext);

  const action = ownerHeader
    ? getOwnerHeaderAction({
        pathname,
        pets: ownerHeader.pets,
        petsStatus: ownerHeader.petsStatus,
        pageContext: ownerHeader.pageContext,
      })
    : null;

  return (
    <MobileAppHeader
      key={pathname}
      renderAction={
        action && ownerHeader
          ? () => (
              <OwnerHeaderActionView
                action={action}
                pets={ownerHeader.pets ?? []}
                petsStatus={ownerHeader.petsStatus}
              />
            )
          : undefined
      }
    />
  );
}

function OwnerHeaderActionView({
  action,
  pets,
  petsStatus,
}: {
  action: NonNullable<ReturnType<typeof getOwnerHeaderAction>>;
  pets: PetListItem[];
  petsStatus: PetsStatus;
}) {
  const router = useRouter();
  const [showLimitDialog, setShowLimitDialog] = useState(false);
  const limit = getPetLimitStateFromPets(pets);

  if (action.type === "home-menu") {
    return (
      <GlobalAddMenu
        loadFailed={petsStatus === "error"}
        loading={petsStatus === "loading"}
        pets={pets}
      />
    );
  }

  const content = (
    <>
      <Icon aria-hidden="true" name="plus" className="h-4 w-4 shrink-0" />
      <span className="hidden min-[420px]:inline">{action.label}</span>
    </>
  );

  if (action.type === "link") {
    return (
      <Link
        aria-label={action.ariaLabel}
        className={headerActionClassName}
        data-owner-header-action
        href={action.href}
      >
        {content}
      </Link>
    );
  }

  if (action.type === "button") {
    return (
      <button
        aria-label={action.ariaLabel}
        className={headerActionClassName}
        data-owner-header-action
        onClick={action.onClick}
        type="button"
      >
        {content}
      </button>
    );
  }

  if (!action.limitReached) {
    return (
      <Link
        aria-label={action.ariaLabel}
        className={headerActionClassName}
        data-owner-header-action
        href={ownerRoutes.petNew}
      >
        {content}
      </Link>
    );
  }

  return (
    <>
      <button
        aria-label={action.ariaLabel}
        className={headerActionClassName}
        data-owner-header-action
        onClick={() => setShowLimitDialog(true)}
        type="button"
      >
        {content}
      </button>
      {showLimitDialog && typeof document !== "undefined"
        ? createPortal(
            <ConfirmDialog
              cancelLabel="Close"
              confirmLabel="View pricing"
              message={limit.message}
              onCancel={() => setShowLimitDialog(false)}
              onConfirm={() => {
                setShowLimitDialog(false);
                router.push(marketingRoutes.pricing);
              }}
              open
              title="Free profile limit reached"
            />,
            document.body
          )
        : null}
    </>
  );
}

// Matches the Add menu trigger: one weight for every header action, quieter
// than the brand and the Community switch beside them.
const headerActionClassName =
  "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-pet-coral bg-white px-2.5 py-2 text-sm font-extrabold text-pet-coral transition hover:bg-[#fff1ef] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal min-[420px]:px-4";

/**
 * The compact way between the product's two halves, on a phone.
 *
 * One control, and it always names where it goes rather than where you are —
 * "My pets" while you are in the community, "Community" while you are looking
 * after your pets. No mode names, no "portal": the words are the destinations
 * themselves. On a wide screen the sidebar's two labelled groups already do
 * this job, so it stays out of the way there.
 */
