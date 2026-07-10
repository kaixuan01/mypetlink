namespace MyPetLink.Api.Common;

// Runtime feature toggles. Bound from the "Features" configuration section.
public sealed class FeatureOptions
{
    public const string SectionName = "Features";

    // Smart Tag ordering (owner creates a new tag order). Disabled by default
    // so the initial launch is free pet profiles only, before physical tags
    // are available from a manufacturer. Existing Smart Tag / Order / Payment
    // Proof / Admin / `/t` scan behaviour is unaffected; only creating a NEW
    // order is gated. Enable per-environment (Features:SmartTagOrderingEnabled)
    // to re-open ordering later.
    public bool SmartTagOrderingEnabled { get; init; }
}
