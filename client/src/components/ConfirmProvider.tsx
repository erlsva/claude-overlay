import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CircleAlert, X } from "lucide-react";
import { createPortal } from "react-dom";
import { usePresence } from "../hooks/usePresence";

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<ConfirmFn>(async () => false);

export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [open, setOpen] = useState(false);
  const presence = usePresence(open);
  const resolver = useRef<((accepted: boolean) => void) | null>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);

  const close = useCallback((accepted: boolean) => {
    resolver.current?.(accepted);
    resolver.current = null;
    // Keep the options so the dialog can finish its exit animation.
    setOpen(false);
  }, []);

  const confirm = useCallback<ConfirmFn>((nextOptions) => {
    resolver.current?.(false);
    setOptions(nextOptions);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    cancelButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, open]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options &&
        presence.mounted &&
        createPortal(
          <div
            className="confirm-backdrop motion-backdrop"
            data-state={presence.state}
            onMouseDown={() => close(false)}
          >
            <section
              className="confirm-dialog motion-dialog"
              data-state={presence.state}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="confirm-title"
              aria-describedby="confirm-message"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <header>
                <span className={options.danger ? "danger" : ""}>
                  <CircleAlert size={18} />
                </span>
                <h2 id="confirm-title">{options.title}</h2>
                <button
                  className="ui-icon-button confirm-dialog__close"
                  onClick={() => close(false)}
                  title="Close confirmation"
                >
                  <X size={15} />
                </button>
              </header>
              <p id="confirm-message">{options.message}</p>
              <footer>
                <button
                  ref={cancelButton}
                  className="ui-button confirm-dialog__cancel"
                  onClick={() => close(false)}
                >
                  {options.cancelLabel ?? "Cancel"}
                </button>
                <button
                  className={`ui-button ${options.danger ? "ui-danger" : "studio-primary"}`}
                  onClick={() => close(true)}
                >
                  {options.confirmLabel ?? "Confirm"}
                </button>
              </footer>
            </section>
          </div>,
          document.body,
        )}
    </ConfirmContext.Provider>
  );
}
