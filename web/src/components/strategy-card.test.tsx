/* @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { StrategyCard, Strategy } from "./strategy-card";

afterEach(cleanup);

const strategy: Strategy = {
  opportunitySnapshot: "Good reviews, clear demand, worth a conversation.",
  fixFirst: ["Tighten the intro offer", "Follow up faster"],
  whyItMatters: "These are busy practices that value time.",
  recommendedOffer: "The starter reputation package.",
  conversationStarter: "Your reviews are doing the heavy lifting here.",
  watchOuts: ["Website quality not verified"],
  nextStep: "Call the top three this week.",
};

describe("StrategyCard", () => {
  it("renders all populated sections", () => {
    render(<StrategyCard strategy={strategy} />);
    expect(screen.getByText("Opportunity Snapshot")).toBeTruthy();
    expect(screen.getByText("What We'd Fix First")).toBeTruthy();
    expect(screen.getByText("Why This Matters")).toBeTruthy();
    expect(screen.getByText("Recommended Offer")).toBeTruthy();
    expect(screen.getByText("Conversation Starter")).toBeTruthy();
    expect(screen.getByText("Watch-Outs")).toBeTruthy();
    expect(screen.getByText("Suggested Next Step")).toBeTruthy();
  });

  it("renders fix-first items as a list", () => {
    render(<StrategyCard strategy={strategy} />);
    expect(screen.getByText("Tighten the intro offer")).toBeTruthy();
    expect(screen.getByText("Follow up faster")).toBeTruthy();
  });

  it("omits empty sections", () => {
    render(
      <StrategyCard
        strategy={{ ...strategy, whyItMatters: "", watchOuts: [], recommendedOffer: "" }}
      />,
    );
    expect(screen.queryByText("Why This Matters")).toBeNull();
    expect(screen.queryByText("Watch-Outs")).toBeNull();
    expect(screen.queryByText("Recommended Offer")).toBeNull();
  });
});
