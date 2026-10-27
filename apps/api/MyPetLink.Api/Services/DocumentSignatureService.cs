using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

/// <summary>
/// An administrator's own signature on file. Every operation acts on the signed-in
/// administrator's signature and nobody else's: there is no way to name another account, so
/// one administrator can never register, view, replace, remove or apply someone else's.
/// </summary>
public sealed class DocumentSignatureService(MyPetLinkDbContext db, IAuditLogService audit, TimeProvider time)
{
    // Short enough that a signed Delivered By block still fits an ordinary one-page form.
    public const int MaxTextLength = 60;

    public async Task<DocumentSignatureStatusResponse> GetOwnAsync(Guid? actor, CancellationToken ct)
    {
        var admin = await RequireAdminAsync(db, actor, ct);
        return Status(await Active(admin).Select(Summary).SingleOrDefaultAsync(ct));
    }

    /// <summary>The image on file, for its owner's own preview. Never cached, never public.</summary>
    public async Task<byte[]> OwnImageAsync(Guid? actor, CancellationToken ct)
    {
        var admin = await RequireAdminAsync(db, actor, ct);
        return await Active(admin).Select(s => s.Image).SingleOrDefaultAsync(ct)
            ?? throw new ApiException(404, "signature_not_found", "You don’t have a signature on file.");
    }

    public async Task<DocumentSignatureStatusResponse> SaveOwnAsync(Guid? actor, SaveDocumentSignatureRequest r, CancellationToken ct)
    {
        var admin = await RequireAdminAsync(db, actor, ct);
        var name = Text(r.SignatoryName, "Enter the name to print beside your signature.");
        var position = Text(r.SignatoryPosition, "Enter your position, such as Director.");
        // Validated and redrawn before any lock is taken: a bad image never reaches the database.
        var image = string.IsNullOrWhiteSpace(r.ImageBase64) ? null
            : DocumentSignatureImage.Normalize(DocumentSignatureImage.Decode(r.ImageBase64), r.ContentType);
        await RunAsync(admin, async () => {
            var current = await db.DocumentSignatures.SingleOrDefaultAsync(s => s.SignatoryAdminUserId == admin && s.EndedAt == null, ct);
            if (current?.Id != r.CurrentSignatureId)
                throw new ApiException(409, "signature_changed", "Your signature was changed in another window. Reload to see the current one.");
            if (current is null && image is null)
                throw new ApiException(400, "signature_image_invalid", "Choose an image of your signature.");
            if (current is not null && image is null && current.SignatoryName == name && current.SignatoryPosition == position) return;
            var now = time.GetUtcNow();
            var saved = new DocumentSignature {
                SignatoryAdminUserId = admin, SignatoryName = name, SignatoryPosition = position,
                Image = image?.Png ?? current!.Image, ImageSha256 = image?.Sha256 ?? current!.ImageSha256,
                ImageWidth = image?.Width ?? current!.ImageWidth, ImageHeight = image?.Height ?? current!.ImageHeight, CreatedAt = now };
            if (current is not null)
            {
                Retire(current, DocumentSignatureEndReason.Replaced, admin, now);
                // The filtered unique index allows one signature on file, so the old one is retired first.
                await db.SaveChangesAsync(ct);
            }
            db.DocumentSignatures.Add(saved);
            audit.Append(admin, ActorType.Admin, "document-signature.saved", nameof(DocumentSignature), saved.Id,
                current is null ? null : new { signatureId = current.Id, current.SignatoryName, current.SignatoryPosition, sha256 = current.ImageSha256 },
                new { signatureId = saved.Id, saved.SignatoryName, saved.SignatoryPosition, sha256 = saved.ImageSha256,
                    width = saved.ImageWidth, height = saved.ImageHeight, imageReplaced = image is not null });
        }, ct);
        return await GetOwnAsync(actor, ct);
    }

    /// <summary>
    /// Takes your signature off file and erases its image. Documents you already signed keep the
    /// copy frozen inside them.
    /// </summary>
    public async Task<DocumentSignatureStatusResponse> RemoveOwnAsync(Guid? actor, RemoveDocumentSignatureRequest r, CancellationToken ct)
    {
        var admin = await RequireAdminAsync(db, actor, ct);
        await RunAsync(admin, async () => {
            var current = await db.DocumentSignatures.SingleOrDefaultAsync(s => s.SignatoryAdminUserId == admin && s.EndedAt == null, ct);
            if (current is null || current.Id != r.SignatureId)
                throw new ApiException(409, "signature_changed", "Your signature was changed in another window. Reload to see the current one.");
            Retire(current, DocumentSignatureEndReason.Removed, admin, time.GetUtcNow());
            audit.Append(admin, ActorType.Admin, "document-signature.removed", nameof(DocumentSignature), current.Id,
                new { signatureId = current.Id, current.SignatoryName, current.SignatoryPosition, sha256 = current.ImageSha256 }, null);
        }, ct);
        return await GetOwnAsync(actor, ct);
    }

