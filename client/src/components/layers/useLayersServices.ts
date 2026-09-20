import { useToast } from "../ToastProvider";

/** The toast dialog. */
export function useLayersServices() {
  const toast = useToast();

  return { toast };
}
