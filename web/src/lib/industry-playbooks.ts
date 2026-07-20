/**
 * Lightweight industry opportunity playbooks. Recommendation FRAMEWORKS for a
 * category — never claims about a specific lead. Angie uses the matched
 * playbook as grounded input when building a strategy; the model still has to
 * separate facts from ideas and flag what needs research.
 */

export const PLAYBOOK_VERSION = "ma-playbooks-v1";

export type IndustryPlaybook = {
  key: string;
  label: string;
  /** Substrings matched against the lead's category (first match wins). */
  match: string[];
  commonGoals: string[];
  highValueServices: string[];
  commonChallenges: string[];
  relevantServiceIds: string[];
  organicContentThemes: string[];
  paidCampaignIdeas: string[];
  leadGenIdeas: string[];
  trustBuildingContent: string[];
  outreachAngles: string[];
  evidenceNeeded: string[];
};

export const INDUSTRY_PLAYBOOKS: IndustryPlaybook[] = [
  {
    key: "dental-implants",
    label: "Dental implants & periodontics",
    match: ["implant", "periodont"],
    commonGoals: ["consultation bookings", "implant case growth", "patient education", "referral relationships", "trust building", "local visibility"],
    highValueServices: ["Paid Social Advertising", "Landing Pages", "Video Content", "Lead Funnels"],
    commonChallenges: ["high-consideration purchase", "patient anxiety", "long decision cycle"],
    relevantServiceIds: ["paid-social", "landing-pages", "video-content", "lead-funnels", "google-ads", "email-marketing"],
    organicContentThemes: ["patient journey", "implant FAQ", "before/after (with consent)", "myth-busting"],
    paidCampaignIdeas: ["Implant Confidence education series", "review-driven social ads", "consultation offer campaign"],
    leadGenIdeas: ["consultation landing page", "downloadable implant preparation guide", "general-dentist referral campaign"],
    trustBuildingContent: ["doctor credentials", "patient testimonials", "technology explainer"],
    outreachAngles: ["Implants are high-value and education-heavy — a good fit for consult-focused campaigns."],
    evidenceNeeded: ["current consultation flow", "whether they run any ads", "website consult path"],
  },
  {
    key: "orthodontists",
    label: "Orthodontists",
    match: ["orthodont"],
    commonGoals: ["new starts", "family/teen patients", "adult clear-aligner growth", "local visibility"],
    highValueServices: ["Organic Social Media", "Paid Social Advertising", "Landing Pages"],
    commonChallenges: ["competitive local market", "aligner brand competition"],
    relevantServiceIds: ["organic-social", "paid-social", "landing-pages", "website-design", "review-campaigns"],
    organicContentThemes: ["treatment transformations", "teen/adult options", "day-in-the-life"],
    paidCampaignIdeas: ["free consult / smile assessment", "adult clear-aligner campaign", "back-to-school starts"],
    leadGenIdeas: ["smile assessment landing page", "seasonal starts offer"],
    trustBuildingContent: ["before/after", "patient stories", "flexible-payment explainer"],
    outreachAngles: ["Visual, transformation-driven results tend to do well on social."],
    evidenceNeeded: ["which treatments to feature", "current social presence"],
  },
  {
    key: "cosmetic-dentists",
    label: "Cosmetic dentists",
    match: ["cosmetic dentist", "cosmetic dental"],
    commonGoals: ["high-value case growth", "premium positioning", "smile-makeover bookings"],
    highValueServices: ["Branding", "Organic Social Media", "Paid Social Advertising", "Photography"],
    commonChallenges: ["premium positioning", "showing results tastefully"],
    relevantServiceIds: ["branding", "organic-social", "paid-social", "photography", "landing-pages"],
    organicContentThemes: ["smile makeovers", "veneer education", "process transparency"],
    paidCampaignIdeas: ["smile-makeover campaign", "veneer education series"],
    leadGenIdeas: ["smile consultation landing page", "makeover gallery"],
    trustBuildingContent: ["before/after galleries", "artistry/process content"],
    outreachAngles: ["Premium, visual work rewards strong branding and photography."],
    evidenceNeeded: ["consent for imagery", "current brand presentation"],
  },
  {
    key: "dentists",
    label: "General dentists",
    match: ["dentist", "dental"],
    commonGoals: ["new patient growth", "reactivate patients", "local trust", "reviews"],
    highValueServices: ["Website Design", "Review Campaigns", "SEO Content", "Google Ads"],
    commonChallenges: ["local competition", "insurance-driven shopping"],
    relevantServiceIds: ["website-design", "review-campaigns", "seo-content", "google-ads", "email-marketing", "local-awareness"],
    organicContentThemes: ["team & office", "preventive tips", "new-patient welcome"],
    paidCampaignIdeas: ["new-patient special", "local awareness push"],
    leadGenIdeas: ["new-patient landing page", "reactivation email campaign"],
    trustBuildingContent: ["team intros", "patient reviews", "office tour"],
    outreachAngles: ["Strong reviews + a clean site convert local searchers well."],
    evidenceNeeded: ["current site state", "review volume/platforms"],
  },
  {
    key: "chiropractors",
    label: "Chiropractors",
    match: ["chiropract"],
    commonGoals: ["new patient volume", "local awareness", "recurring visits", "reviews"],
    highValueServices: ["Local Awareness Campaigns", "Review Campaigns", "Organic Social Media", "Google Ads"],
    commonChallenges: ["education on value", "recurring-care model"],
    relevantServiceIds: ["local-awareness", "review-campaigns", "organic-social", "google-ads", "website-optimization"],
    organicContentThemes: ["pain-relief education", "adjustment demos", "posture tips"],
    paidCampaignIdeas: ["new-patient exam offer", "local awareness campaign"],
    leadGenIdeas: ["exam-offer landing page", "wellness workshop"],
    trustBuildingContent: ["patient results", "technique explainers"],
    outreachAngles: ["Local awareness + reviews compound for neighborhood practices."],
    evidenceNeeded: ["service area", "current ad activity"],
  },
  {
    key: "medical-spas",
    label: "Medical spas",
    match: ["medical spa", "medspa", "med spa", "aesthetic"],
    commonGoals: ["treatment bookings", "premium brand", "membership growth", "social following"],
    highValueServices: ["Paid Social Advertising", "Organic Social Media", "Branding", "Lead Funnels"],
    commonChallenges: ["competitive aesthetics market", "compliance in claims"],
    relevantServiceIds: ["paid-social", "organic-social", "branding", "lead-funnels", "photography", "email-marketing"],
    organicContentThemes: ["treatment education", "results (with consent)", "membership perks"],
    paidCampaignIdeas: ["seasonal treatment promo", "membership launch", "new-client offer"],
    leadGenIdeas: ["treatment offer landing page", "membership funnel"],
    trustBuildingContent: ["provider credentials", "safety/process content", "testimonials"],
    outreachAngles: ["Visual, high-repeat services fit paid + organic social well."],
    evidenceNeeded: ["compliance constraints", "current social + offers"],
  },
  {
    key: "senior-care",
    label: "Senior care agencies",
    match: ["senior care", "assisted living", "home care"],
    commonGoals: ["family inquiries", "referral relationships", "trust", "local visibility"],
    highValueServices: ["Website Design", "Google Ads", "Local Awareness Campaigns", "Print Materials"],
    commonChallenges: ["family (not patient) decision-makers", "trust-critical"],
    relevantServiceIds: ["website-design", "google-ads", "local-awareness", "print-materials", "seo-content"],
    organicContentThemes: ["caregiver spotlights", "family resources", "care explainers"],
    paidCampaignIdeas: ["family-inquiry search campaign", "local referral awareness"],
    leadGenIdeas: ["inquiry landing page", "downloadable family care guide"],
    trustBuildingContent: ["caregiver credentials", "family testimonials", "care standards"],
    outreachAngles: ["Families search when they need help fast — search + a trustworthy site fit."],
    evidenceNeeded: ["service area", "referral sources", "current site"],
  },
];

/** Returns the best-matching playbook for a lead category, or null. */
export function playbookForCategory(category?: string): IndustryPlaybook | null {
  const c = (category ?? "").trim().toLowerCase();
  if (!c) {
    return null;
  }
  // Order matters: specific playbooks (implants, cosmetic) sit before general dental.
  for (const pb of INDUSTRY_PLAYBOOKS) {
    if (pb.match.some((m) => c.includes(m))) {
      return pb;
    }
  }
  return null;
}
