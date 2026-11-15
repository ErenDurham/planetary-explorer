
import { useEffect, useState } from "react";
import {
  ChevronDown,
  Database,
  ExternalLink,
  ImageOff,
  Layers,
  MapPinned,
  RefreshCw,
  Satellite,
} from "lucide-react";

type NasaImage = {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  sourceUrl: string;
  credit: string;
};

type Highlight = {
  title: string;
  description: string;
  keywords: string[];
};

type SiteInfo = {
  search: string;
  alternateSearch: string;
  mission: string;
  terrain: string;
  highlights: Highlight[];
};

const SITE_INFO: Record<string, SiteInfo> = {
  elysium: {
    search: "Elysium Planitia InSight Mars",
    alternateSearch: "InSight Mars surface landscape",
    mission: "InSight lander (2018–2022)",
    terrain: "Volcanic plain",
    highlights: [
      {
        title: "Volcanic plains",
        description:
          "Volcanic processes shaped much of the regional terrain.",
        keywords: ["volcanic", "lava", "plain"],
      },
      {
        title: "Landing terrain",
        description:
          "InSight landed on a relatively flat surface with few large rocks.",
        keywords: ["landing", "surface", "rock"],
      },
      {
        title: "Surface materials",
        description:
          "Orbital and lander observations document rocks, soil, and dust.",
        keywords: ["soil", "sand", "terrain"],
      },
    ],
  },

  oxia: {
    search: "Oxia Planum Mars",
    alternateSearch: "Oxia Planum terrain",
    mission: "Orbital observations",
    terrain: "Clay-bearing plain",
    highlights: [
      {
        title: "Clay-rich deposits",
        description:
          "Orbital spectroscopy indicates ancient water-related alteration.",
        keywords: ["clay", "mineral", "deposit"],
      },
      {
        title: "Ancient surfaces",
        description:
          "Exposed geological units provide access to older Martian materials.",
        keywords: ["surface", "terrain", "erosion"],
      },
    ],
  },

  chryse: {
    search: "Chryse Planitia Viking 1 Mars",
    alternateSearch: "Viking 1 Mars surface",
    mission: "Viking 1 lander",
    terrain: "Northern lowland plain",
    highlights: [
      {
        title: "Outflow-channel setting",
        description:
          "Major ancient channel systems extend toward the Chryse lowlands.",
        keywords: ["channel", "flood", "terrain"],
      },
      {
        title: "Rocky landing terrain",
        description:
          "Viking 1 photographed rocks and soil at its landing site.",
        keywords: ["viking", "rock", "surface"],
      },
    ],
  },

  gusev: {
    search: "Gusev Crater Spirit rover Mars",
    alternateSearch: "Spirit rover Mars landscape",
    mission: "Spirit rover (2004–2010)",
    terrain: "Impact crater · Columbia Hills",
    highlights: [
      {
        title: "Volcanic rocks",
        description:
          "Spirit examined basaltic rocks across the crater floor.",
        keywords: ["basalt", "rock", "volcanic"],
      },
      {
        title: "Water-altered materials",
        description:
          "Some Columbia Hills rocks preserve evidence of aqueous alteration.",
        keywords: ["columbia", "altered", "rock"],
      },
    ],
  },

  meridiani: {
    search: "Meridiani Planum Opportunity Mars",
    alternateSearch: "Opportunity rover Mars landscape",
    mission: "Opportunity rover (2004–2018)",
    terrain: "Hematite-bearing plain",
    highlights: [
      {
        title: "Hematite concretions",
        description:
          "Opportunity discovered small hematite-rich spheres.",
        keywords: ["hematite", "blueberries", "concretion"],
      },
      {
        title: "Sedimentary layers",
        description:
          "Sulfate-bearing rocks record past interactions with water.",
        keywords: ["sedimentary", "layer", "sulfate"],
      },
    ],
  },

  jezero: {
    search: "Jezero Crater Perseverance Mars",
    alternateSearch: "Perseverance Jezero Mars landscape",
    mission: "Perseverance rover (2021–present)",
    terrain: "Impact crater · Ancient delta",
    highlights: [
      {
        title: "Ancient river delta",
        description:
          "Delta deposits preserve evidence of flowing water.",
        keywords: ["delta", "river", "sediment"],
      },
      {
        title: "Sedimentary deposits",
        description:
          "Layered rocks record changes in the crater environment.",
        keywords: ["layer", "sediment", "outcrop"],
      },
      {
        title: "Igneous rocks",
        description:
          "Perseverance identified igneous rocks on the crater floor.",
        keywords: ["igneous", "rock", "floor"],
      },
    ],
  },

  utopia: {
    search: "Utopia Planitia Viking 2 Mars",
    alternateSearch: "Viking 2 Mars surface",
    mission: "Viking 2 lander; Zhurong rover",
    terrain: "Northern lowland basin",
    highlights: [
      {
        title: "Northern lowland terrain",
        description:
          "Broad plains characterize the region.",
        keywords: ["plain", "surface", "terrain"],
      },
      {
        title: "Ice-related landforms",
        description:
          "Orbital studies indicate ice-related processes in parts of the region.",
        keywords: ["ice", "polygon", "landform"],
      },
    ],
  },

  gale: {
    search: "Gale Crater Curiosity Mount Sharp Mars",
    alternateSearch: "Curiosity Gale Crater Mars landscape",
    mission: "Curiosity rover (2012–present)",
    terrain: "Impact crater · Mount Sharp",
    highlights: [
      {
        title: "Layered sedimentary rocks",
        description:
          "Rock layers preserve evidence of environmental change.",
        keywords: ["layer", "sedimentary", "strata"],
      },
      {
        title: "Ancient lake deposits",
        description:
          "Curiosity discovered evidence of ancient lake environments.",
        keywords: ["lake", "mudstone", "sediment"],
      },
      {
        title: "Clay-bearing rocks",
        description:
          "Clay minerals indicate past interactions between water and rock.",
        keywords: ["clay", "mineral", "rock"],
      },
    ],
  },
};

