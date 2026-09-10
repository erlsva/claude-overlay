import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Clipboard, Info, LifeBuoy, Trash2, X } from "lucide-react";
import { buildDiagnosticReport, type DiagnosticSnapshot } from "../support/diagnostics";
import { useNotificationHistory, useToast } from "./ToastProvider";

type SnapshotInput = Omit<DiagnosticSnapshot, "notifications">;

export function SupportDiagnostics({ snapshot }: { snapshot: SnapshotInput }) {
  const [open, setOpen] = useState(false);
  const { success, error } = useToast();
  const { notifications, clearNotifications } = useNotificationHistory();
  const report = useMemo(() => buildDiagnosticReport({ ...snapshot, notifications }), [notifications, snapshot]);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      success("Support report copied—paste it when describing the problem");
    } catch {
      error("Could not copy the support report. Allow clipboard access and try again");
    }
  };

  return (
    <>
      <button className="ui-icon-button canvas-corner-button support-button" onClick={() => setOpen(true)} title="Open notification history and support diagnostics" aria-label="Open support diagnostics">
        <LifeBuoy size={17} />
        {notifications.some((item) => item.kind === "error") && <span />}
      </button>
      {open && (
        <div className="support-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
          <section className="support-dialog" role="dialog" aria-modal="true" aria-labelledby="support-title">
            <header><span><strong id="support-title">Support & notifications</strong><small>Everything needed to describe a problem without exposing private credentials</small></span><button className="ui-icon-button" onClick={() => setOpen(false)} title="Close support panel"><X size={16} /></button></header>
            <div className="support-summary">
              <Status label="Dashboard" ok={snapshot.dashboardConnected} />
              <Status label="OBS" ok={snapshot.overlayConnected} detail={snapshot.overlayConnected ? String(snapshot.overlayCount) : undefined} />
              <Status label="Chat" ok={snapshot.chatConnected} />
              <span className="support-version">v{snapshot.version}</span>
            </div>
            <div className="support-history-header"><span><strong>Notification history</strong><small>Kept for this browser session</small></span><button className="ui-button ui-button--compact" onClick={clearNotifications} disabled={!notifications.length} title="Clear this browser's notification history"><Trash2 size={12} /> Clear</button></div>
            <div className="support-history">
              {[...notifications].reverse().map((item) => { const Icon = item.kind === "error" ? CircleAlert : item.kind === "success" ? CheckCircle2 : Info; return <div key={item.id} className={`support-history-item support-history-item--${item.kind}`}><Icon size={15} /><span><strong>{item.message}</strong><small>{new Date(item.at).toLocaleString()}</small></span></div>; })}
              {!notifications.length && <div className="support-empty">No notifications have been recorded in this session.</div>}
            </div>
            <footer><span>Copy this report and send it with a screenshot when asking for help.</span><button className="ui-button studio-primary" onClick={copy}><Clipboard size={13} /> Copy diagnostics</button></footer>
          </section>
        </div>
      )}
    </>
  );
}

function Status({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return <span className={ok ? "support-status support-status--ok" : "support-status support-status--bad"}><i /> {label}: {ok ? "online" : "offline"}{detail ? ` · ${detail}` : ""}</span>;
}
