/* @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { OutreachCard, DraftedEmail } from "./outreach-card";

afterEach(cleanup);

const email: DraftedEmail = {
  leadId: "L1",
  businessName: "Bright Smiles",
  subject: "A quick idea for Bright Smiles",
  previewText: "Your reviews are doing the heavy lifting",
  body: "Hi there — your reviews are strong. Worth a quick chat about the website.",
  cta: "Open to a 15-minute call next week?",
  toneLabel: "Warm & direct",
};

describe("OutreachCard", () => {
  it("renders subject, body, cta, tone, and preview", () => {
    render(<OutreachCard email={email} busy={false} onRegenerate={() => {}} />);
    expect((screen.getByDisplayValue(email.subject) as HTMLInputElement).value).toBe(email.subject);
    expect(screen.getByDisplayValue(email.body)).toBeTruthy();
    expect(screen.getByText(/Warm & direct/)).toBeTruthy();
    expect(screen.getByText(/A 15-minute call|Open to a 15-minute/)).toBeTruthy();
    expect(screen.getByText(/Preview:/)).toBeTruthy();
  });

  it("supports inline editing of the subject and body", () => {
    render(<OutreachCard email={email} busy={false} onRegenerate={() => {}} />);
    const subject = screen.getByDisplayValue(email.subject) as HTMLInputElement;
    fireEvent.change(subject, { target: { value: "New subject" } });
    expect(subject.value).toBe("New subject");

    const body = screen.getByDisplayValue(email.body) as HTMLTextAreaElement;
    fireEvent.change(body, { target: { value: "New body" } });
    expect(body.value).toBe("New body");
  });

  it("fires the tone/focus controls with the right modifier", () => {
    const onRegenerate = vi.fn();
    render(<OutreachCard email={email} busy={false} onRegenerate={onRegenerate} />);

    fireEvent.click(screen.getByText("Warmer"));
    fireEvent.click(screen.getByText("Shorter"));
    fireEvent.click(screen.getByText("More direct"));
    fireEvent.click(screen.getByText("Focus: website"));
    fireEvent.click(screen.getByText("Focus: branding"));
    fireEvent.click(screen.getByText("Focus: reviews"));
    fireEvent.click(screen.getByText("Regenerate"));

    const modifiers = onRegenerate.mock.calls.map((c) => c[1]);
    expect(modifiers).toEqual([
      "warmer",
      "shorter",
      "direct",
      "focus_website",
      "focus_branding",
      "focus_reviews",
      "regenerate",
    ]);
    // Every call targets this lead.
    expect(onRegenerate.mock.calls.every((c) => c[0] === "L1")).toBe(true);
  });

  it("disables controls while busy", () => {
    render(<OutreachCard email={email} busy onRegenerate={() => {}} />);
    expect((screen.getByText("Warmer") as HTMLButtonElement).disabled).toBe(true);
  });
});
