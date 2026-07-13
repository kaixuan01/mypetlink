import { staticPublicPetParams } from "@/data/staticRouteParams";
import { parsePublicProfileParam } from "@/lib/routes";
import {
  isPublicProfileShareable,
  toPublicProfileSocialCardData,
} from "@/lib/publicProfileSocial";
import { createPublicProfileSocialImage } from "@/lib/publicProfileSocialImage";
import { getPublicPetProfileByPublicCode } from "@/services/petService";

type PublicProfileSocialImageRouteProps = {
  params: Promise<{ slug: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return staticPublicPetParams().map(({ slug }) => ({ slug: `${slug}.jpg` }));
}

export async function GET(
  _request: Request,
  { params }: PublicProfileSocialImageRouteProps
) {
  const { slug: fileName } = await params;
  const slug = fileName.toLowerCase().endsWith(".jpg")
    ? fileName.slice(0, -4)
    : "";

  if (!/^[a-z0-9-]+$/i.test(slug)) {
    return createPublicProfileSocialImage(null);
  }

  const { publicCode } = parsePublicProfileParam(slug);

  try {
    const profile = await getPublicPetProfileByPublicCode(publicCode);
    if (!profile.data || !isPublicProfileShareable(profile.data)) {
      return createPublicProfileSocialImage(null);
    }

    return createPublicProfileSocialImage(
      toPublicProfileSocialCardData(profile.data)
    );
  } catch {
    return createPublicProfileSocialImage(null);
  }
}
