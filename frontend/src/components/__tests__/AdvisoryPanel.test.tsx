import "@testing-library/jest-dom";
import { render, screen, waitFor, act } from "@testing-library/react";
import AdvisoryPanel from "../AdvisoryPanel";

describe("AdvisoryPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders loading state initially", async () => {
    // Keep promise pending during initial render assertion
    let resolveFetch: any;
    global.fetch = jest.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );

    const { container } = render(
      <AdvisoryPanel 
        districtName="Sylhet" 
        hazardType="Flood" 
        severityScore={0.85} 
        confidence={0.9} 
      />
    );

    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();

    // Clean up by resolving before test ends
    await act(async () => {
      resolveFetch({
        ok: true,
        json: async () => ({
          urgency_tier: "HIGH_ALERT",
          risk_assessment: "Severe risk of flooding.",
          immediate_actions_48h: ["Evacuate low-lying areas"],
        }),
      });
    });
  });

  it("renders advisory content after fetch completes", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        urgency_tier: "HIGH_ALERT",
        risk_assessment: "Severe risk of flooding.",
        immediate_actions_48h: ["Evacuate low-lying areas", "Secure livestock"],
      }),
    });

    render(
      <AdvisoryPanel 
        districtName="Sylhet" 
        hazardType="Flood" 
        severityScore={0.85} 
        confidence={0.9} 
      />
    );

    await waitFor(() => {
      // StructuredAdvisoryRenderer renders the first sentence of
      // risk_assessment as the issue headline (period intentionally dropped).
      // The headline appears in more than one node (icon split across spans),
      // so assert on presence rather than uniqueness.
      expect(screen.getAllByText(/Severe risk of flooding/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/Evacuate low-lying areas/i)).toBeInTheDocument();
      expect(screen.getByText(/Secure livestock/i)).toBeInTheDocument();
    });
  });
});
