using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Services;

/// <summary>
/// Explore and search — the two places somebody meets a pet they were not
/// already following.
///
/// <b>Discoverability is the whole difference between this and the feed.</b>
/// Both start from the same social visibility rules; this adds one more
/// consent on top. A household with <c>IsDiscoverable = false</c> is still a
/// real social profile, still reachable at its link, and still visible to the
/// people who follow it — it has simply said "do not put me in front of
/// strangers". Nothing here may override that, and nothing in the feed may
/// enforce it.
///
/// Neither surface is personalised. The label says "Suggested pets", not "For
/// you", because the ordering knows nothing about the person reading it beyond
/// which pets to leave out.
/// </summary>
public sealed class SocialDiscoveryService : SkeletonService, ISocialDiscoveryService
{
    /// <summary>Two characters. One letter matches most of the database.</summary>
    public const int MinimumSearchLength = 2;

    /// <summary>Longer than any handle, display name or pet name we store.</summary>
    public const int MaximumSearchLength = 120;

    private const int DefaultSuggestionCount = 12;
    private const int MaximumSuggestionCount = 24;
    private const int DefaultSearchResults = 10;
    private const int MaximumSearchResults = 25;

    private readonly MyPetLinkDbContext _dbContext;
    private readonly CloudflareR2Options _r2Options;
    private readonly SocialMomentProjection _momentCards;

    public SocialDiscoveryService(
        MyPetLinkDbContext dbContext,
        IOptions<CloudflareR2Options> r2Options,
        SocialMomentProjection momentCards)
    {
        _dbContext = dbContext;
        _r2Options = r2Options.Value;
        _momentCards = momentCards;
    }

    /// <summary>
    /// Pets worth meeting.
    ///
    /// One bounded shelf rather than an endless list: Explore's job is to get
    /// somebody their first few follows, and a suggestion list that never ends
    /// is a ranking product, which this deliberately is not. Latest Moments
    /// below it is the part that pages.
    ///
    /// Ordered by when each pet last shared something, then by how recently the
    /// pet was added, then by id — fully deterministic, so the same visitor
    /// sees a stable shelf rather than a reshuffle on every load. Explicitly not
    /// <c>NEWID()</c>: random ordering on a growing public table sorts the whole
    /// candidate set on every request.
    /// </summary>
    public async Task<SocialPetPageResponse> GetSuggestedPetsAsync(
        Guid? viewerId,
        string? species,
        int? limit,
        CancellationToken cancellationToken = default)
    {
        var take = Math.Clamp(
            limit ?? DefaultSuggestionCount,
            1,
            MaximumSuggestionCount);

        // A photo is a preference, not a requirement. Excluding photoless pets
        // would empty Explore on a young product and punish the owner who has
        // not uploaded one yet; they simply sort below the pets who have.
        var candidates = ApplySpecies(DiscoverablePets(viewerId), species);

        if (viewerId.HasValue)
        {
            var actorId = viewerId.Value;

            // Somebody you already follow is not a suggestion, and neither is
            // your own pet — Explore exists to widen a circle, not restate it.
            candidates = candidates.Where(pet =>
                !_dbContext.OwnerFollows.Any(follow =>
                    follow.FollowerUserId == actorId
                    && follow.FollowedUserId == pet.OwnerUserId));
        }

        var rows = await candidates
            .Select(pet => new
            {
                Pet = pet,
                // A correlated MAX over the pet's membership rows, which seeks
                // IX_MomentPets_PetId_MomentId. Cheap while the candidate set is
                // a soft-launch one; revisit with a maintained
                // LastPublicMomentAt column if the candidate set grows past a
                // few thousand pets.
                LastMomentAt = _dbContext.MomentPets
                    .Where(subject =>
                        subject.PetId == pet.Id
                        && subject.Moment.Visibility == MemoryVisibility.Public
                        && subject.Moment.DeletedAt == null
                        && subject.Moment.ArchivedAt == null)
                    .Max(subject => (DateTimeOffset?)subject.Moment.PublishedAt)
            })
            .OrderByDescending(row => row.Pet.ProfileMediaFileId != null)
            .ThenByDescending(row => row.LastMomentAt != null)
            .ThenByDescending(row => row.LastMomentAt)
            .ThenByDescending(row => row.Pet.CreatedAt)
            .ThenByDescending(row => row.Pet.Id)
            .Take(take)
            .Select(row => new
            {
                row.Pet.Id,
                row.Pet.Name,
                row.Pet.Species,
                row.Pet.CustomSpecies,
                row.Pet.Breed,
                row.Pet.Slug,
                row.Pet.LostModeEnabled,
                row.Pet.OwnerUserId,
                Photo = row.Pet.ProfileMediaFile,
                OwnerHandle = row.Pet.OwnerUser.SocialProfile!.Handle!,
                OwnerDisplayName = row.Pet.OwnerUser.SocialProfile.DisplayName!,
                OwnerAvatar = row.Pet.OwnerUser.SocialProfile.AvatarMediaFile
            })
            .ToListAsync(cancellationToken);

        var followed = await FollowedOwnerIdsAsync(
            viewerId,
            rows.Select(row => row.OwnerUserId),
            cancellationToken);

        return new SocialPetPageResponse(
            rows
                .Select(row => new SocialPetCardResponse(
                    row.Name,
                    row.Species,
                    row.CustomSpecies,
                    row.Breed,
                    row.Slug,
                    MediaDerivatives.ResolveThumbnailUrl(row.Photo, _r2Options.PublicBaseUrl),
                    row.LostModeEnabled,
                    new PublicOwnerAttributionResponse(
                        row.OwnerHandle,
                        row.OwnerDisplayName,
                        MediaDerivatives.ResolveOriginalUrl(row.OwnerAvatar, _r2Options.PublicBaseUrl),
                        MediaDerivatives.ResolveThumbnailUrl(row.OwnerAvatar, _r2Options.PublicBaseUrl)),
                    followed.Contains(row.OwnerUserId)))
                .ToArray(),
            // A shelf, not a listing. There is deliberately nothing after it.
            NextCursor: null);
    }

