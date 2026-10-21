// Contract layer: every piece of data that flows into a renderer is defined here.
// Hand-edited data lives in data/*.ts; fetched data lives in data/snapshot/*.json.
import { z } from "zod";

const Slug = z.string().regex(/^[a-z0-9-]+$/);
const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const Link = z.object({
  label: z.string().min(1),
  url: z.url(),
});
export type Link = z.infer<typeof Link>;

/** One frame on the contact sheet. */
export const Project = z.object({
  id: Slug,
  /** Display title, may be Japanese (e.g. ギガサイト便). */
  title: z.string().min(1),
  /** ASCII label used in HUD-style text (e.g. GIGA-SITE). */
  code: z.string().regex(/^[A-Z0-9 .\-]+$/),
  /** Japanese one-liner, short enough for a card (<= 34 chars). */
  summary: z.string().min(1).max(34),
  url: z.url(),
  repo: z.url().optional(),
  stack: z.array(z.string().min(1)).min(1).max(4),
  kind: z.enum(["product", "oss", "research"]),
  /** Short status chip, ASCII (e.g. LIVE, v1.0.0, DEMO). */
  status: z.string().regex(/^[A-Za-z0-9 .\-]+$/).max(10),
});
export type Project = z.infer<typeof Project>;

export const OssEntry = z.object({
  name: z.string().min(1),
  url: z.url(),
  summary: z.string().min(1),
  extra: Link.optional(),
});
export type OssEntry = z.infer<typeof OssEntry>;

export const OssCategory = z.object({
  title: z.string().min(1),
  entries: z.array(OssEntry).min(1),
});
export type OssCategory = z.infer<typeof OssCategory>;

/** External image badge kept from the previous README. */
export const Badge = z.object({
  alt: z.string().min(1),
  src: z.url(),
  href: z.url(),
});
export type Badge = z.infer<typeof Badge>;

/** A YOLO-style detection label shown on the hero. */
export const Detection = z.object({
  label: z.string().regex(/^[a-z_]+$/),
  confidence: z.number().min(0).max(1),
});
export type Detection = z.infer<typeof Detection>;

export const Product = z.object({
  name: z.string().min(1),
  summary: z.string().min(1),
  demo: z.url().optional(),
});
export type Product = z.infer<typeof Product>;

export const Profile = z.object({
  name: z.string().min(1),
  nameJa: z.string().min(1),
  handle: z.string().min(1),
  location: z.string().min(1),
  /** English role line for the hero (no titles or company names). */
  roleLine: z.string().min(1),
  /** Japanese intro paragraph. */
  intro: z.string().min(1),
  detections: z.array(Detection).min(1).max(4),
  now: z.array(z.string().min(1)).min(1).max(6),
  /** "最近つくっているもの" bullets; inline Markdown allowed. */
  recent: z.array(z.string().min(1)).min(1),
  products: z.array(Product),
  /** Contact-sheet frames, shown three per row: the length must fill whole rows. */
  featured: z
    .array(Project)
    .min(3)
    .max(15)
    .refine((projects) => projects.length % 3 === 0, "featured must fill whole rows of three"),
  oss: z.array(OssCategory).min(1),
  archived: z.array(OssEntry),
  badges: z.array(Badge),
  /** Where the hero image links to. */
  website: z.url(),
  zennUser: z.string().min(1),
  youtubeChannelId: z.string().regex(/^UC[\w-]{22}$/),
});
export type Profile = z.infer<typeof Profile>;

/** Hero photo. Metadata is copied by hand from EXIF; files are stored EXIF-stripped. */
export const PhotoMeta = z.object({
  id: Slug,
  file: z.string().regex(/^assets\/photos\/[a-z0-9-]+\.jpg$/),
  alt: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  camera: z.string().min(1),
  lens: z.string().min(1),
  focalLength: z.string().min(1),
  /** null when the original file carried no exposure data; render as "—". */
  aperture: z.string().nullable(),
  shutter: z.string().nullable(),
  iso: z.number().int().positive().nullable(),
  /** Detection label for the photo's subject, e.g. "building". */
  subject: z.string().regex(/^[a-z_]+$/),
});
export type PhotoMeta = z.infer<typeof PhotoMeta>;

// ---------------------------------------------------------------------------
// Snapshots (written by src/fetch, committed so builds are reproducible)
// ---------------------------------------------------------------------------

export const LanguageStat = z.object({
  name: z.string().min(1),
  color: HexColor,
  bytes: z.number().int().nonnegative(),
});
export type LanguageStat = z.infer<typeof LanguageStat>;

export const ContributionDay = z.object({
  date: z.iso.date(),
  count: z.number().int().nonnegative(),
  level: z.number().int().min(0).max(4),
});
export type ContributionDay = z.infer<typeof ContributionDay>;

export const GitHubSnapshot = z.object({
  fetchedAt: z.iso.datetime(),
  login: z.string().min(1),
  totals: z.object({
    publicRepos: z.number().int().nonnegative(),
    stars: z.number().int().nonnegative(),
    followers: z.number().int().nonnegative(),
    /** The following are for the last 365 days. */
    commits: z.number().int().nonnegative(),
    pullRequests: z.number().int().nonnegative(),
    issues: z.number().int().nonnegative(),
    reviews: z.number().int().nonnegative(),
    contributions: z.number().int().nonnegative(),
  }),
  /** Sorted by bytes, descending. Owned, non-fork, non-archived public repos. */
  languages: z.array(LanguageStat),
  contributions: z.object({
    total: z.number().int().nonnegative(),
    weeks: z.array(z.object({ days: z.array(ContributionDay).min(1).max(7) })).min(1),
  }),
});
export type GitHubSnapshot = z.infer<typeof GitHubSnapshot>;

export const FeedItem = z.object({
  title: z.string().min(1),
  url: z.url(),
  publishedAt: z.iso.datetime({ offset: true }),
});
export type FeedItem = z.infer<typeof FeedItem>;

/** A regular (non-Short) upload, ranked by views. */
export const VideoItem = z.object({
  id: z.string().regex(/^[\w-]{11}$/),
  title: z.string().min(1),
  url: z.url(),
  thumbnail: z.url(),
  /** As YouTube lists it: exact under 10,000, rounded above (e.g. 71000). */
  viewCount: z.number().int().nonnegative(),
});
export type VideoItem = z.infer<typeof VideoItem>;

export const FeedSnapshot = z.object({
  fetchedAt: z.iso.datetime(),
  /** Newest Zenn articles. */
  zenn: z.array(FeedItem),
  /** Most viewed regular videos, highest first. */
  youtube: z.array(VideoItem),
});
export type FeedSnapshot = z.infer<typeof FeedSnapshot>;
