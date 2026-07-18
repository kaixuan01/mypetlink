import { describe, expect, it } from "vitest";
import { defaultOwnerSettings, type OwnerSettings } from "@/lib/ownerSettings";
import {
  getSafetyProfileStatus,
  getSafetyProfileStatusView,
  hasUsableSafetyContact,
  type SafetyProfilePetInput,
} from "@/lib/safetyProfile";

function pet(overrides: Partial<SafetyProfilePetInput> = {}): SafetyProfilePetInput {
  return {
    lifecycleStatus: "Active",
    qrSafetyEnabled: true,
    visibility: { showPhone: false, showWhatsapp: false },
    owner: { phone: "", whatsapp: "" },
    ...overrides,
  };
}

function ownerSettings(overrides: Partial<OwnerSettings> = {}): OwnerSettings {
  return {
    ...defaultOwnerSettings,
    phoneNumber: "",
    whatsappNumber: "",
    ...overrides,
  };
}

describe("getSafetyProfileStatus", () => {
  it("is active when WhatsApp display is on and a valid number exists", () => {
    expect(
      getSafetyProfileStatus(
        pet({
          visibility: { showPhone: false, showWhatsapp: true },
          owner: { phone: "", whatsapp: "+60123456789" },
        })
      )
    ).toBe("active");
  });

  it("is active when phone call display is on and a valid number exists", () => {
    expect(
      getSafetyProfileStatus(
        pet({
          visibility: { showPhone: true, showWhatsapp: false },
          owner: { phone: "+60129998888", whatsapp: "" },
        })
      )
    ).toBe("active");
  });

  it("is active when both visible methods hold valid numbers", () => {
    expect(
      getSafetyProfileStatus(
        pet({
          visibility: { showPhone: true, showWhatsapp: true },
          owner: { phone: "+60129998888", whatsapp: "+60123456789" },
        })
      )
    ).toBe("active");
  });

  it("needs a contact update when enabled but no visible usable contact exists", () => {
    // A number without display, and display without a number, both fail.
    expect(
      getSafetyProfileStatus(
        pet({
          visibility: { showPhone: false, showWhatsapp: false },
          owner: { phone: "+60129998888", whatsapp: "+60123456789" },
        })
      )
    ).toBe("contact-update-needed");
    expect(
      getSafetyProfileStatus(
        pet({
          visibility: { showPhone: true, showWhatsapp: true },
          owner: { phone: "", whatsapp: "" },
        })
      )
    ).toBe("contact-update-needed");
  });

  it("is off when the owner disabled public access, regardless of contact", () => {
    expect(
      getSafetyProfileStatus(
        pet({
          qrSafetyEnabled: false,
          visibility: { showPhone: true, showWhatsapp: true },
          owner: { phone: "+60129998888", whatsapp: "+60123456789" },
        })
      )
    ).toBe("off");
  });

  it("prefers the server-computed readiness flag when present", () => {
    expect(
      getSafetyProfileStatus(pet({ hasUsableSafetyContact: true }))
    ).toBe("active");
    expect(
      getSafetyProfileStatus(
        pet({
          hasUsableSafetyContact: false,
          visibility: { showPhone: true, showWhatsapp: true },
          owner: { phone: "+60129998888", whatsapp: "+60123456789" },
        })
      )
    ).toBe("contact-update-needed");
  });

  it("rejects empty, placeholder, and invalid numbers", () => {
    for (const junk of ["", "   ", " - ", "+60", "0123", "not a number"]) {
      expect(
        hasUsableSafetyContact(
          pet({
            visibility: { showPhone: true, showWhatsapp: true },
            owner: { phone: junk, whatsapp: junk },
          })
        )
      ).toBe(false);
    }
  });
});

describe("contact source resolution", () => {
  const visibility = { showPhone: false, showWhatsapp: true };

  it("a pet on owner defaults follows the live owner contact", () => {
    const defaultsPet = pet({
      visibility,
      owner: { phone: "", whatsapp: "" },
      contactOverride: { useOwnerDefaults: true },
    });

    // No owner number yet: contact update needed.
    expect(
      getSafetyProfileStatus(defaultsPet, ownerSettings())
    ).toBe("contact-update-needed");

    // The owner saves a WhatsApp number once; every pet on defaults becomes
    // active without re-saving the pet.
    expect(
      getSafetyProfileStatus(
        defaultsPet,
        ownerSettings({ whatsappNumber: "+60123456789" })
      )
    ).toBe("active");
  });

  it("a pet with its own contact ignores owner defaults", () => {
    const customPet = pet({
      visibility,
      owner: { phone: "", whatsapp: "" },
      contactOverride: { useOwnerDefaults: false, whatsappNumber: "" },
    });

    // An owner-level number must not make a custom-contact pet active.
    expect(
      getSafetyProfileStatus(
        customPet,
        ownerSettings({ whatsappNumber: "+60123456789" })
      )
    ).toBe("contact-update-needed");

    // Its own number does.
    expect(
      getSafetyProfileStatus(
        pet({
          visibility,
          owner: { phone: "", whatsapp: "" },
          contactOverride: {
            useOwnerDefaults: false,
            whatsappNumber: "+60111222333",
          },
        }),
        ownerSettings()
      )
    ).toBe("active");
  });

  it("switching back to owner defaults recalculates immediately", () => {
    const settings = ownerSettings({ whatsappNumber: "+60123456789" });
    const base = {
      visibility,
      owner: { phone: "", whatsapp: "" },
    };

    expect(
      getSafetyProfileStatus(
        pet({
          ...base,
          contactOverride: { useOwnerDefaults: false, whatsappNumber: "" },
        }),
        settings
      )
    ).toBe("contact-update-needed");
    expect(
      getSafetyProfileStatus(
        pet({ ...base, contactOverride: { useOwnerDefaults: true } }),
        settings
      )
    ).toBe("active");
  });
});

describe("getSafetyProfileStatusView", () => {
  it("uses the three product status labels", () => {
    expect(
      getSafetyProfileStatusView(pet({ hasUsableSafetyContact: true })).label
    ).toBe("Safety Profile Active");
    expect(getSafetyProfileStatusView(pet()).label).toBe(
      "Contact Update Needed"
    );
    expect(
      getSafetyProfileStatusView(pet({ qrSafetyEnabled: false })).label
    ).toBe("Safety Profile Off");
  });

  it("never uses retired or tag-referencing labels", () => {
    const views = [
      getSafetyProfileStatusView(pet({ hasUsableSafetyContact: true })),
      getSafetyProfileStatusView(pet()),
      getSafetyProfileStatusView(pet({ qrSafetyEnabled: false })),
    ];

    for (const view of views) {
      expect(view.label.toLowerCase()).not.toContain("tag");
      expect(view.label).not.toMatch(/QR/);
      expect(view.label).not.toMatch(/^Ready$/i);
      expect(view.label).not.toMatch(/Pending Update/i);
      expect(view.label).not.toMatch(/Setup Needed/i);
    }
  });

  it("gives memorial and archived lifecycles their own labels", () => {
    expect(
      getSafetyProfileStatusView(pet({ lifecycleStatus: "Memorial" })).label
    ).toBe("Memorial Profile");
    expect(
      getSafetyProfileStatusView(pet({ lifecycleStatus: "Archived" })).label
    ).toBe("Archived Profile");
  });
});
