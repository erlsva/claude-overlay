import { Check, CircleAlert } from "lucide-react";

export function Service({ name, ready }: { name: string; ready: boolean }) {
  return (
    <span className={ready ? "ready" : "missing"}>
      {ready ? <Check size={10} /> : <CircleAlert size={10} />}
      {name}
    </span>
  );
}