function identifySite(name: string): string {
  const normalized = name.toLowerCase();

  return (
    Object.keys(SITE_INFO).find((key) =>
      normalized.includes(key)
    ) ?? ""
  );
}

type NasaSearchItem = {
  data?: Array<{
    nasa_id?: string;
    title?: string;
    description?: string;
    description_508?: string;
    secondary_creator?: string;
    center?: string;
  }>;
  links?: Array<{
    href?: string;
    rel?: string;
    render?: string;
  }>;
};

// Avoid spacecraft hardware, charts, and illustrations.
// Keep actual Martian surface and orbital terrain imagery.
const EXCLUDE =
  /\b(chart|graph|diagram|infographic|spectrum|spectral plot|artist|illustration|animation|poster|selfie|calibration target|instrument assembly|engineering model|test chamber|clean room)\b/i;

const EQUIPMENT =
  /\b(camera head|mastcam instrument|robotic arm assembly|instrument deck|electronics box|antenna assembly|sensor package)\b/i;

function imageScore(
  image: NasaImage,
  siteName: string
): number {
  const text =
    `${image.title} ${image.description}`.toLowerCase();

  const title = image.title.toLowerCase();
  const site = identifySite(siteName);

  let score = 0;

  if (site && text.includes(site)) score += 15;

  if (
    /\b(landscape|panorama|terrain|surface|horizon|plains|crater|rock|outcrop|hills|delta|valley|channel)\b/i.test(
      title
    )
  ) {
    score += 12;
  }

  if (
    /\b(surface|terrain|landscape|panorama|rocks|outcrop)\b/i.test(
      text
    )
  ) {
    score += 5;
  }

  if (EXCLUDE.test(text)) score -= 30;
  if (EQUIPMENT.test(text)) score -= 30;

  return score;
}

// Restore the original working NASA Image Library API.
async function searchNasaImages(
  query: string,
  signal: AbortSignal
): Promise<NasaImage[]> {
  const params = new URLSearchParams({
    q: query,
    media_type: "image",
    page_size: "50",
  });

  const response = await fetch(
    `https://images-api.nasa.gov/search?${params.toString()}`,
    { signal }
  );

  if (!response.ok) {
    throw new Error("NASA image search unavailable.");
  }

  const json = await response.json();

  const items: NasaSearchItem[] =
    json.collection?.items ?? [];

  const images = items
    .map((item): NasaImage | null => {
      const data = item.data?.[0];

      const imageUrl = item.links?.find(
        (link) =>
          link.render === "image" ||
          link.rel === "preview"
      )?.href;

      if (!data?.nasa_id || !imageUrl) {
        return null;
      }

      const title = data.title ?? "NASA Mars image";

      const description =
        data.description_508 ??
        data.description ??
        "";

      return {
        id: data.nasa_id,
        title,
        description,
        imageUrl,
        sourceUrl:
          `https://images.nasa.gov/details/${encodeURIComponent(data.nasa_id)}`,
        credit:
          data.secondary_creator ??
          data.center ??
          "NASA Image and Video Library",
      };
    })
    .filter((item): item is NasaImage => item !== null);

  return Array.from(
    new Map(images.map((image) => [image.id, image])).values()
  );
}

