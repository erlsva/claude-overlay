import { Monitor, Radio, ScreenShare } from "lucide-react";

type ActionScope = "dashboard" | "obs" | "both";

const scopeDetails = {
  dashboard: { label: "Dashboard only", Icon: Monitor },
  obs: { label: "Plays on overlay", Icon: Radio },
  both: { label: "Dashboard + overlay", Icon: ScreenShare },
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
