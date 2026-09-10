import type { NotificationRecord } from "../components/ToastProvider";

export interface DiagnosticSnapshot {
  version: string;
  user: string;
  channel: string;
  theme: string;
  dashboardConnected: boolean;
  overlayConnected: boolean;
  overlayCount: number;
  chatConnected: boolean;
  elementCount: number;
  soundCount: number;
  commandCount: number;
  notifications: NotificationRecord[];
}

export function createSupportId(at = Date.now()) {
  return `VOS-${at.toString(36).toUpperCase()}`;
}

export function buildDiagnosticReport(snapshot: DiagnosticSnapshot, now = new Date()) {
  const recent = snapshot.notifications.slice(-15).reverse();
  return [
    "Vicksy OBS Overlay — Support report",
    `Support ID: ${createSupportId(now.getTime())}`,
    `Created: ${now.toISOString()}`,
    `App version: ${snapshot.version}`,
    `Page: ${window.location.pathname}`,
    `User: ${snapshot.user}`,
    `Preview channel: ${snapshot.channel}`,
    `Theme: ${snapshot.theme}`,
    `Dashboard server: ${snapshot.dashboardConnected ? "connected" : "offline"}`,
    `OBS overlay: ${snapshot.overlayConnected ? `connected (${snapshot.overlayCount})` : "offline"}`,
    `Chat listener: ${snapshot.chatConnected ? "connected" : "offline"}`,
    `Content: ${snapshot.elementCount} layers, ${snapshot.soundCount} sounds, ${snapshot.commandCount} commands`,
    `Browser: ${navigator.userAgent}`,
    "",
    "Recent notifications:",
    ...(recent.length
      ? recent.map((item) => `- ${new Date(item.at).toISOString()} [${item.kind.toUpperCase()}] ${item.message}`)
      : ["- None in this browser session"]),
    "",
    "This report intentionally excludes login tokens, OAuth credentials, media URLs, and message contents.",
  ].join("\n");
}
