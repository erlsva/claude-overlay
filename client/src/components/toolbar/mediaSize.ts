/** How big a newly added image or video should be. */

import { INITIAL_MEDIA_MAX_HEIGHT, INITIAL_MEDIA_MAX_WIDTH } from "./constants";

export async function getVisualMediaSize(file: File) {
  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
    return null;
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      if (file.type.startsWith("image/")) {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => reject(new Error("Could not read image dimensions"));
        image.src = objectUrl;
        return;
      }

      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () =>
        resolve({ width: video.videoWidth, height: video.videoHeight });
      video.onerror = () => reject(new Error("Could not read video dimensions"));
      video.src = objectUrl;
    });
    if (dimensions.width <= 0 || dimensions.height <= 0) return null;
    const scale = Math.min(
      1,
      INITIAL_MEDIA_MAX_WIDTH / dimensions.width,
      INITIAL_MEDIA_MAX_HEIGHT / dimensions.height,
    );
    return {
      width: Math.max(1, Math.round(dimensions.width * scale)),
      height: Math.max(1, Math.round(dimensions.height * scale)),
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
