"use client";

import { useEffect, useState } from "react";
import { SocialProfileSettings } from "@/components/portal/SocialProfileSettings";
import { getPets } from "@/services/petService";

/**
 * Loads the owner's pet names so the settings form can offer a friendly
 * starting point for a handle and a display name.
 *
 * The names are only ever used as SUGGESTIONS the owner can ignore. Nothing here
 * writes a value, and nothing derives a suggestion from the account name or the
 * email — a person's pets are a safe thing to name yourself after; a person's
 * real name is not.
 */
export function SocialProfileSettingsSection() {
  const [petNames, setPetNames] = useState<string[]>([]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await getPets();
        if (!active) return;
        setPetNames(response.data.map((pet) => pet.name).filter(Boolean));
      } catch {
        // Suggestions are a convenience. Losing them is not worth an error
        // message on a settings page.
        if (active) setPetNames([]);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  return <SocialProfileSettings petNames={petNames} />;
}
