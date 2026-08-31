import { pageSlugSchema, previewTokenSchema } from "@bher/contracts";

const ROOT_PATHNAME = "/";
const PREVIEW_FRAGMENT_PREFIX = "#preview=";

export type PreviewFragmentResolution =
  | Readonly<{ status: "public" }>
  | Readonly<{ status: "preview"; token: string }>
  | Readonly<{ status: "invalid" }>;

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

export function resolvePreviewFragment(
  fragment: string,
): PreviewFragmentResolution {
  if (fragment === "" || fragment === "#") {
    return { status: "public" };
  }
  if (!fragment.startsWith(PREVIEW_FRAGMENT_PREFIX)) {
    return { status: "public" };
  }
  const parsed = previewTokenSchema.safeParse(
    fragment.slice(PREVIEW_FRAGMENT_PREFIX.length),
  );
  return parsed.success
    ? { status: "preview", token: parsed.data }
    : { status: "invalid" };
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
