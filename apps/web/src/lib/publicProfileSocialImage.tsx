import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import {
  publicProfileSocialImageContentType,
  publicProfileSocialImageSize,
  type PublicProfileSocialCardData,
} from "@/lib/publicProfileSocial";

type SocialMediaKind = "cover" | "profile";
type SocialMediaLoader = (
  value: string | undefined,
  kind: SocialMediaKind
) => Promise<string | null>;

type SocialImageOptions = {
  loadMedia?: SocialMediaLoader;
};

const maxSourceImageBytes = 8 * 1024 * 1024;
let logoDataUrlPromise: Promise<string> | undefined;

export async function createPublicProfileSocialImage(
  card?: PublicProfileSocialCardData | null,
  options: SocialImageOptions = {}
) {
  const loadMedia = options.loadMedia ?? loadPublicSocialMedia;
  const [logoUrl, coverUrl, photoUrl] = await Promise.all([
    getLogoDataUrl(),
    card ? loadMedia(card.coverUrl, "cover") : Promise.resolve(null),
    card ? loadMedia(card.photoUrl, "profile") : Promise.resolve(null),
  ]);
  const displayName = card?.name ?? "MyPetLink";
  const topOffset = card?.lostModeEnabled ? 82 : 58;
  const png = new ImageResponse(
    (
      <div
        style={{
          alignItems: "stretch",
          background: "#fff8e8",
          color: "#102247",
          display: "flex",
          fontFamily: "Arial, sans-serif",
          height: "100%",
          overflow: "hidden",
          position: "relative",
          width: "100%",
        }}
      >
        <div
          style={{
            background: "#ccefe4",
            borderRadius: 999,
            display: "flex",
            height: 270,
            left: -80,
            opacity: 0.75,
            position: "absolute",
            top: -110,
            width: 270,
          }}
        />
        <div
          style={{
            background: "#d7e8ff",
            borderRadius: 999,
            bottom: -145,
            display: "flex",
            height: 340,
            opacity: 0.78,
            position: "absolute",
            right: -90,
            width: 340,
          }}
        />

        {card?.lostModeEnabled ? (
          <div
            style={{
              alignItems: "center",
              background: "#e95f55",
              color: "white",
              display: "flex",
              fontSize: 25,
              fontWeight: 800,
              height: 58,
              justifyContent: "center",
              left: 0,
              letterSpacing: 0.7,
              position: "absolute",
              right: 0,
              top: 0,
            }}
          >
            PET IS LOST&nbsp;&nbsp;•&nbsp;&nbsp;Please open this profile to contact the owner.
          </div>
        ) : null}

        <div
          style={{
            background: "linear-gradient(145deg, #a9d8ff 0%, #bcebdc 56%, #ffd8c7 100%)",
            border: "8px solid rgba(255,255,255,0.92)",
            borderRadius: 42,
            boxShadow: "0 20px 50px rgba(16,34,71,0.16)",
            display: "flex",
            height: card?.lostModeEnabled ? 472 : 514,
            left: 58,
            overflow: "hidden",
            position: "absolute",
            top: topOffset,
            width: 548,
          }}
        >
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=""
              src={coverUrl}
              style={{ height: "100%", objectFit: "cover", width: "100%" }}
            />
          ) : (
            <div
              style={{
                alignItems: "center",
                display: "flex",
                height: "100%",
                justifyContent: "center",
                position: "relative",
                width: "100%",
              }}
            >
              <div
                style={{
                  border: "3px solid rgba(255,255,255,0.55)",
                  borderRadius: 999,
                  display: "flex",
                  height: 230,
                  opacity: 0.7,
                  position: "absolute",
                  transform: "rotate(-18deg)",
                  width: 230,
                }}
              />
              <div
                style={{
                  display: "flex",
                  height: 160,
                  position: "relative",
                  width: 180,
                }}
              >
                <div
                  style={{
                    background: "rgba(255,255,255,0.58)",
                    borderRadius: 999,
                    display: "flex",
                    height: 96,
                    left: 42,
                    position: "absolute",
                    top: 58,
                    width: 96,
                  }}
                />
                {[18, 58, 102, 142].map((left, index) => (
                  <div
                    key={left}
                    style={{
                      background: "rgba(255,255,255,0.58)",
                      borderRadius: 999,
                      display: "flex",
                      height: index === 0 || index === 3 ? 42 : 48,
                      left,
                      position: "absolute",
                      top: index === 0 || index === 3 ? 34 : 8,
                      width: index === 0 || index === 3 ? 42 : 48,
                    }}
                  />
                ))}
              </div>
              <div
                style={{
                  color: "rgba(16,34,71,0.52)",
                  display: "flex",
                  fontSize: 22,
                  fontWeight: 900,
                  letterSpacing: 3,
                  position: "absolute",
                  bottom: 60,
                }}
              >
                MYPETLINK
              </div>
            </div>
          )}
        </div>

        {card ? (
          <div
            style={{
              alignItems: "center",
              background: "#fff8e8",
              border: "9px solid #fff8e8",
              borderRadius: 999,
              bottom: 34,
              boxShadow: "0 15px 35px rgba(16,34,71,0.22)",
              display: "flex",
              height: 186,
              justifyContent: "center",
              left: 452,
              overflow: "hidden",
              position: "absolute",
              width: 186,
            }}
          >
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt=""
                src={photoUrl}
                style={{ height: "100%", objectFit: "cover", width: "100%" }}
              />
            ) : (
              <div
                style={{
                  alignItems: "center",
                  background: "linear-gradient(145deg, #ffb69d, #8bd9c6)",
                  color: "#102247",
                  display: "flex",
                  fontSize: 76,
                  fontWeight: 900,
                  height: "100%",
                  justifyContent: "center",
                  width: "100%",
                }}
              >
                {card.initial}
              </div>
            )}
          </div>
        ) : null}

        <div
          style={{
            alignItems: "flex-start",
            display: "flex",
            flexDirection: "column",
            height: card?.lostModeEnabled ? 472 : 514,
            justifyContent: "center",
            left: 682,
            position: "absolute",
            top: topOffset,
            width: 460,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="MyPetLink"
            src={logoUrl}
            style={{ height: 66, objectFit: "contain", objectPosition: "left center", width: 255 }}
          />
          <div
            style={{
              color: "#e95f55",
              display: "flex",
              fontSize: 20,
              fontWeight: 900,
              letterSpacing: 2.2,
              marginTop: 22,
            }}
          >
            {card ? "PET PROFILE" : "PROFILE UNAVAILABLE"}
          </div>
          <div
            style={{
              color: "#102247",
              display: "flex",
              fontSize: displayName.length > 18 ? 54 : 68,
              fontWeight: 900,
              letterSpacing: -2.2,
              lineHeight: 1.03,
              marginTop: 10,
              maxWidth: 460,
            }}
          >
            {card ? displayName : "A safe profile for every pet"}
          </div>
          {card?.summary ? (
            <div
              style={{
                color: "#53627f",
                display: "flex",
                fontSize: 25,
                fontWeight: 700,
                lineHeight: 1.35,
                marginTop: 18,
                maxWidth: 445,
              }}
            >
              {card.summary}
            </div>
          ) : null}
          <div
            style={{
              alignItems: "center",
              background: "#1570ef",
              borderRadius: 999,
              color: "white",
              display: "flex",
              fontSize: 23,
              fontWeight: 800,
              marginTop: 28,
              padding: "14px 24px",
            }}
          >
            {card ? `View ${displayName}'s profile` : "Discover MyPetLink"}
          </div>
          <div
            style={{
              color: "#53627f",
              display: "flex",
              fontSize: 22,
              fontWeight: 700,
              marginTop: 22,
            }}
          >
            mypetlink.com.my
          </div>
        </div>
      </div>
    ),
    publicProfileSocialImageSize
  );
  const jpeg = await sharp(Buffer.from(await png.arrayBuffer()))
    .jpeg({ chromaSubsampling: "4:2:0", mozjpeg: true, quality: 82 })
    .toBuffer();

  return new Response(new Uint8Array(jpeg), {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": publicProfileSocialImageContentType,
    },
    status: 200,
  });
}

