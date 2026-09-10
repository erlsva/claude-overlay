import { Monitor, Radio, ScreenShare } from "lucide-react";

type ActionScope = "dashboard" | "obs" | "both";

const scopeDetails = {
  dashboard: { label: "Dashboard only", Icon: Monitor },
  obs: { label: "Plays on OBS", Icon: Radio },
  both: { label: "Dashboard + OBS", Icon: ScreenShare },
} as const;

export function ActionScopeBadge({ scope }: { scope: ActionScope }) {
  const { label, Icon } = scopeDetails[scope];
  return (
    <span className={`action-scope-badge action-scope-badge--${scope}`}>
      <Icon size={10} aria-hidden="true" />
      {label}
    </span>
  );
}
