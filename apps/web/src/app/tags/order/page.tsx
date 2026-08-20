import type { Metadata } from "next";
import { AppLayout } from "@/components/layouts/AppLayout";
import { SmartTagOrderEntry } from "@/components/portal/SmartTagOrderEntry";
import {
  SmartTagsComingSoon,
  smartTagsUnavailablePageCopy,
} from "@/components/portal/SmartTagsComingSoon";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  smartTagOrderingEnabled,
  tagOrdersEnabled,
} from "@/lib/features";

export const metadata: Metadata = {
  title: "Order a Smart Tag",
};

export default function SmartTagOrderPage() {
  if (!tagOrdersEnabled || !smartTagOrderingEnabled) {
    return (
      <AppLayout>
        <PageHeader {...smartTagsUnavailablePageCopy} />
        <SmartTagsComingSoon />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Physical tags"
        title="Order a MyPetLink Smart Tag"
        description="Choose an active pet profile, then select the physical tag that fits them best."
      />
      <SmartTagOrderEntry />
    </AppLayout>
  );
}
