import { authRoutes, ownerRoutes } from "@/lib/routes";

const LOCAL_REDIRECT_ORIGIN = "https://mypetlink.local";
const unsafeCharacters = /[\\\u0000-\u001f\u007f]/;

export function isSafeLocalRedirect(value: string | null | undefined) {
  if (!value || unsafeCharacters.test(value)) {
    return false;
  }

  let decoded = value;

  try {
    for (let pass = 0; pass < 3; pass += 1) {
      const next = decodeURIComponent(decoded);

      if (next === decoded) {
        break;
      }

      decoded = next;
    }
  } catch {
    return false;
  }

  if (
    !decoded.startsWith("/") ||
    decoded.startsWith("//") ||
    unsafeCharacters.test(decoded)
  ) {
    return false;
  }

  try {
    return new URL(value, LOCAL_REDIRECT_ORIGIN).origin === LOCAL_REDIRECT_ORIGIN;
  } catch {
    return false;
  }
}

export function resolveOwnerPostLoginPath(
  value: string | null | undefined,
  fallback = ownerRoutes.dashboard
) {
  if (!isSafeLocalRedirect(value)) {
    return fallback;
  }

  const destination = new URL(value!, LOCAL_REDIRECT_ORIGIN);

  if (destination.pathname.replace(/\/+$/, "") === authRoutes.ownerLogin) {
    return fallback;
  }

  return `${destination.pathname}${destination.search}${destination.hash}`;
}

export function ownerLoginPath(returnTo: string) {
  const destination = resolveOwnerPostLoginPath(returnTo);
  return `${authRoutes.ownerLogin}?redirect=${encodeURIComponent(destination)}`;
}

/**
 * Whether a safe post-login destination belongs to Community.
 *
 * This is presentation context for the login page, never authorization and
 * never a second redirect validator. Unsafe input first falls through the
 * normal resolver, so an external URL can never make the login page promise a
 * Community return that will not happen.
 */
export function isCommunityPostLoginPath(value: string | null | undefined) {
  const destination = resolveOwnerPostLoginPath(value, "");

  if (!destination) {
    return false;
  }

  const pathname = new URL(destination, LOCAL_REDIRECT_ORIGIN).pathname;

  return (
    pathname === "/feed" ||
    pathname === "/notifications" ||
    pathname === "/explore" ||
    pathname === "/search" ||
    pathname === "/community/profile" ||
    pathname.startsWith("/community/profile/") ||
    pathname === "/moments" ||
    pathname.startsWith("/moments/") ||
    pathname === "/u" ||
    pathname.startsWith("/u/")
  );
}

export function getCurrentLocalDestination(fallback: string) {
  if (typeof window === "undefined") {
    return resolveOwnerPostLoginPath(fallback);
  }

  return resolveOwnerPostLoginPath(
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
    fallback
  );
}
