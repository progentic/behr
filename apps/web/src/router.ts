import { pageSlugSchema } from "@bher/contracts";

const ROOT_PATHNAME = "/";

export function resolvePublicSlug(pathname: string): string | null {
  if (pathname === ROOT_PATHNAME) {
    return "";
  }
  if (!isSingleSegmentPathname(pathname)) {
    return null;
  }
  const decoded = decodePathSegment(pathname.slice(1));
  if (decoded === null || decoded.includes("/")) {
    return null;
  }
  const parsed = pageSlugSchema.safeParse(decoded);
  return parsed.success ? parsed.data : null;
}

function isSingleSegmentPathname(pathname: string): boolean {
  return (
    pathname.startsWith(ROOT_PATHNAME) &&
    !pathname.endsWith(ROOT_PATHNAME) &&
    !pathname.slice(1).includes(ROOT_PATHNAME)
  );
}

function decodePathSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}
