/**
 * Component unit tests (jsdom): the white-screen regression suite.
 *
 * Proves two invariants:
 *  1. ErrorBoundary contains a crashing child and renders a real fallback.
 *  2. CareerPredictor, given the EXACT malformed DB shape that crashed
 *     production, renders its degraded state instead of throwing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import React from "react";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";

// ---------------------------------------------------------------------------
// ErrorBoundary behavior
// ---------------------------------------------------------------------------

function Bomb({ throwOnRender }: { throwOnRender: boolean }) {
  if (throwOnRender) throw new Error("SYNTHETIC_TEST_BOMB");
  return <div>child-ok</div>;
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    // React logs caught errors to console.error; silence for clean output.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders children untouched when no error occurs", () => {
    render(
      <ErrorBoundary label="Test Widget">
        <Bomb throwOnRender={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText("child-ok")).toBeTruthy();
  });

  it("CONTAINS a render crash instead of propagating (white-screen invariant)", () => {
    render(
      <ErrorBoundary label="Test Widget">
        <Bomb throwOnRender={true} />
      </ErrorBoundary>
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(/Test Widget failed to render/)).toBeTruthy();
    expect(screen.getByText(/SYNTHETIC_TEST_BOMB/)).toBeTruthy();
  });

  it("Retry resets the boundary and re-mounts children (real recovery path)", () => {
    const { rerender } = render(
      <ErrorBoundary label="Test Widget">
        <Bomb throwOnRender={true} />
      </ErrorBoundary>
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    rerender(
      <ErrorBoundary label="Test Widget">
        <Bomb throwOnRender={false} />
      </ErrorBoundary>
    );
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(screen.getByText("child-ok")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// CareerPredictor crash regression (the actual production defect)
// ---------------------------------------------------------------------------

// Supabase module mock: returns the EXACT production poison row —
// ai_career_prediction missing promotion_verdict → previously
// undefined.includes → white screen.
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({
              data: {
                id: "00000000-0000-0000-0000-000000000000",
                name: "E2E Regression Employee",
                role: "employee",
                ai_career_prediction: {
                  raise_verdict: "Deserves Raise",
                  layoff_risk: 15,
                  dry_promotion_chance: 85,
                  training_required: false,
                  // promotion_verdict DELIBERATELY ABSENT
                },
              },
              error: null,
            }),
        }),
      }),
    }),
  },
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/lib/ai", () => ({
  callCorporateAI: vi.fn(),
}));

// Recharts stub: ResponsiveContainer needs layout metrics absent in jsdom.
// Explicit components (no Proxy) — a Proxy-based module mock hung collection.
// The stub is defined INSIDE the factory: vi.mock factories are hoisted above
// module top-level declarations and cannot reference them.
vi.mock("recharts", () => {
  const Stub = ({ children }: { children?: React.ReactNode }) =>
    React.createElement("div", { "data-stub": true }, children ?? null);
  return {
    LineChart: Stub,
    Line: Stub,
    BarChart: Stub,
    Bar: Stub,
    PieChart: Stub,
    Pie: Stub,
    Cell: Stub,
    XAxis: Stub,
    YAxis: Stub,
    Tooltip: Stub,
    ResponsiveContainer: Stub,
    CartesianGrid: Stub,
    Legend: Stub,
  };
});

import { CareerPredictor } from "@/components/dashboard/CareerPredictor";

describe("CareerPredictor — white-screen regression", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the degraded state for the exact malformed prediction that crashed production", async () => {
    render(
      <ErrorBoundary label="Career Predictor">
        <CareerPredictor userId="00000000-0000-0000-0000-000000000000" />
      </ErrorBoundary>
    );
    await vi.waitFor(() => {
      expect(screen.getByText(/Predictive Corporate Matrix/i)).toBeTruthy();
    });
    // The poisoned prediction must NOT be rendered as a verdict card.
    expect(screen.queryByText(/Deserves Raise/)).toBeNull();
  });

  it("whole-widget isolation: even an unexpected crash yields fallback, not blank route", () => {
    const ThrowingVersion: React.FC = () => {
      throw new Error("UNEXPECTED_DEEP_FAILURE");
    };
    render(
      <ErrorBoundary label="Career Predictor">
        <ThrowingVersion />
      </ErrorBoundary>
    );
    expect(screen.getByText(/Career Predictor failed to render/)).toBeTruthy();
  });
});
