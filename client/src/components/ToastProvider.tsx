import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import { TooltipProvider } from "./TooltipProvider";
import { ConfirmProvider } from "./ConfirmProvider";

export type ToastKind = "success" | "error" | "info";
export interface NotificationRecord {
  id: number;
  kind: ToastKind;
  message: string;
  at: number;
}
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

interface NotificationHistoryApi {
  notifications: NotificationRecord[];
  clearNotifications: () => void;
}

const noop = () => {};
const NOTIFICATION_STORAGE_KEY = "overlay_notification_history_v1";

function loadNotificationHistory(): NotificationRecord[] {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(NOTIFICATION_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.slice(-100) : [];
  } catch {
    return [];
  }
}

const ToastContext = createContext<ToastApi>({
  success: noop,
  error: noop,
  info: noop,
});

const NotificationHistoryContext = createContext<NotificationHistoryApi>({
  notifications: [],
  clearNotifications: noop,
});

export function useToast() {
  return useContext(ToastContext);
}

export function useNotificationHistory() {
  return useContext(NotificationHistoryContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>(loadNotificationHistory);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-3), { id, kind, message }]);
      setNotifications((current) => [...current.slice(-99), { id: Date.now() * 100 + id, kind, message, at: Date.now() }]);
      window.setTimeout(() => dismiss(id), kind === "error" ? 7000 : 4500);
    },
    [dismiss],
  );

  useEffect(() => {
    try {
      sessionStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(notifications));
    } catch {
      // Notifications still work when private browsing blocks session storage.
    }
  }, [notifications]);

  const clearNotifications = useCallback(() => setNotifications([]), []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => show("success", message),
      error: (message) => show("error", message),
      info: (message) => show("info", message),
    }),
    [show],
  );

  const historyApi = useMemo<NotificationHistoryApi>(
    () => ({ notifications, clearNotifications }),
    [clearNotifications, notifications],
  );

  return (
    <ToastContext.Provider value={api}>
      <NotificationHistoryContext.Provider value={historyApi}>
        <ConfirmProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </ConfirmProvider>
        <div className="toast-region" role="region" aria-label="Notifications">
          {toasts.map((toast) => {
            const Icon =
              toast.kind === "success"
                ? CheckCircle2
                : toast.kind === "error"
                  ? CircleAlert
                  : Info;
            return (
              <div
                key={toast.id}
                className={`app-toast app-toast--${toast.kind}`}
                role={toast.kind === "error" ? "alert" : "status"}
              >
                <Icon size={19} aria-hidden="true" />
                <span>{toast.message}</span>
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  title="Dismiss notification"
                  aria-label="Dismiss notification"
                >
                  <X size={16} />
                </button>
              </div>
            );
          })}
        </div>
      </NotificationHistoryContext.Provider>
    </ToastContext.Provider>
  );
}
