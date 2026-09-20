import type { useSocketServices } from "./useSocketServices";
import type { useSocketState } from "./useSocketState";
import type { useSocketRefs } from "./useSocketRefs";
import type { useSoundActions } from "./useSoundActions";
import type { useSocketConnection } from "./useSocketConnection";
import type { useSocketActions } from "./useSocketActions";

/** Everything the parts of the useSocket share: what each hook returns. */
export type SocketContext = ReturnType<typeof useSocketServices> &
  ReturnType<typeof useSocketState> &
  ReturnType<typeof useSocketRefs> &
  ReturnType<typeof useSoundActions> &
  ReturnType<typeof useSocketConnection> &
  ReturnType<typeof useSocketActions>;
