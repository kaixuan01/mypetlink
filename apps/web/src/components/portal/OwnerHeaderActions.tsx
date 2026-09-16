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
import { marketingRoutes, ownerRoutes, socialRoutes } from "@/lib/routes";
import { isSocialPath, socialNavItems } from "@/lib/socialNavigation";
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
      className={`relative z-20 border-b border-pet-border bg-pet-cream/92 px-4 py-4 backdrop-blur lg:border-0 lg:bg-transparent lg:px-8 lg:pb-0 lg:pt-5 lg:backdrop-blur-none ${
        action ? "" : "lg:hidden"
      }`}
    >
      <div className="flex min-w-0 items-center justify-between gap-2.5">
        {/*
          The brand never shrinks. It used to be the only flexible item in this
          row, so once the Community switch and the Add button had taken their
          width it was left rendering "My…" — a broken-looking wordmark being the
          one thing on the header that must not look broken. It either fits whole
          or it steps back to the mark alone, which is still the brand.
        */}
        <Link
          aria-label="MyPetLink Owner Portal home"
          className="flex shrink-0 items-center gap-2.5 lg:hidden"
          href={ownerRoutes.dashboard}
        >
          <BrandLogo markOnly className="h-10 w-10 shrink-0" />
          <span className="hidden whitespace-nowrap text-sm font-black text-pet-ink min-[360px]:inline">
            MyPetLink
          </span>
        </Link>
        <SocialModeSwitch pathname={pathname} />
        {action && ownerHeader ? (
          <PagePrimaryAction
            key={pathname}
            pageTitle={action.compactTitle}
            renderAction={() => (
              <OwnerHeaderActionView
                action={action}
                pets={ownerHeader.pets ?? []}
                petsStatus={ownerHeader.petsStatus}
              />
            )}
          />
        ) : null}
      </div>
    </header>
  );
}

/**
 * Keeps the full Owner Portal header in the document flow, then mirrors its
 * single resolved action in a compact mobile app bar only after the original
 * action has passed above the viewport. The fixed copy is portalled so header
 * backdrop filters and layout overflow cannot create a trapping containing
 * block or clip it.
 */
function PagePrimaryAction({
  pageTitle,
  renderAction,
}: {
  pageTitle: string;
  renderAction: () => ReactNode;
}) {
  const originRef = useRef<HTMLDivElement | null>(null);
  const [compactVisible, setCompactVisible] = useState(false);

  useEffect(() => {
    const origin = originRef.current;

    if (!origin || typeof IntersectionObserver === "undefined") {
      return undefined;
    }

    const observedOrigin = origin;
    const mobileLayout = window.matchMedia("(max-width: 1023px)");
    let observer: IntersectionObserver | null = null;

    function stopObserving() {
      observer?.disconnect();
      observer = null;
    }

    function observeForCurrentLayout() {
      stopObserving();

      if (!mobileLayout.matches) {
        setCompactVisible(false);
        return;
      }

      observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry) {
            return;
          }

          // Only reveal after the original has passed above the viewport. An
          // element below the viewport must not produce a premature action bar.
          const passedAbove =
            !entry.isIntersecting && entry.boundingClientRect.bottom <= 0;
          setCompactVisible(passedAbove);
        },
        { threshold: 0 }
      );
      observer.observe(observedOrigin);
    }

    observeForCurrentLayout();
    mobileLayout.addEventListener("change", observeForCurrentLayout);

    return () => {
      stopObserving();
      mobileLayout.removeEventListener("change", observeForCurrentLayout);
    };
  }, []);

  const compactBar =
    compactVisible && typeof document !== "undefined"
      ? createPortal(
          <div
            className="owner-sticky-action-bar fixed inset-x-0 top-0 border-b border-pet-border bg-white/95 pt-[env(safe-area-inset-top)] shadow-md shadow-[#0d1b3d]/8 backdrop-blur lg:hidden"
            data-owner-compact-action-bar
          >
            <div className="mx-auto flex min-h-14 w-full max-w-7xl items-center gap-2.5 px-3 min-[360px]:px-4 sm:px-6">
              <p
                className="min-w-0 flex-1 truncate text-sm font-black text-pet-ink"
                title={pageTitle}
              >
                {pageTitle}
              </p>
              <div className="shrink-0">{renderAction()}</div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <div
        aria-hidden={compactVisible || undefined}
        className="ml-auto shrink-0"
        inert={compactVisible}
        ref={originRef}
      >
        {renderAction()}
      </div>
      {compactBar}
    </>
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
function SocialModeSwitch({ pathname }: { pathname: string }) {
  if (socialNavItems.length === 0) {
    return null;
  }

  const inSocial = isSocialPath(pathname);

  return (
    <Link
      className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-pet-border bg-white px-3 text-sm font-bold text-pet-ink transition hover:bg-pet-cream lg:hidden"
      data-testid="social-mode-switch"
      href={inSocial ? ownerRoutes.dashboard : socialRoutes.feed}
    >
      <Icon
        aria-hidden="true"
        className="h-4 w-4"
        name={inSocial ? "pets" : "users"}
      />
      {inSocial ? "My pets" : "Community"}
    </Link>
  );
}
