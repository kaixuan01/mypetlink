"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon, type IconName } from "@/components/ui/Icon";
import { getActivePets } from "@/lib/petLifecycle";
import { getPetLimitStateFromPets } from "@/lib/planLimits";
import { marketingRoutes, ownerRoutes } from "@/lib/routes";
import type { Pet } from "@/types";

type GlobalAddMenuProps = {
  pets: Pet[];
  loading?: boolean;
  loadFailed?: boolean;
};

type PetSelectionAction = "moment" | "record";

type MenuAction = {
  key: string;
  label: string;
  description: string;
  icon: IconName;
  href?: string;
  onSelect?: () => void;
  disabled?: boolean;
};

type AnchorPosition = {
  top: number;
  right: number;
};

const TRIGGER_LABEL = "Add a pet, care record, or moment";

/**
 * Dashboard-only multi-create action. The backdrop and panel are portalled as
 * one unit so neither can be trapped by the sticky header's backdrop-filter
 * containing block or the desktop sidebar's overflow clipping.
 */
export function GlobalAddMenu({
  pets,
  loading = false,
  loadFailed = false,
}: GlobalAddMenuProps) {
  const pathname = usePathname();
  const router = useRouter();
  const menuId = useId();
  const menuTitleId = useId();
  const [open, setOpen] = useState(false);
  const [selectingPetFor, setSelectingPetFor] =
    useState<PetSelectionAction | null>(null);
  const [showLimitDialog, setShowLimitDialog] = useState(false);
  const [anchor, setAnchor] = useState<AnchorPosition>({ top: 0, right: 16 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const lastPathnameRef = useRef(pathname);

  const activePets = getActivePets(pets);
  const limit = getPetLimitStateFromPets(pets);

  const updateAnchor = useCallback(() => {
    const trigger = triggerRef.current;

    if (!trigger) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    setAnchor({
      top: rect.bottom + 8,
      right: Math.max(16, window.innerWidth - rect.right),
    });
  }, []);

  const dismissMenu = useCallback(() => {
    setOpen(false);
    setSelectingPetFor(null);
  }, []);

  const closeMenu = useCallback((restoreFocus = true) => {
    dismissMenu();

    if (restoreFocus) {
      queueMicrotask(() => triggerRef.current?.focus());
    }
  }, [dismissMenu]);

  useEffect(() => {
    if (lastPathnameRef.current === pathname) {
      return;
    }

    lastPathnameRef.current = pathname;
    queueMicrotask(() => closeMenu(false));
  }, [closeMenu, pathname]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handleViewportChange() {
      updateAnchor();
    }

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open, updateAnchor]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const desktop = window.matchMedia?.("(min-width: 640px)").matches ?? false;

    if (desktop) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    queueMicrotask(() => {
      panelRef.current
        ?.querySelector<HTMLElement>(
          "[data-add-menu-item]:not([aria-disabled='true'])"
        )
        ?.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();

        if (selectingPetFor) {
          setSelectingPetFor(null);
        } else {
          closeMenu();
        }
        return;
      }

      const items = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          "[data-add-menu-focusable]:not([aria-disabled='true'])"
        ) ?? []
      );

      if (!items.length) {
        return;
      }

      const currentIndex = items.indexOf(document.activeElement as HTMLElement);

      if (event.key === "ArrowDown") {
        event.preventDefault();
        items[(currentIndex + 1) % items.length]?.focus();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        items[(currentIndex - 1 + items.length) % items.length]?.focus();
      } else if (
        event.key === "Tab" &&
        !(window.matchMedia?.("(min-width: 640px)").matches ?? false)
      ) {
        const first = items[0];
        const last = items[items.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeMenu, open, selectingPetFor]);

  const actions = buildActions({
    activePets,
    limitReached: !limit.canCreate,
    loadFailed,
    loading,
    onLimitReached: () => {
      dismissMenu();
      setShowLimitDialog(true);
    },
    onSelectPet: setSelectingPetFor,
  });

  function toggleMenu() {
    if (open) {
      closeMenu();
      return;
    }

    updateAnchor();
    setSelectingPetFor(null);
    setOpen(true);
  }

  const panelStyle = {
    "--owner-add-anchor-top": `${anchor.top}px`,
    "--owner-add-anchor-right": `${anchor.right}px`,
  } as CSSProperties;

  const overlay =
    open && typeof document !== "undefined"
      ? createPortal(
          <>
            <button
              aria-label="Close add menu"
              className="owner-action-backdrop fixed inset-0 cursor-default bg-pet-ink/25 backdrop-blur-[2px] sm:bg-transparent sm:backdrop-blur-none"
              data-owner-action-backdrop
              onClick={() => closeMenu()}
              type="button"
            />
            <div
              aria-labelledby={menuTitleId}
              className="owner-action-panel fixed overflow-y-auto rounded-[1.5rem] border border-pet-border bg-white p-2 shadow-2xl shadow-[#0d1b3d]/20"
              data-owner-action-panel
              id={menuId}
              ref={panelRef}
              role="menu"
              style={panelStyle}
            >
              <div className="flex items-center justify-between gap-3 px-2 py-1.5">
                <div className="min-w-0">
                  <p
                    className="truncate text-sm font-black text-pet-ink"
                    id={menuTitleId}
                  >
                    {selectingPetFor
                      ? selectingPetFor === "record"
                        ? "Choose a pet for the record"
                        : "Choose a pet for the moment"
                      : "What would you like to add?"}
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-pet-muted sm:hidden">
                    {selectingPetFor
                      ? "Your choice opens the correct pet flow."
                      : "Create one new item."}
                  </p>
                </div>
                <button
                  aria-label={
                    selectingPetFor ? "Back to add actions" : "Close action sheet"
                  }
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-pet-border bg-white text-pet-muted transition hover:bg-pet-cream hover:text-pet-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal"
                  data-add-menu-focusable
                  onClick={() =>
                    selectingPetFor
                      ? setSelectingPetFor(null)
                      : closeMenu()
                  }
                  type="button"
                >
                  {selectingPetFor ? (
                    <svg
                      aria-hidden="true"
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      viewBox="0 0 24 24"
                    >
                      <path d="m14 6-6 6 6 6" />
                    </svg>
                  ) : (
                    <Icon name="plus" className="h-5 w-5 rotate-45" />
                  )}
                </button>
              </div>

              <div className="mt-1 grid gap-1">
                {selectingPetFor
                  ? activePets.map((pet) => (
                      <MenuActionItem
                        action={{
                          key: pet.id,
                          label: pet.name,
                          description:
                            selectingPetFor === "record"
                              ? "Add a care record for this pet"
                              : "Add a moment for this pet",
                          icon: selectingPetFor === "record" ? "record" : "heart",
                          href:
                            selectingPetFor === "record"
                              ? ownerRoutes.petRecords(pet.id, { create: true })
                              : ownerRoutes.petMomentNew(pet.id),
                        }}
                        key={pet.id}
                        onSelect={() => closeMenu(false)}
                      />
                    ))
                  : actions.map((action) => (
                      <MenuActionItem
                        action={action}
                        key={action.key}
                        onSelect={() => closeMenu(false)}
                      />
                    ))}
              </div>
            </div>
          </>,
          document.body
        )
      : null;

  return (
    <>
      <button
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={TRIGGER_LABEL}
        className="inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-pet-coral bg-pet-coral px-3 py-2 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#f26155] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal min-[360px]:px-4"
        data-owner-header-action
        onClick={toggleMenu}
        ref={triggerRef}
        type="button"
      >
        <Icon aria-hidden="true" name="plus" className="h-4 w-4" />
        Add
      </button>

      {overlay}

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

function buildActions({
  activePets,
  limitReached,
  loadFailed,
  loading,
  onLimitReached,
  onSelectPet,
}: {
  activePets: Pet[];
  limitReached: boolean;
  loadFailed: boolean;
  loading: boolean;
  onLimitReached: () => void;
  onSelectPet: (action: PetSelectionAction) => void;
}): MenuAction[] {
  const petDependentDescription = loadFailed
    ? "We couldn't load your pets. Please try again."
    : "Create a pet first";

  const addPetAction: MenuAction = loadFailed
    ? {
        key: "add-pet",
        label: "Add Pet",
        description: "We couldn't check your plan. Please try again.",
        icon: "pets",
        disabled: true,
      }
    : loading
      ? {
          key: "add-pet",
          label: "Add Pet",
          description: "Checking your plan...",
          icon: "pets",
          disabled: true,
        }
      : limitReached
        ? {
            key: "add-pet",
            label: "Add Pet",
            description: "Free profile limit reached",
            icon: "pets",
            onSelect: onLimitReached,
          }
        : {
            key: "add-pet",
            label: "Add Pet",
            description: "Create a new pet profile",
            icon: "pets",
            href: ownerRoutes.petNew,
          };

  const getPetAction = (
    action: PetSelectionAction,
    label: string,
    description: string,
    icon: IconName
  ): MenuAction => {
    if (!activePets.length) {
      return {
        key: `add-${action}`,
        label,
        description: petDependentDescription,
        icon,
        disabled: true,
      };
    }

    if (activePets.length === 1) {
      const pet = activePets[0];
      return {
        key: `add-${action}`,
        label,
        description,
        icon,
        href:
          action === "record"
            ? ownerRoutes.petRecords(pet.id, { create: true })
            : ownerRoutes.petMomentNew(pet.id),
      };
    }

    return {
      key: `add-${action}`,
      label,
      description: `${description} — choose a pet`,
      icon,
      onSelect: () => onSelectPet(action),
    };
  };

  return [
    addPetAction,
    getPetAction(
      "record",
      "Add Care Record",
      "Log a vaccine, vet visit, or note",
      "record"
    ),
    getPetAction("moment", "Add Moment", "Save a photo or memory", "heart"),
  ];
}

function MenuActionItem({
  action,
  onSelect,
}: {
  action: MenuAction;
  onSelect: () => void;
}) {
  const content = (
    <>
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${
          action.disabled
            ? "bg-pet-cream text-pet-muted"
            : "bg-[#e8f3ff] text-pet-teal"
        }`}
      >
        <Icon name={action.icon} className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-black text-pet-ink">
          {action.label}
        </span>
        <span className="mt-0.5 block text-xs font-semibold leading-4 text-pet-muted">
          {action.description}
        </span>
      </span>
    </>
  );

  const baseClass =
    "flex min-h-14 w-full items-center gap-3 rounded-[1.1rem] px-3 py-2.5 text-left transition focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-pet-teal";

  if (action.disabled) {
    return (
      <div
        aria-disabled="true"
        className={`${baseClass} cursor-not-allowed opacity-60`}
        role="menuitem"
      >
        {content}
      </div>
    );
  }

  if (action.href) {
    return (
      <Link
        className={`${baseClass} hover:bg-pet-cream`}
        data-add-menu-focusable
        data-add-menu-item
        href={action.href}
        onClick={onSelect}
        role="menuitem"
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      className={`${baseClass} hover:bg-pet-cream`}
      data-add-menu-focusable
      data-add-menu-item
      onClick={action.onSelect}
      role="menuitem"
      type="button"
    >
      {content}
    </button>
  );
}
