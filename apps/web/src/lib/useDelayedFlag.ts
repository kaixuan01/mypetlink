"use client";

import { useEffect, useState } from "react";

/**
 * True only once something has been true for long enough to be worth showing.
 *
 * A skeleton exists to reassure somebody that a slow thing is coming. When the
 * thing is fast, the skeleton is the opposite of reassuring: measured on the
 * Activity screen locally, it appeared for 38ms — about two frames — and then
 * gave way to "Nothing new yet". Two frames of grey blocks is not a loading
 * state, it is a flash.
 *
 * So the skeleton waits. Under the delay the screen holds neutral space and the
 * content simply arrives; over it, the skeleton appears and does its job. The
 * data is never held back — only the decision to draw a placeholder for it.
 */
export function useDelayedFlag(active: boolean, delayMs = 180) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    // Both transitions happen in a callback rather than in the effect body:
    // turning it on after the delay, and turning it off on cleanup when the
    // thing being waited for finishes.
    const timer = setTimeout(() => setShown(true), delayMs);

    return () => {
      clearTimeout(timer);
      setShown(false);
    };
  }, [active, delayMs]);

  return active && shown;
}
