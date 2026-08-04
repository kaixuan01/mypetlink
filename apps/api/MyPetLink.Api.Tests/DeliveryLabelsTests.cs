using MyPetLink.Api.Common;

namespace MyPetLink.Api.Tests;

public class DeliveryLabelsTests
{
    [Theory]
    [InlineData("PEN", "Standard Delivery — West Malaysia")]
    [InlineData("SBH", "Standard Delivery — Sabah")]
    [InlineData("SWK", "Standard Delivery — Sarawak")]
    [InlineData("LBN", "Standard Delivery — Labuan")]
    public void CustomerMethodUsesOneCanonicalShape(string zoneCode, string expected)
    {
        Assert.Equal(expected, DeliveryLabels.CustomerMethodFor(zoneCode));
    }

    [Fact]
    public void CustomersNeverSeeThePeninsularWording()
    {
        Assert.Equal("West Malaysia", DeliveryLabels.CustomerRegionFor("PEN"));
        Assert.DoesNotContain("Peninsular", DeliveryLabels.CustomerMethodFor("PEN"));
        Assert.DoesNotContain("Peninsular", DeliveryLabels.CustomerRegionFor("PEN"));
    }

    [Fact]
    public void OperatorsKeepBothNames()
    {
        Assert.Equal("Peninsular Malaysia (West Malaysia)", DeliveryLabels.AdminRegionFor("PEN"));
        Assert.Equal("Sabah", DeliveryLabels.AdminRegionFor("SBH"));
        Assert.Equal("Sarawak", DeliveryLabels.AdminRegionFor("SWK"));
        Assert.Equal("Labuan", DeliveryLabels.AdminRegionFor("LBN"));
    }

    [Theory]
    [InlineData("Peninsular Standard Delivery")]
    [InlineData("Peninsular Malaysia Standard Delivery")]
    [InlineData("Peninsular Malaysia Delivery")]
    [InlineData("Standard Delivery - Peninsular Malaysia")]
    [InlineData("Standard Delivery — Peninsular Malaysia")]
    [InlineData("  peninsular standard delivery  ")]
    public void LegacyMyPetLinkLabelsAreReworded(string stored)
    {
        Assert.Equal(
            "Standard Delivery — West Malaysia",
            DeliveryLabels.NormalizeCustomerMethod(stored, "PEN"));
    }

    [Theory]
    [InlineData("Sabah Standard Delivery", "Standard Delivery — Sabah")]
    [InlineData("Sarawak Standard Delivery", "Standard Delivery — Sarawak")]
    [InlineData("Labuan Standard Delivery", "Standard Delivery — Labuan")]
    public void OtherRegionsFollowTheSameShape(string stored, string expected)
    {
        Assert.Equal(expected, DeliveryLabels.NormalizeCustomerMethod(stored));
    }

    [Theory]
    [InlineData("Weekend Express (Klang Valley)")]
    [InlineData("Pickup from our Ampang counter")]
    [InlineData("Peninsular Bulk Contract Rate 2026")]
    public void AdministratorsOwnWordingIsLeftAlone(string custom)
    {
        // Renaming a rate somebody deliberately configured is not this
        // helper's business, even when it mentions the old region name.
        Assert.Equal(custom, DeliveryLabels.NormalizeCustomerMethod(custom, "PEN"));
    }

    [Fact]
    public void AlreadyCanonicalLabelsAreUnchanged()
    {
        const string canonical = "Standard Delivery — West Malaysia";
        Assert.Equal(canonical, DeliveryLabels.NormalizeCustomerMethod(canonical, "PEN"));
    }

    [Fact]
    public void AMissingLabelFallsBackToTheZone()
    {
        Assert.Equal("Standard Delivery — West Malaysia", DeliveryLabels.NormalizeCustomerMethod(null, "PEN"));
        Assert.Equal("Standard Delivery — Sabah", DeliveryLabels.NormalizeCustomerMethod("   ", "SBH"));
    }

    [Fact]
    public void LegacyRegionSnapshotsAreReworded()
    {
        Assert.Equal("West Malaysia", DeliveryLabels.NormalizeCustomerRegion("Peninsular"));
        Assert.Equal("West Malaysia", DeliveryLabels.NormalizeCustomerRegion("Peninsular Malaysia"));
        Assert.Equal("Sabah", DeliveryLabels.NormalizeCustomerRegion("Sabah"));
    }

    [Fact]
    public void ZonesResolveFromCodeRegionOrState()
    {
        Assert.Equal("PEN", DeliveryLabels.ResolveZoneCode("PEN"));
        Assert.Equal("PEN", DeliveryLabels.ResolveZoneCode("West Malaysia"));
        Assert.Equal("PEN", DeliveryLabels.ResolveZoneCode("Peninsular"));
        Assert.Equal("PEN", DeliveryLabels.ResolveZoneCode("SGR"));
        Assert.Equal("SBH", DeliveryLabels.ResolveZoneCode("Sabah"));
        Assert.Equal("", DeliveryLabels.ResolveZoneCode("Somewhere else"));
    }

    [Fact]
    public void ZoneCodesAreNotRenamed()
    {
        // The wording changed; the stable identifiers did not.
        Assert.Equal("PEN", MalaysiaDelivery.ResolveState("Selangor")!.ZoneCode);
        Assert.Equal("SBH", MalaysiaDelivery.ResolveState("Sabah")!.ZoneCode);
        Assert.Equal("SWK", MalaysiaDelivery.ResolveState("Sarawak")!.ZoneCode);
        Assert.Equal("LBN", MalaysiaDelivery.ResolveState("Labuan")!.ZoneCode);
        Assert.Equal(["PEN", "SBH", "SWK", "LBN"], MalaysiaDelivery.Zones.Keys.ToArray());
    }

    [Fact]
    public void PlainTextContextsGetASafeDash()
    {
        Assert.Equal(
            "Standard Delivery - West Malaysia",
            DeliveryLabels.ToPlainText(DeliveryLabels.CustomerMethodFor("PEN")));
    }
}
