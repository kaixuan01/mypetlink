using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

/// <summary>
/// Central consent boundary for future promotional email recipient selection.
/// Essential transactional messages and Premium care reminders are deliberately
/// governed elsewhere and must never be inferred as marketing consent.
/// </summary>
public static class CommunicationPreferenceRules
{
    public static bool CanReceiveMarketingEmail(OwnerProfile ownerProfile)
        => ownerProfile.MarketingEmailOptIn;
}
