"use client";

import {
  useEffect,
  useId,
  useState,
  type KeyboardEvent,
  type RefObject,
  type SyntheticEvent,
} from "react";
import { Icon } from "@/components/ui/Icon";
import {
  getCommentMentionSuggestions,
  type CommentMentionSuggestion,
  type CommentMentionSuggestionContext,
} from "@/services/momentCommentService";

export type ActiveMentionToken = {
  start: number;
  end: number;
  query: string;
};

const handleCharacter = /^[A-Za-z0-9_.]$/;
const cannotPrecedeMention = /^[A-Za-z0-9_.@/\\\-+=:%&#~]$/;

/** Mirrors the backend's running-text boundary rules without resolving identity. */
export function activeMentionToken(
  value: string,
  caret: number | null
): ActiveMentionToken | null {
  if (caret === null || caret < 0 || caret > value.length) return null;

  let runStart = caret;
  while (runStart > 0 && handleCharacter.test(value[runStart - 1])) runStart -= 1;

  const at = runStart - 1;
  if (at < 0 || value[at] !== "@") return null;
  if (at > 0 && cannotPrecedeMention.test(value[at - 1])) return null;

  let runEnd = caret;
  while (runEnd < value.length && handleCharacter.test(value[runEnd])) runEnd += 1;
  if (runEnd < value.length && (value[runEnd] === "@" || /[\p{L}\p{N}]/u.test(value[runEnd]))) {
    return null;
  }

  // A sentence-ending dot/underscore is punctuation, not part of the handle.
  // When the caret is just after it, keep it outside the replacement.
  let tokenEnd = runEnd;
  while (tokenEnd > at + 1 && /[._]/.test(value[tokenEnd - 1])) tokenEnd -= 1;
  const queryEnd = Math.min(caret, tokenEnd);
  const query = value.slice(at + 1, queryEnd);
  if (!query || !/^[A-Za-z0-9_.]+$/.test(query)) return null;

  return { start: at, end: tokenEnd, query };
}

export function insertMention(
  value: string,
  token: ActiveMentionToken,
  handle: string
) {
  const inserted = `@${handle} `;
  return {
    value: `${value.slice(0, token.start)}${inserted}${value.slice(token.end)}`,
    caret: token.start + inserted.length,
  };
}

export function CommentMentionComposer({
  momentId,
  value,
  disabled,
  hasError,
  inputRef,
  onChange,
  onSubmit,
}: {
  momentId: string;
  value: string;
  disabled: boolean;
  hasError: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const listboxId = useId();
  const [token, setToken] = useState<ActiveMentionToken | null>(null);
  const [suggestions, setSuggestions] = useState<CommentMentionSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [selectionTooLong, setSelectionTooLong] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const activeToken = value ? token : null;
  const open = Boolean(activeToken) && !dismissed;

  useEffect(() => {
    if (!activeToken || dismissed) return;

    let active = true;
    const timer = window.setTimeout(() => {
      getCommentMentionSuggestions(momentId, activeToken.query)
        .then((result) => {
          if (!active) return;
          setSuggestions(result.items);
          setActiveIndex(result.items.length > 0 ? 0 : -1);
        })
        .catch(() => {
          if (!active) return;
          setSuggestions([]);
          setUnavailable(true);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [activeToken, dismissed, momentId]);

  function refreshToken(currentValue: string, caret: number | null) {
    const next = activeMentionToken(currentValue, caret);
    const changed =
      next?.start !== token?.start ||
      next?.end !== token?.end ||
      next?.query !== token?.query;
    setToken(changed ? next : token);
    setDismissed(false);
    if (changed) {
      setLoading(Boolean(next));
      setUnavailable(false);
      setSelectionTooLong(false);
      setSuggestions([]);
      setActiveIndex(-1);
    }
  }

  function refreshFromInput(event: SyntheticEvent<HTMLTextAreaElement>) {
    const input = event.currentTarget;
    refreshToken(input.value, input.selectionStart);
  }

  function choose(suggestion: CommentMentionSuggestion) {
    if (!token) return;
    const next = insertMention(value, token, suggestion.household.handle);
    if (next.value.length > 500) {
      setLoading(false);
      setSelectionTooLong(true);
      return;
    }
    onChange(next.value);
    setToken(null);
    setDismissed(false);
    setSuggestions([]);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(next.caret, next.caret);
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (open && event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => Math.min(suggestions.length - 1, index + 1));
      return;
    }
    if (open && event.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
      return;
    }
    if (open && event.key === "Enter" && activeIndex >= 0 && suggestions[activeIndex]) {
      event.preventDefault();
      choose(suggestions[activeIndex]);
      return;
    }
    if (open && event.key === "Escape") {
      event.preventDefault();
      setDismissed(true);
      setLoading(false);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      onSubmit();
    }
  }

  const activeId =
    open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;

  return (
    <div className="relative">
      <textarea
        aria-activedescendant={activeId}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-describedby="comment-help comment-error comment-mention-status"
        aria-expanded={open}
        aria-invalid={hasError}
        className="mt-2 min-h-28 w-full resize-y rounded-2xl border border-pet-border bg-white px-3 py-3 text-base font-semibold text-pet-ink outline-none focus:border-pet-teal"
        disabled={disabled}
        id="comment-body"
        maxLength={500}
        onChange={(event) => {
          onChange(event.target.value);
          refreshToken(event.target.value, event.target.selectionStart);
        }}
        onClick={refreshFromInput}
        onKeyDown={onKeyDown}
        onKeyUp={(event) => {
          if (!["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key)) {
            refreshFromInput(event);
          }
        }}
        onSelect={refreshFromInput}
        ref={inputRef}
        role="combobox"
        value={value}
      />

      {open ? (
        <div className="absolute bottom-full z-30 mb-1 w-full overflow-hidden rounded-2xl border border-pet-border bg-white shadow-lg">
          <ul
            aria-label="Households to mention"
            className="max-h-56 overflow-y-auto p-1"
            id={listboxId}
            role="listbox"
          >
            {suggestions.map((suggestion, index) => (
              <li
                aria-selected={index === activeIndex}
                className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 ${
                  index === activeIndex ? "bg-pet-cream" : ""
                }`}
                id={`${listboxId}-option-${index}`}
                key={suggestion.household.handle}
                onClick={() => choose(suggestion)}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                role="option"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-pet-border bg-pet-cream">
                  {suggestion.household.avatarThumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt=""
                      className="h-full w-full object-cover"
                      src={suggestion.household.avatarThumbnailUrl}
                    />
                  ) : (
                    <Icon
                      aria-hidden="true"
                      className="h-4 w-4 text-pet-muted"
                      name="users"
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black text-pet-ink">
                    {suggestion.household.displayName}
                  </span>
                  <span className="block truncate text-xs font-bold text-pet-muted">
                    @{suggestion.household.handle}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] font-black uppercase tracking-wide text-pet-teal">
                  {contextLabel(suggestion.context)}
                </span>
              </li>
            ))}
          </ul>
          <p
            aria-live="polite"
            className="px-3 py-2 text-xs font-semibold text-pet-muted"
            id="comment-mention-status"
          >
            {selectionTooLong
              ? "Shorten your comment to add this mention."
              : loading
                ? "Searching…"
                : unavailable
                  ? "Suggestions unavailable right now."
                  : suggestions.length === 0
                    ? "No matching households."
                    : `${suggestions.length} ${suggestions.length === 1 ? "household" : "households"} found.`}
          </p>
        </div>
      ) : (
        <span className="sr-only" id="comment-mention-status" />
      )}
    </div>
  );
}

function contextLabel(context: CommentMentionSuggestionContext) {
  switch (context) {
    case "author":
      return "Author";
    case "collaborator":
      return "Collaborator";
    case "commenter":
      return "Commenter";
    case "following":
      return "Following";
    case "discoverable":
      return "Community";
  }
}