    /// <summary>
    /// The signature an issuer has asked to apply, after checking every rule that makes applying
    /// it legitimate: they hold the signing capability right now, it is their own signature, and
    /// it is still the one on file. Any failure leaves the document unsigned and not issued.
    /// </summary>
    internal static async Task<DocumentSignature> RequireOwnForSigningAsync(MyPetLinkDbContext db, IAdminAccessResolver? access,
        Guid? actor, Guid admin, Guid signatureId, CancellationToken ct)
    {
        var snapshot = access is null ? AdminAccessSnapshot.None : await access.ResolveAsync(actor, ct);
        if (!snapshot.Has(AdminCapabilities.DocumentSignatureManage))
            throw new ApiException(403, "forbidden", "You don’t have permission to sign documents.");
        var signature = await db.DocumentSignatures.AsNoTracking().SingleOrDefaultAsync(s => s.Id == signatureId, ct);
        // Someone else's signature is answered exactly like one that doesn't exist.
        if (signature is null || signature.SignatoryAdminUserId != admin)
            throw new ApiException(403, "signature_not_yours", "You can only sign with your own signature.");
        if (signature.EndedAt is not null || signature.Image is null)
            throw new ApiException(409, "signature_changed", "Your signature was replaced or removed. Review the document again before signing.");
        return signature;
    }

    /// <summary>Serialises changes to one administrator's signature with anything signing with it.</summary>
    internal static Task LockAsync(MyPetLinkDbContext db, Guid admin, CancellationToken ct) => db.Database.IsSqlServer()
        ? SqlServerInventoryReservationLock.AcquireForTransactionAsync(db, [$"MyPetLink:DocumentSignature:{admin:N}"], ct)
        : Task.CompletedTask;

    internal static async Task<Guid> RequireAdminAsync(MyPetLinkDbContext db, Guid? actor, CancellationToken ct) =>
        await db.AdminUsers.AsNoTracking().Where(a => a.UserId == actor && a.IsActive && a.DisabledAt == null)
            .Select(a => (Guid?)a.Id).SingleOrDefaultAsync(ct)
        ?? throw new ApiException(actor is null ? 401 : 403, "forbidden", "Admin access is required.");

    private async Task RunAsync(Guid admin, Func<Task> operation, CancellationToken ct)
    {
        await db.Database.CreateExecutionStrategy().ExecuteAsync(async () => {
            db.ChangeTracker.Clear();
            await using var tx = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(ct) : null;
            await LockAsync(db, admin, ct);
            try
            {
                await operation();
                await db.SaveChangesAsync(ct);
                if (tx is not null) await tx.CommitAsync(ct);
            }
            // Only a second signature on file for the same administrator is a conflict; anything else is a real failure.
            catch (DbUpdateException e) when (e.InnerException is Microsoft.Data.SqlClient.SqlException { Number: 2601 or 2627 })
            {
                throw new ApiException(409, "signature_changed", "Your signature was changed in another window. Reload to see the current one.");
            }
        });
    }

    private static void Retire(DocumentSignature s, DocumentSignatureEndReason reason, Guid admin, DateTimeOffset at)
    {
        s.EndedAt = at;
        s.EndReason = reason;
        s.EndedByAdminUserId = admin;
        s.Image = null;
    }

    private IQueryable<DocumentSignature> Active(Guid admin) =>
        db.DocumentSignatures.AsNoTracking().Where(s => s.SignatoryAdminUserId == admin && s.EndedAt == null);

    private static readonly System.Linq.Expressions.Expression<Func<DocumentSignature, DocumentSignatureSummary>> Summary =
        s => new DocumentSignatureSummary(s.Id, s.SignatoryName, s.SignatoryPosition, s.ImageWidth, s.ImageHeight, s.CreatedAt);

    private static DocumentSignatureStatusResponse Status(DocumentSignatureSummary? s) => new(s, DocumentSignatureImage.MaxUploadBytes);

    private static string Text(string? value, string missing)
    {
        var text = string.Join(' ', (value ?? "").Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        if (text.Length == 0) throw new ApiException(400, "validation_failed", missing);
        if (text.Length > MaxTextLength || text.Any(char.IsControl))
            throw new ApiException(400, "validation_failed", $"Keep the name and position to {MaxTextLength} characters.");
        return text;
    }
}
