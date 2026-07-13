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
import { BrandLogo } from "@/components/brand/BrandLogo";
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
import type { Pet } from "@/types";

type PetsStatus = "loading" | "ready" | "error";

type RegisteredPageContext = OwnerHeaderPageContext & {
  registrationId: number;
};

type OwnerHeaderActionsContextValue = {
  pageContext: RegisteredPageContext | null;
  pets: Pet[] | null;
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
  const [pets, setPets] = useState<Pet[] | null>(null);
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

export function useOwnerHeaderPageContext(
  context: Omit<OwnerHeaderPageContext, "pathname">
) {
  const registerPageContext = useContext(
    OwnerHeaderActionsContext
  )?.registerPageContext;
  const { canCreate, itemCount, onCreate, petId, section, status } = context;

  useEffect(() => {
    if (!registerPageContext) {
      return undefined;
    }

    return registerPageContext({
      canCreate,
      itemCount,
      onCreate,
      petId,
      section,
      status,
    });
  }, [
    canCreate,
    itemCount,
    onCreate,
    petId,
    registerPageContext,
    section,
    status,
  ]);
}

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
    <header
      className={`sticky top-0 z-20 border-b border-pet-border bg-pet-cream/92 px-4 py-4 backdrop-blur lg:border-0 lg:bg-transparent lg:px-8 lg:pb-0 lg:pt-5 lg:backdrop-blur-none ${
        action ? "" : "lg:hidden"
      }`}
    >
      <div className="flex min-w-0 items-center justify-between gap-2.5">
        <Link
          aria-label="MyPetLink Owner Portal home"
          className="flex min-w-0 items-center gap-2.5 lg:hidden"
          href={ownerRoutes.dashboard}
        >
          <BrandLogo markOnly className="h-10 w-10 shrink-0" />
          <span className="hidden truncate text-sm font-black text-pet-ink min-[350px]:inline">
            MyPetLink
          </span>
        </Link>
        {action && ownerHeader ? (
          <div className="ml-auto shrink-0">
            <OwnerHeaderActionView
              action={action}
              pets={ownerHeader.pets ?? []}
              petsStatus={ownerHeader.petsStatus}
            />
          </div>
        ) : null}
      </div>
    </header>
  );
}

function OwnerHeaderActionView({
  action,
  pets,
  petsStatus,
}: {
  action: NonNullable<ReturnType<typeof getOwnerHeaderAction>>;
  pets: Pet[];
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
      <span>{action.label}</span>
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

const headerActionClassName =
  "inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-pet-coral bg-pet-coral px-3 py-2 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#f26155] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal min-[360px]:px-4";
