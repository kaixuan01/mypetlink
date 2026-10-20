using System.Net;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Tests;

public sealed class ConsignmentAgreementDocumentHttpTests
{
    [Fact]
    public async Task ViewersSeeTheDocumentStatusButNotTheFilesOrTheActions()
    {
        await using var factory = new PhysicalQaHttpTests.Factory(); using var client = factory.CreateClient();
        Guid agreementId, documentId, copyId;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>(); await PhysicalQaTests.Seed(db);
            var admin = await db.AdminUsers.SingleAsync();
            var role = new AdminRoleDefinition { Code = "agreement-doc-view", Name = "Synthetic viewer" };
            role.Capabilities.Add(new AdminRoleCapability { Capability = AdminCapabilities.ConsignmentView });
            role.Assignments.Add(new AdminUserRoleAssignment { AdminUserId = admin.Id }); db.AdminRoles.Add(role);
            var merchant = new Merchant { MerchantCode = "HTTP-DOC", LegalBusinessName = "Synthetic shop" };
            var agreement = new ConsignmentAgreement { Merchant = merchant, Reference = "HTTP-DOC-AGREEMENT", UpdatedByAdminUserId = admin.Id };
            var document = new ConsignmentAgreementDocument { Agreement = agreement, MerchantId = merchant.Id, AgreementReference = agreement.Reference,
                AgreementVersion = 1, IssueNumber = 1, TermsFingerprint = new string('A', 64), SnapshotJson = "{}", Content = Encoding.ASCII.GetBytes("%PDF-1.4"),
                ContentSha256 = new string('B', 64), FileName = "synthetic.pdf", IssuedByAdminUserId = admin.Id };
            var copy = new ConsignmentSignedAgreement { AgreementId = agreement.Id, MerchantId = merchant.Id, AgreementVersion = 1, IssuedDocument = document,
                TermsFingerprint = document.TermsFingerprint, OriginalFileName = "signed.pdf", ContentType = "application/pdf", FileSize = 8,
                Sha256 = new string('C', 64), Content = Encoding.ASCII.GetBytes("%PDF-1.4"), PartnerSignatoryName = "Synthetic Signatory", UploadedByAdminUserId = admin.Id };
            db.AddRange(document, copy); await db.SaveChangesAsync();
            (agreementId, documentId, copyId) = (agreement.Id, document.Id, copy.Id);
        }
        var root = $"/api/v1/admin/merchant-sales/consignment/agreements/{agreementId}";
        var json = new StringContent("{}", Encoding.UTF8, "application/json");
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(root + "/document")).StatusCode);
        client.DefaultRequestHeaders.Add("X-QA-Test-User", PhysicalQaTests.UserId.ToString());

        var summary = await client.GetAsync(root + "/document");
        Assert.Equal(HttpStatusCode.OK, summary.StatusCode); Assert.True(summary.Headers.CacheControl?.NoStore);
        var body = await summary.Content.ReadAsStringAsync();
        Assert.Contains("Synthetic Signatory", body); Assert.DoesNotContain("JVBER", body);   // metadata only, never file bytes
        foreach (var path in new[] { "/document/preview.pdf?concurrencyToken=AA==", $"/documents/{documentId}/pdf", $"/signed-copies/{copyId}/file" })
            Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(root + path)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync(root + "/document/issue", json)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync(root + "/signed-copies", json)).StatusCode);

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>(); var role = await db.AdminRoles.SingleAsync(r => r.Code == "agreement-doc-view");
            db.AdminRoleCapabilities.Add(new AdminRoleCapability { AdminRoleId = role.Id, Capability = AdminCapabilities.ConsignmentAgreementsApprove }); await db.SaveChangesAsync();
        }
        var issued = await client.GetAsync(root + $"/documents/{documentId}/pdf");
        Assert.Equal(HttpStatusCode.OK, issued.StatusCode); Assert.Equal("application/pdf", issued.Content.Headers.ContentType?.MediaType);
        Assert.True(issued.Headers.CacheControl?.NoStore);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(root + $"/signed-copies/{copyId}/file")).StatusCode);
        // An approver may read the paperwork but not issue or record it.
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync(root + "/document/issue", json)).StatusCode);
        // A file id is only reachable through its own agreement.
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/v1/admin/merchant-sales/consignment/agreements/{Guid.NewGuid()}/documents/{documentId}/pdf")).StatusCode);
    }
}
