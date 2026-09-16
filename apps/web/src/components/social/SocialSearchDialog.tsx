"use client";

import { useRef } from "react";
import { SocialSearchExperience } from "@/components/social/SocialSearchExperience";
import { FormDialog } from "@/components/ui/FormDialog";

type SocialSearchDialogProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * Search, opened from Explore.
 *
 * Both presentations the product wants are already what `FormDialog` does: it
 * is `fixed inset-0` at full height on a phone and a centred panel from `sm`
 * up, and it sizes itself against `--owner-keyboard-inset`, which is the whole
 * difficulty with searching on a phone — the keyboard takes half the screen and
 * a half-height sheet would leave almost nothing for results. So this is a
 * wrapper, not a dialog: writing a second one would mean writing a second focus
 * trap, and the shared hook behind `FormDialog` already traps Tab, closes on
 * Escape, makes the page behind it inert and returns focus to the control that
 * opened it.
 *
 * `sm:max-w-2xl` is 672px — inside the 600–700px the design calls for, and one
 * of the sizes the repository's dialogs already use.
 *
 * Focus opens on the box rather than on Close, which is the dialog's usual
 * first stop: this dialog exists to be typed into, and landing on Close would
 * send the first keystroke nowhere and leave a phone keyboard down.
 *
 * The bottom navigation is not hidden by hand: the bar sits at `z-30` and this
 * sits above it, and the same hook marks it inert, so it is neither visible nor
 * reachable while search is open.
 */
export function SocialSearchDialog({ open, onClose }: SocialSearchDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <FormDialog
      initialFocusRef={inputRef}
      maxWidthClassName="sm:max-w-2xl"
      onRequestClose={onClose}
      open={open}
      title="Search MyPetLink"
    >
      <div className="h-full" data-testid="social-search-dialog">
        <SocialSearchExperience inputRef={inputRef} onNavigate={onClose} />
      </div>
    </FormDialog>
  );
}
