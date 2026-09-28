import React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Per-widget error boundary. A crash inside any wrapped subtree renders this
 * fallback INSTEAD of propagating up and blanking the whole route (the white
 * screens were exactly this failure mode: one dashboard widget threw during
 * render and unmounted the entire React tree).
 *
 * Scope rule: wrap WIDGETS (CareerPredictor, charts, panels) — not the whole
 * app — so the surrounding dashboard survives and remains navigable.
 */
interface ErrorBoundaryProps {
  /** Stable name used in logs and the fallback UI. */
  label: string;
  children: React.ReactNode;
  /** Optional compact mode for small tiles. */
  compact?: boolean;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Real diagnostics — component stack points at the failing subtree.
    console.error(`[ErrorBoundary:${this.props.label}]`, error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className={`rounded-xl border border-red-200 bg-red-50 p-4 ${this.props.compact ? "text-xs" : "text-sm"}`}
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="font-bold text-red-800">
                {this.props.label} failed to render
              </p>
              <p className="mt-0.5 text-red-700/80 break-words">
                {this.state.error.message || "Unexpected runtime error."}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={this.reset}
                className="mt-2 h-7 border-red-300 text-red-800 hover:bg-red-100"
              >
                <RotateCcw className="mr-1.5 h-3 w-3" /> Retry
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
