import type { UserRole } from "../types";

export const ROLE_LABELS: Record<UserRole, string> = {
  owner: "Owner",
  streamer: "Streamer",
  "super-moderator": "Super moderator",
  moderator: "Moderator",
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  owner: "Runs this overlay. Can change feature flags, connect the chatbot and appoint super moderators.",
  streamer: "The channel owner the overlay is for.",
  "super-moderator": "A moderator who can also add and remove people from the whitelist.",
  moderator: "Can use the whole dashboard except managing who has access.",
};

export const ROLE_ORDER: UserRole[] = ["owner", "streamer", "super-moderator", "moderator"];

/** All the labels someone holds, side by side. */
export function RoleTags({ roles, fallback }: { roles?: UserRole[]; fallback?: UserRole }) {
  const list = roles?.length ? roles : fallback ? [fallback] : [];
  return (
    <>
      {list.map((role) => (
        <RoleTag key={role} role={role} />
      ))}
    </>
  );
}

/** Small label showing what someone is. It only names a role; it grants nothing. */
export function RoleTag({ role }: { role?: UserRole }) {
  if (!role) return null;
  return (
    <span className={`role-tag role-tag--${role}`} title={ROLE_DESCRIPTIONS[role]}>
      {ROLE_LABELS[role]}
    </span>
  );
}
