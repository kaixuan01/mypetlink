namespace MyPetLink.Api.DTOs;

/// <summary>
/// A pet as Explore and search show it.
///
/// Pet-first by design: the pet is what somebody is looking at, and the
/// household underneath is who the Follow button actually acts on. Both are
/// present so the control can never be ambiguous about its target.
///
/// There is no follower count on a pet, here or anywhere. Pets are the subject
/// of content, not actors in the graph, and a number beside a pet's name is the
/// fastest way to imply otherwise.
/// </summary>
public sealed record SocialPetCardResponse(
    string Name,
    string Species,
    string? CustomSpecies,
    string? Breed,
    string PublicSlug,
    string? PhotoThumbnailUrl,
    bool LostModeEnabled,

    /// <summary>The household that shares this pet — the Follow target.</summary>
    PublicOwnerAttributionResponse Owner,

    /// <summary>Whether the viewer already follows that household.</summary>
    bool ViewerFollowsOwner);

public sealed record SocialPetPageResponse(
    IReadOnlyCollection<SocialPetCardResponse> Items,
    string? NextCursor);

/// <summary>
/// One species a visitor can filter Explore by, with the count that justifies
/// showing it. Derived from the pets that are actually discoverable — never a
/// hardcoded list, because the product has always supported more than cats and
/// dogs.
/// </summary>
public sealed record SocialSpeciesOptionResponse(
    string Species,
    string Label,
    int PetCount);

/// <summary>
/// A household as search shows it. The social identity only: a handle, a chosen
/// display name, an avatar. Never an account name, an email, or the name a
/// finder would see.
/// </summary>
public sealed record SocialOwnerCardResponse(
    string Handle,
    string DisplayName,
    string? AvatarThumbnailUrl,
    string? GeneralArea,
    bool ViewerFollows,
    bool IsSelf);

/// <summary>
/// What a search found.
///
/// Both sides are always present so the UI can show its two tabs with honest
/// counts without a second request; a caller that wants only one asks for it
/// with <c>type</c> and gets an empty list for the other.
/// </summary>
public sealed record SocialSearchResponse(
    string Query,
    IReadOnlyCollection<SocialPetCardResponse> Pets,
    IReadOnlyCollection<SocialOwnerCardResponse> Owners);
