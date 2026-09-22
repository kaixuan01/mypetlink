"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SearchResultsSkeleton } from "@/components/social/SocialSkeletons";
import { Icon } from "@/components/ui/Icon";
import { CTAButton } from "@/components/ui/CTAButton";
import {
  toAnalyticsCountBucket,
  toAnalyticsQueryLengthBucket,
  trackEvent,
} from "@/lib/analytics";
import { formatPetSummaryLabel } from "@/lib/petDisplay";
import { ownerSocialProfilePath, petPublicProfilePath } from "@/lib/routes";
import {
  minimumSearchLength,
  searchSocial,
  type SocialOwnerCard,
  type SocialPetCard,
} from "@/services/socialDiscoveryService";

type Tab = "pets" | "owners";
type SearchPhase = "loading" | "ready" | "error";

type SearchRequestState = {
  key: string;
  phase: SearchPhase;
  pets: SocialPetCard[];
  owners: SocialOwnerCard[];
  rateLimited: boolean;
};

type SocialSearchExperienceProps = {
  /**
   * Focus the box on mount. True for the overlay, where searching is the only
   * reason it opened; false is available for surfaces where stealing focus
   * would move the page under somebody.
   */
  autoFocus?: boolean;
  /** Called when a result is opened, so an overlay can close behind it. */
  onNavigate?: () => void;
  /** Rendered beside the input — the overlay's Back control on a phone. */
  leading?: React.ReactNode;
  /**
   * Seeds the box once, for `/search?q=…`. Only a starting value: the input
   * owns the query afterwards, and the URL is never rewritten as somebody
   * types, because a history entry per keystroke makes Back useless.
   */
  initialQuery?: string;
  /** Lets a shell hand this input to its dialog as the thing to focus first. */
  inputRef?: React.RefObject<HTMLInputElement | null>;
};

/**
 * Finding a pet or a household, wherever that is being done.
 *
 * This is the whole of search: the box, the two tabs, the requests, the empty
 * states, the errors and the rows. The three places it appears — a dialog on a
 * desktop, a full-screen surface on a phone, and the `/search` page somebody
 * deep-linked to — are three shells around this one component, because a second
 * implementation is how two searches end up disagreeing about what is
 * searchable.
 *
 * **Searchable: a pet's name, and a household's handle or chosen display
 * name.** Nothing else. No account name, no email, no phone, no finder-facing
 * name, no safety or tag code — those have their own routes and their own
 * gating, and a search box is not one of them. The API enforces this; the UI
 * simply never offers anywhere else to look.
 *
 * **Rows, not cards.** A result is a step on the way to a profile, so it is a
 * line you can scan and tap. The Follow control lives on the profile, where
 * there is enough of the household on screen to make following a decision
 * rather than a reflex.
 */
