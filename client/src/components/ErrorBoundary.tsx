import { Component, type ErrorInfo, type ReactNode } from "react";
import { Clipboard, RefreshCw } from "lucide-react";
import { createSupportId } from "../support/diagnostics";

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
  error?: Error;
  componentStack?: string;
  copied: boolean;
  supportId: string;
}

/** Keeps an unexpected component error from leaving the dashboard as a blank page. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, copied: false, supportId: createSupportId() };

  static getDerivedStateFromError(): State {
    return { failed: true, copied: false, supportId: createSupportId() };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ error, componentStack: info.componentStack ?? undefined });
    console.error(`Overlay UI crashed (${this.state.supportId})`, error, info.componentStack);
  }

  copyDetails = async () => {
    const report = [
      "Vicksy OBS Overlay — Crash report",
      `Support ID: ${this.state.supportId}`,
      `Time: ${new Date().toISOString()}`,
      `Page: ${window.location.pathname}`,
      `Browser: ${navigator.userAgent}`,
      `Error: ${this.state.error?.name ?? "UnknownError"}: ${this.state.error?.message ?? "Unknown UI error"}`,
      this.state.error?.stack ?? "",
      this.state.componentStack ?? "",
      "This report does not include login or OAuth tokens.",
    ].filter(Boolean).join("\n");
    try {
      await navigator.clipboard.writeText(report);
      this.setState({ copied: true });
    } catch {
      this.setState({ copied: false });
    }
  };

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main className="loading-screen" role="alert">
        <div className="loading-screen__content">
          <div>
            <h1>Something went wrong</h1>
            <p>The page hit an unexpected error. Reloading normally restores the latest room state.</p>
            <code className="crash-support-id">Support ID: {this.state.supportId}</code>
          </div>
          <div className="crash-actions">
            <button className="ui-button" onClick={this.copyDetails}><Clipboard size={14} /> {this.state.copied ? "Copied" : "Copy error details"}</button>
            <button className="ui-button ui-button--primary" onClick={() => window.location.reload()}><RefreshCw size={14} /> Reload page</button>
          </div>
        </div>
      </main>
    );
  }
}