async function loadSiteImages(
  siteName: string,
  info: SiteInfo | undefined,
  signal: AbortSignal
): Promise<NasaImage[]> {
  const queries = [
    info?.search ?? `${siteName} Mars`,
    info?.alternateSearch ?? `${siteName} terrain`,
  ];

  const collected: NasaImage[] = [];

  for (const query of queries) {
    if (signal.aborted) return [];

    try {
      const results = await searchNasaImages(
        query,
        signal
      );

      collected.push(...results);
    } catch (error) {
      if (signal.aborted) return [];

      console.warn("NASA image search:", error);
    }
  }

  const unique = Array.from(
    new Map(
      collected.map((image) => [image.id, image])
    ).values()
  );

  return unique
    .filter((image) => {
      const text =
        `${image.title} ${image.description}`;

      return (
        !EXCLUDE.test(image.title) &&
        !EQUIPMENT.test(text)
      );
    })
    .sort(
      (a, b) =>
        imageScore(b, siteName) -
        imageScore(a, siteName)
    )
    .slice(0, 12);
}

function NasaPhoto({
  image,
  className = "",
}: {
  image?: NasaImage;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [image?.imageUrl]);

  if (!image || failed) {
    return (
      <div
        className={`flex items-center justify-center bg-bg text-fg-muted ${className}`}
      >
        <div className="text-center">
          <ImageOff className="mx-auto mb-2 h-5 w-5" />
          <p className="text-[11px]">
            Image unavailable
          </p>
        </div>
      </div>
    );
  }

  return (
    <img
      src={image.imageUrl}
      alt={image.title}
      loading="lazy"
      className={`object-cover ${className}`}
      onError={() => setFailed(true)}
    />
  );
}

function formatCoordinate(
  value: number | undefined,
  positive: string,
  negative: string
): string {
  if (
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return "Not available";
  }

  return `${Math.abs(value).toFixed(4)}° ${
    value < 0 ? negative : positive
  }`;
}

