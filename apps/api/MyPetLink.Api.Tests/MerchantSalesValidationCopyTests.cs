using System.ComponentModel.DataAnnotations;
using System.Reflection;
using MyPetLink.Api.DTOs;

namespace MyPetLink.Api.Tests;

/// <summary>
/// Model validation runs before any service rule, so its messages are the ones
/// the Admin Portal shows. Left without wording, the framework writes the C#
/// property name into the message — "The LegalBusinessName field is required."
/// — and an operator reads implementation detail instead of an instruction.
/// These records are positional, so the attributes sit on the constructor
/// parameters, which is where both ASP.NET and this test read them.
/// </summary>
public sealed class MerchantSalesValidationCopyTests
{
    private static readonly Type[] AdminRequestTypes =
    [
        typeof(MerchantAddressDto),
        typeof(UpsertMerchantRequest),
        typeof(UpsertSalespersonRequest),
        typeof(UpsertQuotationItemRequest),
        typeof(UpsertQuotationRequest),
        typeof(UpdateBusinessIdentityRequest),
    ];

    [Fact]
    public void EveryAdminFacingValidationRuleCarriesItsOwnWording()
    {
        var unworded = AdminRequestTypes
            .SelectMany(Parameters)
            .Where(entry => string.IsNullOrWhiteSpace(entry.Attribute.ErrorMessage))
            .Select(entry => $"{entry.Owner}.{entry.Parameter} [{entry.Attribute.GetType().Name}]")
            .ToList();

        Assert.Empty(unworded);
    }

    [Fact]
    public void NoValidationMessageNamesACodePropertyOrReadsLikeAFrameworkDefault()
    {
        var messages = AdminRequestTypes
            .SelectMany(Parameters)
            .Select(entry => entry.Attribute.ErrorMessage ?? "")
            .Where(message => message.Length > 0)
            .ToList();

        Assert.NotEmpty(messages);
        Assert.All(messages, message =>
        {
            Assert.DoesNotContain(" field is required", message);
            Assert.DoesNotContain("The field ", message);
            Assert.DoesNotContain("must be between 0 and 999999.99", message);
        });
    }

    [Theory]
    [InlineData(typeof(UpsertMerchantRequest), "LegalBusinessName", "Enter the registered business name.")]
    [InlineData(typeof(UpsertMerchantRequest), "ContactPerson", "Enter a contact person.")]
    [InlineData(typeof(UpsertMerchantRequest), "ContactEmail", "Enter a contact email address.")]
    [InlineData(typeof(UpsertMerchantRequest), "ContactPhone", "Enter a contact phone number.")]
    [InlineData(typeof(MerchantAddressDto), "AddressLine1", "Enter the street address.")]
    [InlineData(typeof(MerchantAddressDto), "Postcode", "Enter the postcode.")]
    [InlineData(typeof(MerchantAddressDto), "City", "Enter the city or town.")]
    [InlineData(typeof(MerchantAddressDto), "State", "Enter the state.")]
    [InlineData(typeof(MerchantAddressDto), "Country", "Enter the country.")]
    [InlineData(typeof(UpsertSalespersonRequest), "Name", "Enter the salesperson's name.")]
    [InlineData(typeof(UpsertSalespersonRequest), "DefaultCommissionPercentage",
        "Commission must be between 0 and 100 percent.")]
    [InlineData(typeof(UpsertQuotationItemRequest), "Quantity",
        "Quantity must be a whole number of at least 1.")]
    [InlineData(typeof(UpsertQuotationItemRequest), "WholesaleUnitPrice",
        "A wholesale price cannot be negative.")]
    [InlineData(typeof(UpsertQuotationItemRequest), "LineDiscount",
        "A line discount cannot be negative.")]
    [InlineData(typeof(UpsertQuotationRequest), "MerchantId",
        "Choose the merchant this quotation is for.")]
    [InlineData(typeof(UpsertQuotationRequest), "DiscountTotal",
        "An order discount cannot be negative.")]
    [InlineData(typeof(UpsertQuotationRequest), "DeliveryFee", "A delivery fee cannot be negative.")]
    [InlineData(typeof(UpdateBusinessIdentityRequest), "BrandName",
        "Enter the brand name shown on documents.")]
    [InlineData(typeof(UpdateBusinessIdentityRequest), "SupportEmail",
        "Enter a support email address.")]
    public void TheOperatorIsToldWhatToDo(Type owner, string parameter, string expected)
    {
        var messages = Parameters(owner)
            .Where(entry => entry.Parameter == parameter)
            .Select(entry => entry.Attribute.ErrorMessage)
            .ToList();

        Assert.Contains(expected, messages);
    }

    private static IEnumerable<(string Owner, string Parameter, ValidationAttribute Attribute)>
        Parameters(Type type) =>
        type.GetConstructors()
            .SelectMany(constructor => constructor.GetParameters())
            .SelectMany(parameter => parameter
                .GetCustomAttributes<ValidationAttribute>()
                // Length limits are a storage guard, not an instruction the
                // operator can act on before they have typed anything.
                .Where(attribute => attribute is not MaxLengthAttribute)
                .Select(attribute => (type.Name, parameter.Name ?? "", attribute)));
}