    /// <summary>
    /// The newest public Moments from pets a stranger is allowed to meet.
    ///
    /// Same card projection as every other social listing, same cursor rules.
    /// Only the selection differs: discoverable pets, rather than followed
    /// households.
    /// </summary>
    public Task<PublicMomentPageResponse> GetLatestMomentsAsync(
        Guid? viewerId,
        string? species,
        string? cursor,
        int? pageSize,
        CancellationToken cancellationToken = default)
    {
        var discoverablePets = ApplySpecies(DiscoverablePets(viewerId), species)
            .Select(pet => pet.Id);

        var query = _dbContext.PetMemories
            .SociallyVisible()
            .Where(moment =>
                // The Moment's own pet, or any pet it is about, must itself be
                // discoverable. A Moment reaches Explore through a pet, never
                // through its author alone.
                discoverablePets.Contains(moment.PetId)
                || moment.MomentPets.Any(subject =>
                    discoverablePets.Contains(subject.PetId)));

        if (viewerId.HasValue)
        {
            var blocked = SocialBlocks.BlockedAccountIds(_dbContext, viewerId.Value);
            query = query.Where(moment => !blocked.Contains(moment.AuthorUserId));
        }

        return _momentCards.PageAsync(query, cursor, pageSize, viewerId, cancellationToken);
    }

    /// <summary>
    /// The species actually present in discoverable pets, with counts.
    ///
    /// Read from the data rather than from a hardcoded Dog/Cat pair: the
    /// product has supported rabbits, birds and everything else since long
    /// before social, and a filter that pretends otherwise makes those owners
    /// invisible.
    /// </summary>
    public async Task<IReadOnlyCollection<SocialSpeciesOptionResponse>> GetSpeciesAsync(
        Guid? viewerId,
        CancellationToken cancellationToken = default)
    {
        var rows = await DiscoverablePets(viewerId)
            .GroupBy(pet => pet.Species)
            .Select(group => new { Species = group.Key, Count = group.Count() })
            .ToListAsync(cancellationToken);

        return rows
            .Where(row => !string.IsNullOrWhiteSpace(row.Species))
            .OrderByDescending(row => row.Count)
            .ThenBy(row => row.Species, StringComparer.OrdinalIgnoreCase)
            .Select(row => new SocialSpeciesOptionResponse(
                row.Species,
                PluraliseSpecies(row.Species),
                row.Count))
            .ToArray();
    }

