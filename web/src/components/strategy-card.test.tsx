/* @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { StrategyCard, Strategy } from "./strategy-card";

afterEach(cleanup);

const strategy: Strategy = {
  depth: "full",
  opportunitySnapshot: "Good reviews, clear demand, worth a conversation.",
  whatWeKnow: ["Rating 4.8 with 210 reviews", "No website on file"],
  serviceMatches: [
    { name: "Website Design", why: "No site yet — a clear opening" },
    { name: "Paid Social Advertising", why: "High-value services fit paid social" },
  ],
  marketingOpportunities: ["organic social", "paid ads", "website"],
  campaignIdeas: [
    {
      name: "Implant Confidence series",
      concept: "Education-led social campaign",
      audience: "Adults considering implants",
      channel: "Instagram",
      goal: "consult requests",
      deliverables: ["reels", "landing page"],
    },
  ],
  outreachApproach: { channel: "Instagram", reasoning: "Visual, education-heavy service" },
  conversationStarter: "Your reviews are doing the heavy lifting here.",
  researchNext: ["Confirm the best decision-maker and preferred contact method"],
  nextStep: "Send a short intro DM this week.",
  thirtyDayPlan: [{ week: "Week 1", focus: "Set up the consult landing page" }],
};

describe("StrategyCard", () => {
  it("renders the always-visible sections (facts vs. ideas stay separate)", () => {
    render(<StrategyCard strategy={strategy} />);
    expect(screen.getByText("Opportunity Snapshot")).toBeTruthy();
    expect(screen.getByText("What We Know")).toBeTruthy();
    expect(screen.getByText("Best Service Matches")).toBeTruthy();
    expect(screen.getByText("Marketing Opportunities")).toBeTruthy();
    expect(screen.getByText("Website Design")).toBeTruthy();
    expect(screen.getByText("No website on file")).toBeTruthy();
  });

  it("reveals campaigns / research / 30-day plan when expanded", () => {
    render(<StrategyCard strategy={strategy} />);
    expect(screen.queryByText("Campaign Ideas")).toBeNull();
    fireEvent.click(screen.getByText(/Campaigns, outreach/));
    expect(screen.getByText("Campaign Ideas")).toBeTruthy();
    expect(screen.getByText("Implant Confidence series")).toBeTruthy();
    expect(screen.getByText("What to Research Next")).toBeTruthy();
    expect(screen.getByText("30-Day Plan")).toBeTruthy();
  });

  it("fires follow-up actions with the right focus/depth", () => {
    const onAction = vi.fn();
    render(<StrategyCard strategy={strategy} onAction={onAction} />);
    fireEvent.click(screen.getByText("Focus organic"));
    fireEvent.click(screen.getByText("Focus paid ads"));
    fireEvent.click(screen.getByText("30-day plan"));
    fireEvent.click(screen.getByText("Draft email"));
    expect(onAction.mock.calls.map((c) => c[0])).toEqual([
      { kind: "focus", value: "organic_social" },
      { kind: "focus", value: "paid_ads" },
      { kind: "depth", value: "thirty_day" },
      { kind: "email" },
    ]);
  });

  it("omits sections with no content", () => {
    render(
      <StrategyCard
        strategy={{ ...strategy, whatWeKnow: [], serviceMatches: [], marketingOpportunities: [] }}
      />,
    );
    expect(screen.queryByText("What We Know")).toBeNull();
    expect(screen.queryByText("Best Service Matches")).toBeNull();
    expect(screen.queryByText("Marketing Opportunities")).toBeNull();
    expect(screen.getByText("Opportunity Snapshot")).toBeTruthy();
  });
});
