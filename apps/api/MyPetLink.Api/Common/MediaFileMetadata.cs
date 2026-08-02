using System.Text;

namespace MyPetLink.Api.Common;

public static class MediaFileMetadata
{
    public const int MaxOriginalFileNameLength = 260;
    private const string UnsafeFileNameCharacters = "<>:\"/\\|?*";

    public static string? SanitizeOriginalFileName(string? originalFileName)
    {
        if (string.IsNullOrWhiteSpace(originalFileName))
        {
            return null;
        }

        var leafName = Path.GetFileName(originalFileName.Replace('\\', '/'));
        var builder = new StringBuilder(leafName.Length);
        foreach (var character in leafName)
        {
            if (!char.IsControl(character)
                && !UnsafeFileNameCharacters.Contains(character, StringComparison.Ordinal))
            {
                builder.Append(character);
            }
        }

        var fileName = builder.ToString().Trim().TrimEnd('.');
        if (fileName is "" or "." or "..")
        {
            return null;
        }

        if (fileName.Length <= MaxOriginalFileNameLength)
        {
            return fileName;
        }

        var extension = SafeExtension(fileName);
        if (extension is null)
        {
            return fileName[..MaxOriginalFileNameLength].TrimEnd(' ', '.');
        }

        var stemLength = MaxOriginalFileNameLength - extension.Length;
        var stem = fileName[..^extension.Length][..stemLength].TrimEnd(' ', '.');
        return string.IsNullOrWhiteSpace(stem)
            ? null
            : $"{stem}{extension}";
    }

    public static string InferContentType(string fileName)
    {
        return Path.GetExtension(fileName).ToLowerInvariant() switch
        {
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".webp" => "image/webp",
            ".pdf" => "application/pdf",
            _ => "application/octet-stream"
        };
    }

    private static string? SafeExtension(string fileName)
    {
        var extension = Path.GetExtension(fileName);
        return extension.Length is >= 2 and <= 16
            && extension[1..].All(char.IsAsciiLetterOrDigit)
            ? extension
            : null;
    }
}
