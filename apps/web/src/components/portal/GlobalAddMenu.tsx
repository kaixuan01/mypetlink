"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { forwardRef, useCallback, useEffect, useId, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon, type IconName } from "@/components/ui/Icon";
import { getActivePets } from "@/lib/petLifecycle";
import { getPetLimitStateFromPets } from "@/lib/planLimits";
import { ownerRoutes } from "@/lib/routes";
import { getPets } from "@/services/petService";
import type { Pet } from "@/types";

type GlobalAddMenuVariant = "compact" | "full" | "icon";

type GlobalAddMenuProps = {
  variant?: GlobalAddMenuVariant;
  className?: string;
};

type MenuAction = {
  key: string;
  label: string;
  description: string;
  icon: IconName;
  href?: string;
  onSelect?: () => void;
  disabled?: boolean;
};

const TRIGGER_LABEL = "Add a pet, care record, or moment";

// One shared create entry point for the Owner Portal. Opens a responsive
// action menu (anchored popover on larger screens, bottom sheet on phones)
// with Add Pet, Add Care Record, and Add Pet Moment. Care Record and Pet
// Moment route to the existing pet-selection flows (/records, /moments), which
// preselect the only pet, offer the switcher when there are several, and guide
// owners with no pets to create their first one.
export function GlobalAddMenu({
  variant = "compact",
  className = "",
}: GlobalAddMenuProps) {
  const router = useRouter();
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [pets, setPets] = useState<Pet[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [showLimitDialog, setShowLimitDialog] = useState(false);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;

    getPets()
      .then((response) => {
        if (active) {
          setPets(response.data);
          setLoadFailed(false);
        }
      })
      .catch(() => {
        if (active) {
          setPets([]);
          setLoadFailed(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  // Closing never touches the trigger ref during render; focus restoration is
  // handled in the Escape handler (an event context) where reading the ref is
  // safe.
  const closeMenu = useCallback(() => {
    setOpen(false);
  }, []);

  // Focus the first actionable item when the menu opens.
  useEffect(() => {
    if (!open) {
      return;
    }

    const focusable = panelRef.current?.querySelector<HTMLElement>(
      "[data-add-menu-item]:not([aria-disabled='true'])"
    );
    focusable?.focus();
  }, [open]);

  // Escape closes and restores focus; Tab stays within the open panel.
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }

      const items = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          "[data-add-menu-item]:not([aria-disabled='true'])"
        ) ?? []
      );

      if (!items.length) {
        return;
      }

      const currentIndex = items.indexOf(
        document.activeElement as HTMLElement
      );

      if (event.key === "ArrowDown") {
        event.preventDefault();
        const next = items[(currentIndex + 1) % items.length];
        next?.focus();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        const prev =
          items[(currentIndex - 1 + items.length) % items.length];
        prev?.focus();
      } else if (event.key === "Tab") {
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
  }, [open]);

  const activePets = pets ? getActivePets(pets) : [];
  const hasPets = activePets.length > 0;
  const limit = pets ? getPetLimitStateFromPets(pets) : null;
  const isLoading = pets === null;

  const addPetAction: MenuAction = (() => {
    if (loadFailed) {
      return {
        key: "add-pet",
        label: "Add Pet",
        description: "We couldn't check your plan. Please try again.",
        icon: "pets",
        disabled: true,
      };
    }

    if (isLoading) {
      return {
        key: "add-pet",
        label: "Add Pet",
        description: "Checking your plan...",
        icon: "pets",
        disabled: true,
      };
    }

    if (limit?.canCreate) {
      return {
        key: "add-pet",
        label: "Add Pet",
        description: "Create a new pet profile",
        icon: "pets",
        href: ownerRoutes.petNew,
      };
    }

    return {
      key: "add-pet",
      label: "Add Pet",
      description: "Free profile limit reached",
      icon: "pets",
      onSelect: () => {
        closeMenu();
        setShowLimitDialog(true);
      },
    };
  })();

  const petDependentDescription = loadFailed
    ? "We couldn't load your pets. Please try again."
    : "Add your first pet to use this";

  const addRecordAction: MenuAction = {
    key: "add-record",
    label: "Add Care Record",
    description: hasPets ? "Log a vaccine, vet visit, or note" : petDependentDescription,
    icon: "record",
    href: hasPets ? ownerRoutes.records : undefined,
    disabled: !hasPets,
  };

  const addMomentAction: MenuAction = {
    key: "add-moment",
    label: "Add Pet Moment",
    description: hasPets ? "Save a photo or memory" : petDependentDescription,
    icon: "heart",
    href: hasPets ? ownerRoutes.moments : undefined,
    disabled: !hasPets,
  };

  const actions = [addPetAction, addRecordAction, addMomentAction];

  // Header trigger opens downward; sidebar triggers sit near the bottom of the
  // page and open upward so the panel is never clipped off-screen.
  const panelPositionClass =
    variant === "compact"
      ? "sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-[calc(100%_+_0.5rem)] sm:w-72"
      : variant === "full"
        ? "sm:absolute sm:inset-x-auto sm:top-auto sm:left-0 sm:bottom-[calc(100%_+_0.5rem)] sm:w-full"
        : "sm:absolute sm:inset-x-auto sm:top-auto sm:left-0 sm:bottom-[calc(100%_+_0.5rem)] sm:w-64";

  return (
    <div className={`relative ${className}`.trim()}>
      <MenuTrigger
        variant={variant}
        open={open}
        menuId={menuId}
        ref={triggerRef}
        onClick={() => setOpen((value) => !value)}
      />

      {open ? (
        <>
          <button
            aria-label="Close add menu"
            className="fixed inset-0 z-40 cursor-default bg-pet-ink/25 backdrop-blur-[2px] sm:bg-transparent sm:backdrop-blur-none"
            onClick={() => closeMenu()}
            type="button"
          />
          <div
            aria-label="Add"
            className={`fixed inset-x-3 bottom-[calc(var(--owner-bottom-nav-height)_+_env(safe-area-inset-bottom))] z-50 rounded-[1.5rem] border border-pet-border bg-white p-2 shadow-2xl shadow-[#0d1b3d]/20 ${panelPositionClass}`}
            id={menuId}
            ref={panelRef}
            role="menu"
          >
            {actions.map((action) => (
              <MenuActionItem
                action={action}
                key={action.key}
                onSelect={() => closeMenu()}
              />
            ))}
          </div>
        </>
      ) : null}

      <ConfirmDialog
        cancelLabel="Close"
        confirmLabel="View pricing"
        message={
          limit?.message ??
          "You've reached the Free profile limit. Premium plans for more pets are coming soon. Your existing pet profiles remain active."
        }
        onCancel={() => setShowLimitDialog(false)}
        onConfirm={() => {
          setShowLimitDialog(false);
          router.push("/pricing");
        }}
        open={showLimitDialog}
        title="Free profile limit reached"
      />
    </div>
  );
}

const MenuTrigger = forwardRef<
  HTMLButtonElement,
  {
    variant: GlobalAddMenuVariant;
    open: boolean;
    menuId: string;
    onClick: () => void;
  }
>(function MenuTrigger({ variant, open, menuId, onClick }, ref) {
  const shared = {
    "aria-label": TRIGGER_LABEL,
    "aria-haspopup": "menu" as const,
    "aria-expanded": open,
    "aria-controls": menuId,
    onClick,
    ref,
    type: "button" as const,
  };

  if (variant === "icon") {
    return (
      <button
        {...shared}
        className="grid h-11 w-11 place-items-center rounded-full bg-pet-coral text-white shadow-lg shadow-[#ff7a6e]/20 transition hover:bg-[#f26155]"
      >
        <Icon name="plus" className="h-5 w-5" />
      </button>
    );
  }

  if (variant === "full") {
    return (
      <button
        {...shared}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-pet-coral bg-pet-coral px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-[#ff7a6e]/20 transition hover:bg-[#f26155]"
      >
        <Icon name="plus" className="h-4 w-4" />
        Add
      </button>
    );
  }

  return (
    <button
      {...shared}
      className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-pet-coral bg-pet-coral px-4 py-2 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#f26155]"
    >
      <Icon name="plus" className="h-4 w-4" />
      Add
    </button>
  );
});

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
    "flex w-full min-h-14 items-center gap-3 rounded-[1.1rem] px-3 py-2.5 text-left transition";

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
      data-add-menu-item
      onClick={() => {
        action.onSelect?.();
      }}
      role="menuitem"
      type="button"
    >
      {content}
    </button>
  );
}