export function SocialSearchExperience({
  autoFocus = false,
  onNavigate,
  leading,
  initialQuery = "",
  inputRef: externalInputRef,
}: SocialSearchExperienceProps) {
  const [term, setTerm] = useState(initialQuery);
  const [tab, setTab] = useState<Tab>("pets");
  const [queryRevision, setQueryRevision] = useState(0);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [request, setRequest] = useState<SearchRequestState>({
    key: "",
    phase: "loading",
    pets: [],
    owners: [],
    rateLimited: false,
  });
  const ownInputRef = useRef<HTMLInputElement | null>(null);
  const inputRef = externalInputRef ?? ownInputRef;

  const trimmed = term.trim();
  const tooShort = trimmed.length < minimumSearchLength;
  // A revision distinguishes re-entering the same text from the earlier
  // request for it. That prevents a cached-looking flash of old results while
  // the new, debounced request is waiting to start.
  const requestKey = `${queryRevision}:${retryAttempt}:${trimmed}`;
  // Derived, not stored: a box too short to search is a state of the input, not
  // a result the component has to remember.
  const state = tooShort
    ? "idle"
    : request.key === requestKey
      ? request.phase
      : "loading";
  const pets = state === "ready" ? request.pets : [];
  const owners = state === "ready" ? request.owners : [];

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus, inputRef]);

  useEffect(() => {
    if (trimmed.length < minimumSearchLength) {
      return;
    }

    // Two guards, doing different jobs. The debounce stops a request going out
    // for every keystroke, which is what turns a 30-per-minute rate limit into
    // a wall for somebody typing at a normal speed. The abort makes a request
    // that is already in flight stop mattering the moment the query moves on,
    // so a slow answer to "mo" can never land on top of the answer to "mochi".
    const controller = new AbortController();
    const query = trimmed;

    const timer = window.setTimeout(() => {
      // Announced when the request actually goes out rather than on every
      // keystroke, so a screen reader is not told "Searching" per character.
      setRequest({
        key: requestKey,
        phase: "loading",
        pets: [],
        owners: [],
        rateLimited: false,
      });

      searchSocial(query, undefined, controller.signal)
        .then((results) => {
          if (controller.signal.aborted) return;

          setRequest({
            key: requestKey,
            phase: "ready",
            pets: results.pets,
            owners: results.owners,
            rateLimited: false,
          });

          // Buckets only. There is no key on this event through which the
          // query itself could travel — not truncated, not hashed.
          trackEvent("social_search_performed", {
            source: "search",
            result_tab:
              results.pets.length >= results.owners.length
                ? "pets"
                : "pet_parents",
            result_count_bucket: toAnalyticsCountBucket(
              results.pets.length + results.owners.length
            ),
            query_length_bucket: toAnalyticsQueryLengthBucket(query.length),
          });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;

          // The typed query is deliberately left alone: clearing the box on a
          // failure makes somebody retype what they already typed.
          setRequest({
            key: requestKey,
            phase: "error",
            pets: [],
            owners: [],
            rateLimited:
              typeof error === "object" &&
              error !== null &&
              "status" in error &&
              (error as { status?: number }).status === 429,
          });
        });
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [requestKey, trimmed]);

  const results = tab === "pets" ? pets : owners;

  return (
    // Fills whatever it is given. Inside the dialog the height is definite, so
    // the box and the tabs stay put and only the results scroll; on the
    // standalone page the height is not, so the whole page scrolls as usual.
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2">
        {leading}

        <div className="relative min-w-0 flex-1">
          <label className="sr-only" htmlFor="social-search-input">
            Search pets or pet parents
          </label>
          <Icon
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-pet-muted"
            name="search"
          />
          <input
            autoComplete="off"
            className="min-h-12 w-full rounded-full border border-pet-border bg-white pl-11 pr-4 text-base font-semibold text-pet-ink outline-none transition focus:border-pet-teal focus:ring-2 focus:ring-pet-teal/30"
            data-testid="social-search-input"
            id="social-search-input"
            onChange={(event) => {
              setTerm(event.target.value);
              setQueryRevision((revision) => revision + 1);
            }}
            placeholder="Search pets or pet parents"
            ref={inputRef}
            type="search"
            value={term}
          />
        </div>
      </div>

      <nav aria-label="Result type" className="mt-4 flex shrink-0 gap-2">
        <TabButton
          active={tab === "pets"}
          count={pets.length}
          label="Pets"
          onSelect={() => setTab("pets")}
        />
        <TabButton
          active={tab === "owners"}
          count={owners.length}
          label="Pet Parents"
          onSelect={() => setTab("owners")}
        />
      </nav>

      <div aria-live="polite" className="mt-4 min-h-0 flex-1 overflow-y-auto">
        {state === "idle" ? (
          <p
            className="text-sm font-semibold text-pet-muted"
            data-testid="search-hint"
          >
            {trimmed.length === 0
              ? "Search by pet name, Pet Parent name, or handle."
              : `Type at least ${minimumSearchLength} letters to search.`}
          </p>
        ) : null}

        {state === "loading" ? <SearchResultsSkeleton /> : null}

        {state === "error" ? (
          <div
            className="rounded-[1.5rem] border border-pet-border bg-white p-5 text-center"
            data-testid="search-error"
            role="alert"
          >
            <p className="text-base font-black text-pet-ink">
              Couldn&rsquo;t load search results.
            </p>
            <p className="mt-1 text-sm font-semibold text-pet-muted">
              {request.rateLimited
                ? "That’s a lot of searching. Please wait a moment, then retry."
                : "Please try again in a moment."}
            </p>
            <CTAButton
              className="mt-4 min-h-11"
              onClick={() => setRetryAttempt((attempt) => attempt + 1)}
              variant="secondary"
            >
              Retry
            </CTAButton>
          </div>
        ) : null}

        {state === "ready" ? (
          results.length > 0 ? (
            <ul
              className="space-y-1"
              data-testid={tab === "pets" ? "search-pets" : "search-owners"}
            >
              {tab === "pets"
                ? pets.map((pet) => (
                    <PetRow key={pet.publicSlug} onNavigate={onNavigate} pet={pet} />
                  ))
                : owners.map((owner) => (
                    <OwnerRow
                      key={owner.handle}
                      onNavigate={onNavigate}
                      owner={owner}
                    />
                  ))}
            </ul>
          ) : (
            <div
              className="rounded-[1.5rem] border border-pet-border bg-white p-5 text-center"
              data-testid={
                tab === "pets" ? "search-pets-empty" : "search-owners-empty"
              }
            >
              <p className="text-base font-black text-pet-ink">
                {pets.length === 0 && owners.length === 0
                  ? `No results for “${trimmed}”`
                  : tab === "pets"
                    ? `No pets for “${trimmed}”`
                    : `No Pet Parents for “${trimmed}”`}
              </p>
              <p className="mt-1 text-sm font-semibold text-pet-muted">
                Try another pet name, Pet Parent name, or handle.
              </p>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}

/** A pet, and the household that shares it. The whole row opens the profile. */
function PetRow({
  pet,
  onNavigate,
}: {
  pet: SocialPetCard;
  onNavigate?: () => void;
}) {
  // The same helper the Explore card uses, so one pet is described the same way
  // wherever it is found — including the Other/custom-species rule.
  const detail = formatPetSummaryLabel({
    species:
      pet.species === "Other" && pet.customSpecies
        ? pet.customSpecies
        : pet.species,
    breed: pet.breed,
  });

  return (
    <li>
      <Link
        className="flex min-w-0 items-center gap-3 rounded-[1.25rem] p-2 transition hover:bg-pet-cream focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pet-teal"
        data-testid="search-pet-row"
        href={petPublicProfilePath(pet.publicSlug)}
        onClick={onNavigate}
      >
        <Avatar alt="" icon="paw" url={pet.photoThumbnailUrl} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-black text-pet-ink">
            {pet.name}
          </span>
          {detail ? (
            <span className="block truncate text-xs font-bold text-pet-muted">
              {detail}
            </span>
          ) : null}
          <span className="block truncate text-xs font-semibold text-pet-muted">
            Shared by @{pet.owner.handle}
          </span>
        </span>
      </Link>
    </li>
  );
}

/** A household, by the identity it chose for Social and nothing else. */
function OwnerRow({
  owner,
  onNavigate,
}: {
  owner: SocialOwnerCard;
  onNavigate?: () => void;
}) {
  return (
    <li>
      <Link
        className="flex min-w-0 items-center gap-3 rounded-[1.25rem] p-2 transition hover:bg-pet-cream focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pet-teal"
        data-testid="search-owner-row"
        href={ownerSocialProfilePath(owner.handle)}
        onClick={onNavigate}
      >
        <Avatar alt="" icon="users" url={owner.avatarThumbnailUrl} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-black text-pet-ink">
            {owner.displayName}
          </span>
          <span className="block truncate text-xs font-bold text-pet-muted">
            @{owner.handle}
            {owner.generalArea ? ` · ${owner.generalArea}` : ""}
          </span>
        </span>
      </Link>
    </li>
  );
}

function Avatar({
  url,
  alt,
  icon,
}: {
  url: string | null;
  alt: string;
  icon: "paw" | "users";
}) {
  return (
    <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full border border-pet-border bg-pet-cream">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={alt}
          className="h-full w-full object-cover"
          loading="lazy"
          src={url}
        />
      ) : (
        <Icon className="h-5 w-5 text-pet-muted" name={icon} />
      )}
    </span>
  );
}

function TabButton({
  active,
  count,
  label,
  onSelect,
}: {
  active: boolean;
  count: number;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={`inline-flex min-h-10 items-center rounded-full border px-4 py-2 text-sm font-bold transition ${
        active
          ? "border-pet-ink bg-pet-ink text-white"
          : "border-pet-border bg-white text-pet-ink hover:bg-pet-cream"
      }`}
      onClick={onSelect}
      type="button"
    >
      {label}
      {count > 0 ? (
        <span className="ml-1.5 tabular-nums opacity-70">{count}</span>
      ) : null}
    </button>
  );
}
