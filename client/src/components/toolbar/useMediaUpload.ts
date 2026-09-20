import { useRef, useState, useEffect } from "react";
import { getVisualMediaSize } from "./mediaSize";
import { SERVER_URL } from "../../config/server";
import { authHeaders } from "../../hooks/useAuth";
import { type MediaType } from "../../types";
import { randomUUID } from "../../utils";
import type { ToolbarProps } from "./types";
import type { useToolbarServices } from "./useToolbarServices";

/** Adding media: file picker, drag and drop, and GIF search results. */
export function useMediaUpload(
  props: ToolbarProps,
  deps: Pick<ReturnType<typeof useToolbarServices>, "confirm" | "toast">,
) {
  const { onAdd, mediaUploadRef, onSaveSound } = props;
  const { confirm, toast } = deps;
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const uploadMediaFileRef = useRef<(file: File) => Promise<void>>(async () => {});
  const uploadMediaFile = async (file: File) => {
    setUploading(true);
    const visualSizePromise = getVisualMediaSize(file).catch(() => null);
    const body = new FormData();
    body.append("file", file);
    try {
      const res = await fetch(`${SERVER_URL}/upload`, {
        method: "POST",
        body,
        credentials: "include",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Upload failed (${res.status})`);
      }
      const { url, mimetype } = await res.json();
      const visualSize = await visualSizePromise;
      const type: MediaType = mimetype.startsWith("audio")
        ? "audio"
        : mimetype.startsWith("video")
          ? "video"
          : mimetype === "image/gif"
            ? "gif"
            : "image";
      const mediaUrl = `${SERVER_URL}${url}`;
      // A sound effect can go to the soundboard instead of the canvas; it is not put in both.
      const toSoundboard =
        type === "audio" &&
        (await confirm({
          title: "Add to the Soundboard instead?",
          message:
            "Soundboard clips play on the overlay without a canvas layer. Choose Add to canvas to place it as a layer instead.",
          confirmLabel: "Add to soundboard",
          cancelLabel: "Add to canvas",
        }));
      if (toSoundboard) {
        onSaveSound({
          id: randomUUID(),
          name: file.name.replace(/\.[^.]+$/, ""),
          url: mediaUrl,
          volume: 0.25,
        });
        toast.success(`${file.name} added to the Soundboard`);
      } else {
        onAdd({
          id: randomUUID(),
          type,
          src: mediaUrl,
          displayName: file.name,
          x: 200,
          y: 200,
          width: type === "audio" ? 360 : (visualSize?.width ?? 400),
          height: type === "audio" ? 86 : (visualSize?.height ?? 225),
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          visible: true,
          zIndex: Date.now(),
        });
        toast.success(`${file.name} added to the canvas`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Media upload failed");
    } finally {
      setUploading(false);
    }
  };
  uploadMediaFileRef.current = uploadMediaFile;
  useEffect(() => {
    if (!mediaUploadRef) return;
    const uploadFromClipboard = (file: File) => uploadMediaFileRef.current(file);
    mediaUploadRef.current = uploadFromClipboard;
    return () => {
      if (mediaUploadRef.current === uploadFromClipboard) mediaUploadRef.current = null;
    };
  }, [mediaUploadRef]);
  const uploadGiphyUrl = async (url: string) => {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();
      if (
        parsed.protocol !== "https:" ||
        (hostname !== "giphy.com" && !hostname.endsWith(".giphy.com"))
      ) {
        throw new Error("Drop a local media file or a GIF image from Giphy");
      }
      const response = await fetch(parsed.toString(), { mode: "cors", credentials: "omit" });
      if (!response.ok) throw new Error(`Giphy download failed (${response.status})`);
      const contentType = response.headers.get("content-type")?.split(";")[0].toLowerCase() ?? "";
      if (!["image/gif", "image/webp", "image/png", "image/jpeg"].includes(contentType)) {
        throw new Error("That Giphy drag was a webpage, not a GIF image. Drag the GIF itself");
      }
      const blob = await response.blob();
      if (blob.size > 25 * 1024 * 1024)
        throw new Error("The dropped Giphy image is larger than 25 MB");
      const extension =
        contentType === "image/gif"
          ? "gif"
          : contentType === "image/webp"
            ? "webp"
            : contentType === "image/png"
              ? "png"
              : "jpg";
      const pathName = decodeURIComponent(parsed.pathname.split("/").pop() || `giphy.${extension}`);
      const baseName = pathName.replace(/\.[a-z0-9]+$/i, "") || "giphy";
      await uploadMediaFileRef.current(
        new File([blob], `${baseName}.${extension}`, { type: contentType }),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not import that Giphy image");
    }
  };
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await uploadMediaFile(file);
    e.target.value = "";
  };
  useEffect(() => {
    const isMediaDrag = (transfer: DataTransfer | null) => {
      if (!transfer) return false;
      return ["Files", "text/uri-list", "text/html"].some((type) => transfer.types.includes(type));
    };
    const draggedUrl = (transfer: DataTransfer) => {
      const html = transfer.getData("text/html");
      if (html) {
        const imageUrl = new DOMParser()
          .parseFromString(html, "text/html")
          .querySelector("img")?.src;
        if (imageUrl) return imageUrl;
      }
      return (
        transfer
          .getData("text/uri-list")
          .split(/\r?\n/)
          .find((line) => line && !line.startsWith("#")) || transfer.getData("text/plain")
      );
    };
    const dragEnter = (event: DragEvent) => {
      if (!isMediaDrag(event.dataTransfer)) return;
      event.preventDefault();
      setDropActive(true);
    };
    const dragOver = (event: DragEvent) => {
      if (!isMediaDrag(event.dataTransfer)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const drop = (event: DragEvent) => {
      if (!isMediaDrag(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();
      setDropActive(false);
      const transfer = event.dataTransfer;
      if (!transfer) return;
      const files = [...transfer.files];
      if (files.length) {
        if (files.length > 1) toast.info("Uploading the first dropped file");
        void uploadMediaFileRef.current(files[0]);
        return;
      }
      const url = draggedUrl(transfer).trim();
      if (url) void uploadGiphyUrl(url);
      else toast.error("No supported media was found in that drop");
    };
    const dragLeave = (event: DragEvent) => {
      if (
        event.relatedTarget === null &&
        (event.clientX <= 0 ||
          event.clientY <= 0 ||
          event.clientX >= window.innerWidth ||
          event.clientY >= window.innerHeight)
      ) {
        setDropActive(false);
      }
    };
    window.addEventListener("dragenter", dragEnter, true);
    window.addEventListener("dragover", dragOver, true);
    window.addEventListener("drop", drop, true);
    window.addEventListener("dragleave", dragLeave, true);
    return () => {
      window.removeEventListener("dragenter", dragEnter, true);
      window.removeEventListener("dragover", dragOver, true);
      window.removeEventListener("drop", drop, true);
      window.removeEventListener("dragleave", dragLeave, true);
    };
  }, [toast]);

  return {
    fileRef,
    uploading,
    setUploading,
    dropActive,
    setDropActive,
    uploadMediaFileRef,
    uploadMediaFile,
    uploadGiphyUrl,
    handleFile,
  };
}
