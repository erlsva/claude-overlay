import { useToast } from "../ToastProvider";
import { useConfirm } from "../ConfirmProvider";

/** The toast and confirm dialogs. */
export function useTtsServices() {
  const toast = useToast();
  const confirm = useConfirm();

  return { toast, confirm };
}