async function getLogoDataUrl() {
  logoDataUrlPromise ??= readFile(
    join(process.cwd(), "public", "logo-horizontal.png")
  ).then((buffer) => `data:image/png;base64,${buffer.toString("base64")}`);
  return logoDataUrlPromise;
}

async function loadPublicSocialMedia(
  value: string | undefined,
  kind: SocialMediaKind
) {
  const url = validatePublicMediaUrl(value);
  if (!url) return null;

  try {
    const response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(4500),
    });
    if (!response.ok) return null;

    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > maxSourceImageBytes) return null;

    const contentType = (response.headers.get("content-type") ?? "")
      .split(";", 1)[0]
      .toLowerCase();
    if (!contentType.startsWith("image/")) return null;

    const source = Buffer.from(await response.arrayBuffer());
    if (!source.length || source.length > maxSourceImageBytes) return null;

    const width = kind === "cover" ? 720 : 260;
    const height = kind === "cover" ? 630 : 260;
    const normalized = await sharp(source)
      .rotate()
      .resize(width, height, {
        fit: "cover",
        position: "centre",
        withoutEnlargement: true,
      })
      .jpeg({ chromaSubsampling: "4:2:0", quality: 80 })
      .toBuffer();
    return `data:image/jpeg;base64,${normalized.toString("base64")}`;
  } catch {
    return null;
  }
}

function validatePublicMediaUrl(value: string | undefined) {
  const resolved = resolveMediaUrl(value);
  if (!resolved) return null;

  try {
    const url = new URL(resolved);
    if (url.protocol !== "https:") return null;

    const allowedHosts = new Set(["media.mypetlink.com.my"]);
    const configuredMediaBase = (
      process.env.NEXT_PUBLIC_MEDIA_BASE_URL ?? ""
    ).trim();
    if (configuredMediaBase) {
      try {
        const configuredUrl = new URL(configuredMediaBase);
        if (configuredUrl.protocol === "https:") {
          allowedHosts.add(configuredUrl.hostname.toLowerCase());
        }
      } catch {
        // Ignore an invalid optional media-base configuration.
      }
    }

    return allowedHosts.has(url.hostname.toLowerCase()) ? url : null;
  } catch {
    return null;
  }
}
