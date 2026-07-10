namespace MyPetLink.Api.Common;

public sealed class ApiException : Exception
{
    public ApiException(
        int statusCode,
        string code,
        string message,
        IReadOnlyDictionary<string, string[]>? details = null)
        : base(message)
    {
        StatusCode = statusCode;
        Code = code;
        Details = details;
    }

    public int StatusCode { get; }
    public string Code { get; }
    public IReadOnlyDictionary<string, string[]>? Details { get; }
}
