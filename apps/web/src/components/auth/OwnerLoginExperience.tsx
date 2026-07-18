import { LoginPanel } from "@/components/auth/LoginPanel";
import { Badge } from "@/components/ui/Badge";
import { Icon, type IconName } from "@/components/ui/Icon";

const portalBenefits: Array<{
  icon: IconName;
  label: string;
}> = [
  { icon: "heart", label: "Share Public Profiles" },
  { icon: "record", label: "Manage care records" },
  { icon: "heart", label: "Save pet memories" },
  { icon: "tag", label: "Smart Tag add-ons — Coming Soon" },
];

export function OwnerLoginExperience() {
  return (
    <section
      className="brand-peach-section w-full max-w-full overflow-x-clip px-3 py-6 min-[361px]:px-4 sm:px-6 sm:py-9 lg:px-8 lg:py-12"
      style={{ maxWidth: "100%" }}
    >
      <div className="mx-auto grid w-full min-w-0 max-w-6xl gap-5 sm:gap-7 lg:grid-cols-[minmax(0,0.9fr)_minmax(22rem,1.1fr)] lg:grid-rows-[auto_auto] lg:items-start lg:gap-x-10 lg:gap-y-7">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1 lg:self-end">
          <Badge tone="warm">Pet owner portal</Badge>
          <h1 className="mt-3 text-3xl font-black leading-tight text-pet-ink sm:text-4xl lg:text-5xl">
            Welcome back
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-pet-muted sm:text-base sm:leading-7">
            Sign in to manage your pet profiles, care records, memories, and
            safety pages.
          </p>
        </div>

        <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
          <LoginPanel />
        </div>

        <section
          aria-labelledby="portal-benefits-title"
          className="min-w-0 lg:col-start-1 lg:row-start-2"
        >
          <h2
            className="text-sm font-black text-pet-ink sm:text-base"
            id="portal-benefits-title"
          >
            What you can manage
          </h2>
          <ul className="mt-3 grid min-w-0 gap-2 min-[380px]:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {portalBenefits.map((benefit) => (
              <li
                className="flex min-h-11 min-w-0 items-center gap-2.5 rounded-2xl border border-pet-border/80 bg-white/70 px-3 py-2.5 text-xs font-bold leading-5 text-pet-ink shadow-sm sm:text-sm"
                key={benefit.label}
              >
                <Icon
                  className="h-4 w-4 shrink-0 text-pet-teal"
                  name={benefit.icon}
                />
                <span className="min-w-0">{benefit.label}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}
