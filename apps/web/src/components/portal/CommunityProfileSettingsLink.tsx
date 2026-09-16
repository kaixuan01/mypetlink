import Link from "next/link";
import { FormSection } from "@/components/ui/FormSection";
import { Icon } from "@/components/ui/Icon";
import { ownerRoutes } from "@/lib/routes";

/**
 * Owner Settings' pointer to the Community profile editor.
 *
 * A link, not a second copy of the form. The whole social identity — photo,
 * handle, display name, bio, area, the social switches and each pet's
 * participation — is edited in one place, and this is the signpost for somebody
 * who went looking for it here because it used to live here.
 */
export function CommunityProfileSettingsLink() {
  return (
    <FormSection
      id="social-profile"
      title="Community & Social"
      description="Manage how your profile and pets appear in the MyPetLink community."
    >
      <Link
        className="inline-flex min-h-12 items-center gap-2 rounded-full border border-pet-border bg-white px-5 text-sm font-bold text-pet-ink transition hover:bg-pet-cream"
        href={ownerRoutes.socialProfileEdit}
      >
        Manage Social Profile
        <Icon aria-hidden="true" className="h-4 w-4" name="chevron" />
      </Link>
    </FormSection>
  );
}
