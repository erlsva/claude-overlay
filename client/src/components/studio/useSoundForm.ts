import { useState } from "react";
import { SERVER_URL } from "../../config/server";
import { authHeaders } from "../../hooks/useAuth";
import { randomUUID } from "../../utils";
import type { StudioPanelProps } from "./types";
import type { StudioShell } from "./types";

/** Adding sounds to the soundboard from a Myinstants link or an uploaded file. */
export function useSoundForm(
  props: StudioPanelProps,
  shell: Pick<StudioShell, "toast" | "name" | "setName">,
) {
  const { toast, name, setName } = shell;
  const [soundUrl, setSoundUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const createSound = async () => {
    if (soundUrl.trim()) {
      try {
        setUploading(true);
        const response = await fetch(`${SERVER_URL}/myinstants/resolve`, {
          method: "POST",
          credentials: "include",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ url: soundUrl.trim() }),
        });
        const data = (await response.json()) as {
          url?: string;
          title?: string;
          error?: string;
        };
        if (!response.ok || !data.url)
          throw new Error(data.error ?? "Could not resolve Myinstants link");
        const soundName = name.trim() || data.title || "Myinstants sound";
        props.onSaveSound({
          id: randomUUID(),
          name: soundName,
          url: data.url,
          volume: 0.25,
        });
        toast.success(`Sound “${soundName}” added`);
        setName("");
        setSoundUrl("");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not add Myinstants sound");
      } finally {
        setUploading(false);
      }
    }
  };
  const uploadSound = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`${SERVER_URL}/upload`, {
        method: "POST",
        body,
        headers: authHeaders(),
        credentials: "include",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? `Sound upload failed (${response.status})`);
      }
      const data = (await response.json()) as { url: string };
      props.onSaveSound({
        id: randomUUID(),
        name: name.trim() || file.name.replace(/\.[^.]+$/, ""),
        url: `${SERVER_URL}${data.url}`,
        volume: 0.25,
      });
      setName("");
      setSoundUrl("");
      toast.success(`${file.name} added to the soundboard`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sound upload failed");
    } finally {
      setUploading(false);
    }
  };

  return { soundUrl, setSoundUrl, uploading, setUploading, createSound, uploadSound };
}
