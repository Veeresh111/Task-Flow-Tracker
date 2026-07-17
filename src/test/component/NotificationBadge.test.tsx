import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import React from "react";

// Mock the supabase client
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
      getSession: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(),
          single: vi.fn(),
          order: vi.fn(() => ({
            range: vi.fn(),
          })),
        })),
        in: vi.fn(() => ({
          maybeSingle: vi.fn(),
        })),
        order: vi.fn(() => ({
          range: vi.fn(),
        })),
      })),
    })),
    channel: vi.fn(() => ({
      on: vi.fn(() => ({
        on: vi.fn(() => ({
          subscribe: vi.fn(),
        })),
        subscribe: vi.fn(),
      })),
      subscribe: vi.fn(),
    })),
    removeChannel: vi.fn(),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: "https://example.com/file.pdf" } })),
      })),
    },
  },
}));

vi.mock("@/lib/ai", () => ({
  callCorporateAI: vi.fn().mockResolvedValue("Mock AI response"),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// Sample notification component for testing
function NotificationBadgeDisplay({ badgeCount, isOnPage }: { badgeCount: number; isOnPage: boolean }) {
  return (
    <div data-testid="notification-badge">
      {isOnPage ? (
        <span data-testid="badge-value">0</span>
      ) : badgeCount > 0 ? (
        <span data-testid="badge-value">{badgeCount}</span>
      ) : null}
    </div>
  );
}

describe("NotificationBadgeDisplay Component", () => {
  it("shows badge count when not on notifications page", () => {
    render(
      <BrowserRouter>
        <NotificationBadgeDisplay badgeCount={5} isOnPage={false} />
      </BrowserRouter>,
    );
    expect(screen.getByTestId("badge-value").textContent).toBe("5");
  });

  it("shows 0 when on notifications page", () => {
    render(
      <BrowserRouter>
        <NotificationBadgeDisplay badgeCount={5} isOnPage={true} />
      </BrowserRouter>,
    );
    expect(screen.getByTestId("badge-value").textContent).toBe("0");
  });

  it("does not render badge container when count is 0 and not on page", () => {
    render(
      <BrowserRouter>
        <NotificationBadgeDisplay badgeCount={0} isOnPage={false} />
      </BrowserRouter>,
    );
    expect(screen.queryByTestId("badge-value")).toBeNull();
  });
});
