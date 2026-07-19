/**
 * Micah Amari voice — shared microcopy so buttons, empty states, and loading
 * messages read consistently across the app. Warm, clever, useful; restrained
 * humor, clarity first. Import these rather than hardcoding strings per screen.
 */

export const BRAND = {
  product: "Angie OS",
  company: "Micah Amari",
} as const;

/** Loading lines — pick with loadingLine(seed) for light variety. */
const LOADING_LINES = [
  "Angie's sorting through it.",
  "Angie's pulling the good ones.",
  "Angie's reading the room.",
  "Angie's lining these up.",
];

export function loadingLine(seed = 0): string {
  return LOADING_LINES[Math.abs(seed) % LOADING_LINES.length];
}

export const COPY = {
  askPlaceholder: "Ask Angie for leads — e.g. \"orthodontists in Atlanta\"",
  askButton: "Ask Angie",
  askButtonBusy: "Angie's on it…",
  emptyResults:
    "Nothing useful turned up with those filters. Let's loosen the net a little.",
  emptyResultsHint: "Try a broader location or industry — or drop a filter.",
  noSearchYet: "Ask Angie a question to pull up leads.",
  download: "Download this list",
  buildStrategy: "Build the game plan",
  writeEmail: "Draft outreach",
  buildCallList: "Build a call list",
  newConversation: "Start fresh",
  genericError: "Angie hit a snag. Give it another go.",
} as const;
