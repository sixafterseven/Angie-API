/**
 * Micah Amari service catalog — the versioned, editable source of truth Angie
 * uses to recommend services in a strategy. Kept as data (not baked into
 * prompts) so it can be tuned without touching the generation logic, and so
 * service matching stays deterministic and testable.
 */

export const SERVICE_CATALOG_VERSION = "ma-services-v1";

export type Service = {
  serviceId: string;
  name: string;
  description: string;
  /** Business types this service tends to fit (matched against lead category). */
  idealBusinessTypes: string[];
  /** Signals in stored lead data that make this service more relevant. */
  usefulSignals: Array<"noWebsite" | "hasWebsite" | "lowReviews" | "manyReviews" | "lowRating" | "strongRating" | "hasPhone" | "hasEmail">;
  /** Signals that make this service a poorer fit. */
  disqualifyingSignals: Array<"noWebsite" | "hasWebsite">;
  commonGoals: string[];
  possibleDeliverables: string[];
  suggestedOutreachAngles: string[];
  /** What must be verified before making a specific claim tied to this service. */
  evidenceRequired: string[];
};

export const SERVICE_CATALOG: Service[] = [
  {
    serviceId: "website-design",
    name: "Website Design",
    description: "A modern, conversion-minded website that reflects the practice.",
    idealBusinessTypes: ["dentist", "orthodontist", "medical spa", "chiropractor", "senior care"],
    usefulSignals: ["noWebsite", "strongRating"],
    disqualifyingSignals: [],
    commonGoals: ["look credible online", "turn visitors into booked consults"],
    possibleDeliverables: ["multi-page site", "booking flow", "mobile-first design"],
    suggestedOutreachAngles: ["Their reviews are strong; the site could match that polish."],
    evidenceRequired: ["Confirm whether a current site exists and its state."],
  },
  {
    serviceId: "landing-pages",
    name: "Landing Pages",
    description: "Focused single-purpose pages for a specific service or campaign.",
    idealBusinessTypes: ["dental implant", "orthodontist", "medical spa", "cosmetic dentist"],
    usefulSignals: ["hasWebsite", "manyReviews"],
    disqualifyingSignals: [],
    commonGoals: ["capture consult requests for one high-value service"],
    possibleDeliverables: ["service landing page", "lead form", "offer section"],
    suggestedOutreachAngles: ["A dedicated implant/consult page could concentrate demand."],
    evidenceRequired: ["Check which high-value service to feature."],
  },
  {
    serviceId: "website-optimization",
    name: "Website Optimization",
    description: "Improve an existing site's clarity, speed, and conversion paths.",
    idealBusinessTypes: ["dentist", "orthodontist", "medical spa", "chiropractor"],
    usefulSignals: ["hasWebsite", "manyReviews"],
    disqualifyingSignals: ["noWebsite"],
    commonGoals: ["get more from existing traffic"],
    possibleDeliverables: ["conversion review", "page speed pass", "clearer CTAs"],
    suggestedOutreachAngles: ["The site may be worth reviewing for conversion opportunities."],
    evidenceRequired: ["A website review is needed before naming specific issues."],
  },
  {
    serviceId: "branding",
    name: "Branding",
    description: "Identity, logo, and visual system that feels consistent and premium.",
    idealBusinessTypes: ["medical spa", "cosmetic dentist", "orthodontist"],
    usefulSignals: ["strongRating"],
    disqualifyingSignals: [],
    commonGoals: ["look premium", "stand out locally"],
    possibleDeliverables: ["logo suite", "brand guide", "color/type system"],
    suggestedOutreachAngles: ["Presentation can be worth tightening for a premium feel."],
    evidenceRequired: ["Review current branding before proposing a refresh."],
  },
  {
    serviceId: "graphic-design",
    name: "Graphic Design",
    description: "On-brand graphics for social, print, and campaigns.",
    idealBusinessTypes: ["medical spa", "dentist", "chiropractor"],
    usefulSignals: [],
    disqualifyingSignals: [],
    commonGoals: ["consistent, polished creative"],
    possibleDeliverables: ["social templates", "flyers", "ad creative"],
    suggestedOutreachAngles: ["Cohesive creative can make everything look more put-together."],
    evidenceRequired: [],
  },
  {
    serviceId: "organic-social",
    name: "Organic Social Media",
    description: "Ongoing content and community building on Instagram/Facebook.",
    idealBusinessTypes: ["medical spa", "cosmetic dentist", "orthodontist", "chiropractor"],
    usefulSignals: ["manyReviews", "strongRating"],
    disqualifyingSignals: [],
    commonGoals: ["stay visible", "build trust", "showcase results"],
    possibleDeliverables: ["content calendar", "monthly posts", "reels/stories"],
    suggestedOutreachAngles: ["Visual practices often do well with a steady social presence."],
    evidenceRequired: ["Review current social profiles before critiquing them."],
  },
  {
    serviceId: "paid-social",
    name: "Paid Social Advertising",
    description: "Targeted Instagram/Facebook campaigns for high-value services.",
    idealBusinessTypes: ["dental implant", "medical spa", "cosmetic dentist", "orthodontist"],
    usefulSignals: ["strongRating", "manyReviews"],
    disqualifyingSignals: [],
    commonGoals: ["generate consult requests", "promote a specific service"],
    possibleDeliverables: ["campaign creative", "audience setup", "landing page"],
    suggestedOutreachAngles: ["High-value, education-heavy services can be a fit for paid social."],
    evidenceRequired: ["Confirm the service focus and ad readiness before specifics."],
  },
  {
    serviceId: "google-ads",
    name: "Google Ads",
    description: "Search campaigns capturing high-intent local demand.",
    idealBusinessTypes: ["dental implant", "orthodontist", "chiropractor", "senior care"],
    usefulSignals: ["hasWebsite"],
    disqualifyingSignals: ["noWebsite"],
    commonGoals: ["capture people already searching"],
    possibleDeliverables: ["search campaign", "keyword plan", "call tracking"],
    suggestedOutreachAngles: ["People search for these services locally; ads can catch that intent."],
    evidenceRequired: ["A landing destination is needed before running search ads."],
  },
  {
    serviceId: "seo-content",
    name: "SEO Content",
    description: "Educational content that improves local/organic visibility.",
    idealBusinessTypes: ["dentist", "orthodontist", "dental implant", "chiropractor"],
    usefulSignals: ["hasWebsite"],
    disqualifyingSignals: ["noWebsite"],
    commonGoals: ["show up for local searches over time"],
    possibleDeliverables: ["service pages", "FAQ content", "blog cadence"],
    suggestedOutreachAngles: ["Education-heavy services reward good content."],
    evidenceRequired: ["Review current site content and rankings."],
  },
  {
    serviceId: "email-marketing",
    name: "Email Marketing",
    description: "Nurture and reactivation emails for leads and patients.",
    idealBusinessTypes: ["medical spa", "orthodontist", "dentist", "senior care"],
    usefulSignals: ["hasEmail", "manyReviews"],
    disqualifyingSignals: [],
    commonGoals: ["nurture undecided leads", "reactivate past patients"],
    possibleDeliverables: ["nurture sequence", "monthly newsletter", "offer emails"],
    suggestedOutreachAngles: ["A simple nurture flow can recover undecided consults."],
    evidenceRequired: ["Confirm they collect emails and have a list."],
  },
  {
    serviceId: "lead-funnels",
    name: "Lead Funnels",
    description: "End-to-end capture-to-booking flows for a service line.",
    idealBusinessTypes: ["dental implant", "medical spa", "cosmetic dentist"],
    usefulSignals: ["strongRating"],
    disqualifyingSignals: [],
    commonGoals: ["turn interest into booked consults reliably"],
    possibleDeliverables: ["landing page", "lead form", "follow-up automation"],
    suggestedOutreachAngles: ["A guided funnel can smooth the path to a booked consult."],
    evidenceRequired: ["Confirm the target service and intake process."],
  },
  {
    serviceId: "photography",
    name: "Photography",
    description: "Professional practice, team, and results photography.",
    idealBusinessTypes: ["medical spa", "cosmetic dentist", "orthodontist"],
    usefulSignals: [],
    disqualifyingSignals: [],
    commonGoals: ["authentic, premium visuals"],
    possibleDeliverables: ["team shoot", "space photos", "before/after (with consent)"],
    suggestedOutreachAngles: ["Real photos tend to outperform stock for trust."],
    evidenceRequired: ["Confirm consent/compliance for any patient imagery."],
  },
  {
    serviceId: "video-content",
    name: "Video Content",
    description: "Short educational and trust-building video.",
    idealBusinessTypes: ["dental implant", "orthodontist", "medical spa"],
    usefulSignals: [],
    disqualifyingSignals: [],
    commonGoals: ["explain procedures", "build trust", "feed social"],
    possibleDeliverables: ["FAQ video series", "procedure explainers", "testimonials"],
    suggestedOutreachAngles: ["Education-heavy procedures explain well on video."],
    evidenceRequired: ["Confirm willingness to appear on camera / consent."],
  },
  {
    serviceId: "review-campaigns",
    name: "Review Campaigns",
    description: "Systematic review generation and reputation building.",
    idealBusinessTypes: ["dentist", "chiropractor", "medical spa", "orthodontist"],
    usefulSignals: ["lowReviews", "strongRating"],
    disqualifyingSignals: [],
    commonGoals: ["build review volume", "strengthen local trust"],
    possibleDeliverables: ["review request flow", "reply templates", "showcase assets"],
    suggestedOutreachAngles: ["A steady review flow compounds local trust."],
    evidenceRequired: ["Confirm current review volume and platforms."],
  },
  {
    serviceId: "print-materials",
    name: "Print Materials",
    description: "In-office and mailed print that matches the brand.",
    idealBusinessTypes: ["senior care", "dentist", "chiropractor"],
    usefulSignals: [],
    disqualifyingSignals: [],
    commonGoals: ["support referrals and in-office conversion"],
    possibleDeliverables: ["referral cards", "brochures", "mailers"],
    suggestedOutreachAngles: ["Print can support referral and local-awareness efforts."],
    evidenceRequired: [],
  },
  {
    serviceId: "campaign-creative",
    name: "Campaign Creative",
    description: "Concept-to-asset creative for a themed marketing campaign.",
    idealBusinessTypes: ["dental implant", "medical spa", "orthodontist", "cosmetic dentist"],
    usefulSignals: ["strongRating"],
    disqualifyingSignals: [],
    commonGoals: ["launch a memorable, themed push"],
    possibleDeliverables: ["campaign concept", "creative set", "landing assets"],
    suggestedOutreachAngles: ["A themed campaign can make a service launch land."],
    evidenceRequired: ["Confirm the featured service and offer."],
  },
  {
    serviceId: "local-awareness",
    name: "Local Awareness Campaigns",
    description: "Geo-targeted campaigns to grow local recognition.",
    idealBusinessTypes: ["chiropractor", "dentist", "senior care", "medical spa"],
    usefulSignals: ["lowReviews"],
    disqualifyingSignals: [],
    commonGoals: ["be top-of-mind locally"],
    possibleDeliverables: ["geo social ads", "local partnerships", "community content"],
    suggestedOutreachAngles: ["Local recognition compounds for neighborhood practices."],
    evidenceRequired: ["Confirm service area and current local footprint."],
  },
  {
    serviceId: "marketing-strategy",
    name: "Marketing Strategy",
    description: "A prioritized roadmap tying the pieces together.",
    idealBusinessTypes: ["dentist", "orthodontist", "medical spa", "chiropractor", "senior care"],
    usefulSignals: [],
    disqualifyingSignals: [],
    commonGoals: ["know what to do first and why"],
    possibleDeliverables: ["priority roadmap", "channel plan", "30-day plan"],
    suggestedOutreachAngles: ["A clear first-90-days plan can de-risk the decision."],
    evidenceRequired: [],
  },
];

export function getService(serviceId: string): Service | undefined {
  return SERVICE_CATALOG.find((s) => s.serviceId === serviceId);
}