    /// <summary>
    /// Search, over exactly two things: pet names, and households' social
    /// identities.
    ///
    /// <b>What is deliberately not searchable.</b> No account name, no email, no
    /// phone number, no finder-facing owner name, no safety code, no tag code,
    /// no public code, no internal id. A code-lookup that happened to live in a
    /// search box would turn a discovery feature into a way to enumerate pets
    /// and reach their owners' contact details; the codes have their own routes
    /// and their own gating, and this is not one of them.
    ///
    /// Matching is a prefix, never a contains. <c>LIKE 'moch%'</c> can seek an
    /// index; <c>LIKE '%moch%'</c> reads the whole table, and on a public
    /// endpoint that is a denial-of-service waiting to be discovered.
    /// </summary>
    public async Task<SocialSearchResponse> SearchAsync(
        Guid? viewerId,
        string? query,
        string? type,
        string? species,
        int? limit,
        CancellationToken cancellationToken = default)
    {
        var term = (query ?? "").Trim();

        if (term.Length > MaximumSearchLength)
        {
            term = term[..MaximumSearchLength];
        }

        if (term.Length < MinimumSearchLength)
        {
            // Not an error: an empty or one-character box is a person still
            // typing, not a bad request.
            return new SocialSearchResponse(
                term,
                Array.Empty<SocialPetCardResponse>(),
                Array.Empty<SocialOwnerCardResponse>());
        }

        var take = Math.Clamp(limit ?? DefaultSearchResults, 1, MaximumSearchResults);
        var wantsPets = type is null or "all" or "pets";
        var wantsOwners = type is null or "all" or "owners";

        var pets = wantsPets
            ? await SearchPetsAsync(viewerId, term, species, take, cancellationToken)
            : Array.Empty<SocialPetCardResponse>();

        var owners = wantsOwners
            ? await SearchOwnersAsync(viewerId, term, take, cancellationToken)
            : Array.Empty<SocialOwnerCardResponse>();

        return new SocialSearchResponse(term, pets, owners);
    }

    private async Task<SocialPetCardResponse[]> SearchPetsAsync(
        Guid? viewerId,
        string term,
        string? species,
        int take,
        CancellationToken cancellationToken)
    {
        var prefix = LikePrefix(term);

        var candidates = ApplySpecies(DiscoverablePets(viewerId), species)
            .Where(pet => EF.Functions.Like(pet.Name, prefix));

        var rows = await candidates
            .OrderBy(pet => pet.Name)
            .ThenBy(pet => pet.Id)
            .Take(take)
            .Select(pet => new
            {
                pet.Name,
                pet.Species,
                pet.CustomSpecies,
                pet.Breed,
                pet.Slug,
                pet.LostModeEnabled,
                pet.OwnerUserId,
                Photo = pet.ProfileMediaFile,
                OwnerHandle = pet.OwnerUser.SocialProfile!.Handle!,
                OwnerDisplayName = pet.OwnerUser.SocialProfile.DisplayName!,
                OwnerAvatar = pet.OwnerUser.SocialProfile.AvatarMediaFile
            })
            .ToListAsync(cancellationToken);

        var followed = await FollowedOwnerIdsAsync(
            viewerId,
            rows.Select(row => row.OwnerUserId),
            cancellationToken);

        return rows
            .Select(row => new SocialPetCardResponse(
                row.Name,
                row.Species,
                row.CustomSpecies,
                row.Breed,
                row.Slug,
                MediaDerivatives.ResolveThumbnailUrl(row.Photo, _r2Options.PublicBaseUrl),
                row.LostModeEnabled,
                new PublicOwnerAttributionResponse(
                    row.OwnerHandle,
                    row.OwnerDisplayName,
                    MediaDerivatives.ResolveOriginalUrl(row.OwnerAvatar, _r2Options.PublicBaseUrl),
                    MediaDerivatives.ResolveThumbnailUrl(row.OwnerAvatar, _r2Options.PublicBaseUrl)),
                followed.Contains(row.OwnerUserId)))
            .ToArray();
    }

    /// <summary>
    /// Households by handle or by social display name.
    ///
    /// Run as two prefix queries rather than one <c>OR</c>: each can seek its
    /// own index (<c>IX_OwnerSocialProfiles_NormalizedHandle</c> and
    /// <c>IX_OwnerSocialProfiles_NormalizedDisplayName</c>), where an OR across
    /// both tends to give up and scan. Both read the NORMALIZED columns, which
    /// is why casing in the search box never matters.
    /// </summary>
    private async Task<SocialOwnerCardResponse[]> SearchOwnersAsync(
        Guid? viewerId,
        string term,
        int take,
        CancellationToken cancellationToken)
    {
        var prefix = LikePrefix(term.ToLowerInvariant());

        var byHandle = await DiscoverableOwners(viewerId)
            .Where(profile => EF.Functions.Like(profile.NormalizedHandle!, prefix))
            .OrderBy(profile => profile.NormalizedHandle)
            .Take(take)
            .Select(OwnerRow())
            .ToListAsync(cancellationToken);

        var byName = await DiscoverableOwners(viewerId)
            .Where(profile => EF.Functions.Like(profile.NormalizedDisplayName!, prefix))
            .OrderBy(profile => profile.NormalizedDisplayName)
            .Take(take)
            .Select(OwnerRow())
            .ToListAsync(cancellationToken);

        var merged = byHandle
            .Concat(byName)
            .GroupBy(row => row.UserId)
            .Select(group => group.First())
            .OrderBy(row => row.Handle, StringComparer.OrdinalIgnoreCase)
            .Take(take)
            .ToList();

        var followed = await FollowedOwnerIdsAsync(
            viewerId,
            merged.Select(row => row.UserId),
            cancellationToken);

        return merged
            .Select(row => new SocialOwnerCardResponse(
                row.Handle,
                row.DisplayName,
                MediaDerivatives.ResolveThumbnailUrl(row.Avatar, _r2Options.PublicBaseUrl),
                row.GeneralArea,
                followed.Contains(row.UserId),
                viewerId.HasValue && viewerId.Value == row.UserId))
            .ToArray();
    }

