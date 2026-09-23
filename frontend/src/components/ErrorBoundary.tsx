import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Root error boundary (FE-02): a render error anywhere in the tree must never
 * white-screen the early-warning UI. Renders an offline-friendly fallback with
 * recovery actions instead of a blank page.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Hook point for future telemetry (Sentry/GA). Keep console for now.
    console.error('[ErrorBoundary] Uncaught render error:', error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="min-h-dvh flex items-center justify-center bg-carbon-05 p-6 font-sans text-carbon-90"
        >
          <div className="nasa-glass-panel max-w-md w-full p-8 text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center text-2xl">
              ⚠️
            </div>
            <h1 className="hn-h2">Something went wrong</h1>
            <p className="hn-body text-carbon-60">
              The HazardNet dashboard hit an unexpected error. Your saved data is safe —
              reload the app to continue monitoring hazards.
            </p>
            {this.state.error && (
              <pre className="text-left text-[11px] font-mono bg-carbon-10 border border-carbon-20 rounded-xl p-3 overflow-x-auto text-carbon-60">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
              <button
                onClick={this.handleReload}
                className="px-4 py-2.5 rounded-xl bg-nasa-red hover:bg-nasa-red-shade text-carbon-black font-bold text-sm transition-colors cursor-pointer"
              >
                Reload HazardNet
              </button>
              <button
                onClick={this.handleGoHome}
                className="px-4 py-2.5 rounded-xl bg-white hover:bg-carbon-10 border border-carbon-30 text-carbon-80 font-semibold text-sm transition-colors cursor-pointer"
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