export function SiteResearchOverview({
  siteName,
  latitude,
  longitude,
}: {
  siteName: string;
  latitude?: number;
  longitude?: number;
}) {
  const siteKey = identifySite(siteName);
  const info = SITE_INFO[siteKey];

  const [images, setImages] = useState<NasaImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setImages([]);
    setLoading(true);
    setError(null);

    loadSiteImages(
      siteName,
      info,
      controller.signal
    )
      .then((results) => {
        if (!controller.signal.aborted) {
          setImages(results);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load NASA images."
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [siteName, info, reload]);

  const hero = images[0];

  // The main image is reserved for the hero.
  const additionalImages = images.slice(1);

  const highlights = info?.highlights ?? [];

  function highlightImage(
    highlight: Highlight,
    index: number
  ): NasaImage | undefined {
    const candidates = additionalImages.filter(
      (image) =>
        !EXCLUDE.test(image.title) &&
        !EQUIPMENT.test(
          `${image.title} ${image.description}`
        )
    );

    const matched = candidates.find((image) => {
      const text =
        `${image.title} ${image.description}`.toLowerCase();

      return highlight.keywords.some((keyword) =>
        text.includes(keyword.toLowerCase())
      );
    });

    // If no keyword match exists, use a different
    // related archive image rather than an equipment photo.
    return matched ?? candidates[index];
  }

  return (
    <section className="min-w-0 space-y-4">
      {/* HEADER */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-fg">
            Site Research Overview
          </h2>
          <p className="mt-1 text-xs text-fg-muted">
            NASA imagery and geological context
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            setReload((value) => value + 1)
          }
          title="Refresh NASA images"
          className="rounded-lg border border-line-strong p-2 text-fg-muted hover:text-fg"
        >
          <RefreshCw
            className={`h-4 w-4 ${
              loading ? "animate-spin" : ""
            }`}
          />
        </button>
      </div>

      {/* MAIN OVERVIEW */}
      <div className="overflow-hidden rounded-xl border border-line-strong bg-bg-elev-2">
        <div className="flex items-center gap-3 p-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/10">
            <MapPinned className="h-4 w-4 text-orange-400" />
          </div>

          <div>
            <h3 className="text-base font-semibold text-fg">
              {siteName.replaceAll("_", " ")}
            </h3>
            <p className="text-xs text-fg-muted">
              Mars · Site research overview
            </p>
          </div>
        </div>

        {/* LARGE NASA IMAGE */}
        <div className="px-4">
          <div className="overflow-hidden rounded-xl border border-line bg-bg">
            {loading ? (
              <div className="flex aspect-video items-center justify-center text-sm text-fg-muted">
                Loading NASA imagery...
              </div>
            ) : hero ? (
              <a
                href={hero.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <NasaPhoto
                  image={hero}
                  className="aspect-video w-full"
                />
              </a>
            ) : (
              <div className="flex aspect-video items-center justify-center text-sm text-fg-muted">
                {error ?? "No matching NASA imagery found."}
              </div>
            )}
          </div>

          {hero && (
            <div className="mt-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-fg">
                  {hero.title}
                </p>

                <p className="mt-1 text-[11px] text-fg-muted">
                  {hero.credit}
                </p>
              </div>

              <a
                href={hero.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex shrink-0 items-center gap-1 text-xs text-blue-400 hover:underline"
              >
                NASA source
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>

        {/* LOCATION FACTS */}
        <div className="grid grid-cols-2 gap-2 p-4">
          {[
            [
              "LATITUDE",
              formatCoordinate(latitude, "N", "S"),
            ],
            [
              "LONGITUDE",
              formatCoordinate(longitude, "E", "W"),
            ],
            [
              "PREVIOUS MISSIONS",
              info?.mission ?? "Not available",
            ],
            [
              "TERRAIN",
              info?.terrain ?? "Not available",
            ],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-lg border border-line bg-bg p-3"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-faint">
                {label}
              </p>

              <p className="mt-1 text-xs font-medium leading-relaxed text-fg">
                {value}
              </p>
            </div>
          ))}
        </div>

        {/* GEOLOGICAL HIGHLIGHTS */}
        <div className="mx-4 border-t border-line py-4">
          <div className="mb-4 flex items-center gap-2">
            <Layers className="h-4 w-4 text-orange-400" />

            <h3 className="text-sm font-semibold text-fg">
              Geological Highlights
            </h3>
          </div>

          <div className="space-y-4">
            {highlights.map((highlight, index) => {
              const image = highlightImage(
                highlight,
                index
              );

              return (
                <div
                  key={highlight.title}
                  className="flex items-start gap-3 border-b border-line pb-4 last:border-0 last:pb-0"
                >
                  {/* SMALL TERRAIN IMAGE */}
                  <div className="h-24 w-28 shrink-0 overflow-hidden rounded-lg border border-line bg-bg">
                    {image ? (
                      <a
                        href={image.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={image.title}
                      >
                        <NasaPhoto
                          image={image}
                          className="h-24 w-28"
                        />
                      </a>
                    ) : (
                      <NasaPhoto className="h-24 w-28" />
                    )}
                  </div>

                  {/* GEOLOGICAL DESCRIPTION */}
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-semibold text-fg">
                      {highlight.title}
                    </h4>

                    <p className="mt-1 text-xs leading-relaxed text-fg-muted">
                      {highlight.description}
                    </p>

                    {image && (
                      <a
                        href={image.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-[11px] text-blue-400 hover:underline"
                      >
                        View NASA photo
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-3 text-[11px] text-fg-faint">
            NASA archive images provide visual context.
            Check the original image record before using
            imagery as evidence for a specific geological finding.
          </p>
        </div>

        {/* MORE NASA IMAGES */}
        <details className="group mx-4 border-t border-line py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold text-fg [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2">
              <Satellite className="h-4 w-4 text-orange-400" />
              More NASA imagery & sources
            </span>

            <ChevronDown className="h-4 w-4 text-fg-muted transition-transform group-open:rotate-180" />
          </summary>

          <div className="mt-4 grid grid-cols-2 gap-3">
            {additionalImages.slice(0, 6).map(
              (image) => (
                <a
                  key={image.id}
                  href={image.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0"
                >
                  <NasaPhoto
                    image={image}
                    className="aspect-video w-full rounded-lg"
                  />

                  <p className="mt-2 line-clamp-2 text-[11px] text-fg-muted">
                    {image.title}
                  </p>
                </a>
              )
            )}

            {!additionalImages.length && (
              <p className="col-span-2 text-xs text-fg-muted">
                No additional imagery available.
              </p>
            )}
          </div>
        </details>

        {/* RESEARCH DATASETS */}
        <details className="group mx-4 border-t border-line py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold text-fg [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2">
              <Database className="h-4 w-4 text-orange-400" />
              Scientific datasets & tools
            </span>

            <ChevronDown className="h-4 w-4 text-fg-muted transition-transform group-open:rotate-180" />
          </summary>

          <div className="mt-4 space-y-3">
            {[
              [
                "HiRISE high-resolution imagery",
                "https://www.uahirise.org/",
              ],
              [
                "NASA Planetary Data System",
                "https://ode.rsl.wustl.edu/mars/",
              ],
              [
                "JMARS planetary mapping",
                "https://jmars.asu.edu/",
              ],
              [
                "NASA Image Library",
                "https://images.nasa.gov/",
              ],
            ].map(([title, url]) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 text-xs text-blue-400 hover:underline"
              >
                {title}
                <ExternalLink className="h-3 w-3" />
              </a>
            ))}
          </div>
        </details>
      </div>
    </section>
  );
}
