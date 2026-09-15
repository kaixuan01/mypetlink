"use client";

import { useEffect, useState } from "react";
import { FollowButton } from "@/components/social/FollowButton";
import { useSignedIn } from "@/lib/useSignedIn";
import {
  getOwnerRelationship,
  noRelationship,
  type OwnerRelationship,
} from "@/services/socialGraphService";

type OwnerFollowActionProps = {
  handle: string;
  displayName: string;
  surface?: "profile" | "attribution";
};

/**
 * A Follow control that fetches its own state.
 *
 * For surfaces that show a household in passing — the byline on a pet's public
 * page, for one — where the page has no reason to know about the social graph
 * and should not be made to carry it. Until the relationship arrives the button
 * renders nothing rather than a guess, so it never flips from Follow to
 * Following in front of the reader.
 */
export function OwnerFollowAction({
  handle,
  displayName,
  surface = "attribution",
}: OwnerFollowActionProps) {
  const [relationship, setRelationship] =
    useState<OwnerRelationship>(noRelationship);
  const signedIn = useSignedIn();

  useEffect(() => {
    let active = true;

    getOwnerRelationship(handle)
      .then((loaded) => {
        if (active) setRelationship(loaded);
      })
      .catch(() => {
        // A pet's page must not report a social failure. Showing no Follow
        // control is the correct outcome here.
        if (active) setRelationship(noRelationship);
      });

    return () => {
      active = false;
    };
  }, [handle, signedIn]);

  return (
    <FollowButton
      displayName={displayName}
      handle={handle}
      onChange={setRelationship}
      relationship={relationship}
      signedIn={signedIn}
      surface={surface}
    />
  );
}
