import { type AuthUser } from "../../hooks/useAuth";

export interface DashboardProps {
  user: AuthUser;
  onLogout: () => void;
  onSessionRevoked: () => void;
  onRoleUpdated: () => void;
}
