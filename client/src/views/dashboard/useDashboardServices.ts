import { useToast } from "../../components/ToastProvider";
import { useConfirm } from "../../components/ConfirmProvider";

/** The toast and confirm dialogs the dashboard uses. */
export function useDashboardServices() {
  const toast = useToast();
  const confirm = useConfirm();

  return { toast, confirm };
}
