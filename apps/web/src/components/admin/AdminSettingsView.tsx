import {
  AdminDetailItem,
  AdminNotice,
  AdminSection,
} from "@/components/admin/AdminPanels";
import { paymentConfig } from "@/config/payment";
import { siteConfig } from "@/config/site";
import { gpsSafety, premiumPlan, smartTagAddOns } from "@/lib/planLimits";

// Read-only operations settings overview. Editing these values arrives with a
// later update; today they are managed in the product configuration.
export function AdminSettingsView() {
  return (
    <div className="grid gap-4">
      <AdminNotice>
        These settings are read-only in this early launch phase. Editable
        operations settings are coming later.
      </AdminNotice>

      <AdminSection
        title="Order settings"
        description="How tag orders are processed today."
      >
        <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <AdminDetailItem label="Payment mode" value="Manual payment proof review" />
          <AdminDetailItem label="Delivery fee" value={paymentConfig.deliveryFee} />
          <AdminDetailItem
            label="Merchant QR"
            value={paymentConfig.merchantQrLabel}
          />
        </div>
      </AdminSection>

      <AdminSection
        title="Payment proof instructions"
        description="What owners see during checkout."
      >
        <div className="grid gap-2 p-4">
          <AdminDetailItem label="Instructions" value={paymentConfig.instructions} />
          <AdminDetailItem label="Support note" value={paymentConfig.supportText} />
        </div>
      </AdminSection>

      <AdminSection
        title="Tag product pricing"
        description="Smart tags are optional one-time add-ons."
      >
        <div className="grid gap-2 p-4 sm:grid-cols-2">
          {smartTagAddOns.map((addOn) => (
            <AdminDetailItem
              key={addOn.type}
              label={addOn.name}
              value={`${addOn.price} (${addOn.billingNote})`}
            />
          ))}
        </div>
      </AdminSection>

      <AdminSection
        title="Feature availability"
        description="Current phase feature flags."
      >
        <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <AdminDetailItem label="Free Profile" value="Available now" />
          <AdminDetailItem label={premiumPlan.name} value={premiumPlan.status} />
          <AdminDetailItem label={gpsSafety.name} value={gpsSafety.status} />
        </div>
      </AdminSection>

      <AdminSection
        title="Support contact"
        description="Shown on receipts and support pages."
      >
        <div className="grid gap-2 p-4 sm:grid-cols-2">
          <AdminDetailItem label="Support email" value={siteConfig.supportEmail} />
          <AdminDetailItem label="Website" value={siteConfig.url} />
        </div>
      </AdminSection>

      <AdminSection
        title="Legal / company info"
        description="Registered business details."
      >
        <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <AdminDetailItem label="Company" value={siteConfig.companyName} />
          <AdminDetailItem
            label="Business Registration No."
            value={siteConfig.businessRegistrationNo}
          />
          <AdminDetailItem label="Country" value={siteConfig.country} />
        </div>
      </AdminSection>
    </div>
  );
}
