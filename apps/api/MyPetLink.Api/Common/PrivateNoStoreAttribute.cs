namespace MyPetLink.Api.Common;

/// <summary>
/// Marks an endpoint whose every response is <c>Cache-Control: private,
/// no-store</c>, so no browser, proxy or edge cache keeps an owner's private
/// data. Applied by <c>PrivateNoStoreMiddleware</c>, which runs after routing
/// and before authorization so the sign-in challenge, automatic validation
/// errors and the error handler's responses are covered too.
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class PrivateNoStoreAttribute : Attribute
{
    public const string HeaderValue = "private, no-store";
}
