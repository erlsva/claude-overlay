import { useToast } from "../../components/ToastProvider";

/** The toast dialog. */
export function useSocketServices() {
  const toast = useToast();

  return { toast };
}