    private static System.Linq.Expressions.Expression<
        Func<OwnerSocialProfile, OwnerSearchRow>> OwnerRow()
    {
        return profile => new OwnerSearchRow(
            profile.UserId,
            profile.Handle!,
            profile.DisplayName!,
            profile.GeneralArea,
            profile.AvatarMediaFile);
    }

    private sealed record OwnerSearchRow(
        Guid UserId,
        string Handle,
        string DisplayName,
        string? GeneralArea,
        MediaFile? Avatar);

    /// <summary>
    /// Pets a stranger may be shown: socially visible, plus the pet's own and
    /// its household's discoverability, minus the viewer's own pets and anyone
    /// either side of a block.
    /// </summary>
    private IQueryable<Pet> DiscoverablePets(Guid? viewerId)
    {
        var pets = _dbContext.Pets
            .SociallyVisible()
            .Where(pet =>
                pet.SocialProfile!.IsDiscoverable
                && pet.OwnerUser.SocialProfile!.IsDiscoverable
                && pet.OwnerUser.SocialProfile.Handle != null
                && pet.OwnerUser.SocialProfile.DisplayName != null);

        if (!viewerId.HasValue)
        {
            return pets;
        }

        var actorId = viewerId.Value;
        var blocked = SocialBlocks.BlockedAccountIds(_dbContext, actorId);

        return pets.Where(pet =>
            pet.OwnerUserId != actorId && !blocked.Contains(pet.OwnerUserId));
    }

    private IQueryable<OwnerSocialProfile> DiscoverableOwners(Guid? viewerId)
    {
        var profiles = _dbContext.OwnerSocialProfiles
            .AsNoTracking()
            .Where(profile =>
                profile.IsSocialEnabled
                && profile.IsDiscoverable
                && profile.Handle != null
                && profile.DisplayName != null
                && profile.User.DeletedAt == null
                && profile.User.Status == UserStatus.Active);

        if (!viewerId.HasValue)
        {
            return profiles;
        }

        var blocked = SocialBlocks.BlockedAccountIds(_dbContext, viewerId.Value);
        return profiles.Where(profile => !blocked.Contains(profile.UserId));
    }

    private static IQueryable<Pet> ApplySpecies(IQueryable<Pet> pets, string? species)
    {
        var requested = (species ?? "").Trim();

        if (requested.Length == 0 || requested.Equals("all", StringComparison.OrdinalIgnoreCase))
        {
            return pets;
        }

        return pets.Where(pet => pet.Species == requested);
    }

    private async Task<HashSet<Guid>> FollowedOwnerIdsAsync(
        Guid? viewerId,
        IEnumerable<Guid> ownerIds,
        CancellationToken cancellationToken)
    {
        if (!viewerId.HasValue)
        {
            return new HashSet<Guid>();
        }

        var ids = ownerIds.Distinct().ToArray();

        if (ids.Length == 0)
        {
            return new HashSet<Guid>();
        }

        var actorId = viewerId.Value;
        var followed = await _dbContext.OwnerFollows
            .AsNoTracking()
            .Where(follow =>
                follow.FollowerUserId == actorId && ids.Contains(follow.FollowedUserId))
            .Select(follow => follow.FollowedUserId)
            .ToListAsync(cancellationToken);

        return followed.ToHashSet();
    }

    /// <summary>
    /// Builds a prefix pattern, escaping the characters LIKE treats as
    /// wildcards. Without this, a search for "%" matches every row.
    /// </summary>
    private static string LikePrefix(string term)
    {
        var escaped = term
            .Replace("[", "[[]", StringComparison.Ordinal)
            .Replace("%", "[%]", StringComparison.Ordinal)
            .Replace("_", "[_]", StringComparison.Ordinal);

        return $"{escaped}%";
    }

    /// <summary>
    /// A friendly plural for a filter chip. Falls back to the stored word so a
    /// species we have never seen still gets a usable label.
    /// </summary>
    private static string PluraliseSpecies(string species)
    {
        return species switch
        {
            "Dog" => "Dogs",
            "Cat" => "Cats",
            "Rabbit" => "Rabbits",
            "Bird" => "Birds",
            "Hamster" => "Hamsters",
            "Fish" => "Fish",
            "Reptile" => "Reptiles",
            "Other" => "Other pets",
            _ => species
        };
    }
}
