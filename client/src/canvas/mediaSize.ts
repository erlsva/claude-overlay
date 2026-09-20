// New media starts at a comfortable size on the canvas instead of its full pixel size.
const INITIAL_MEDIA_MAX_WIDTH = 500;
const INITIAL_MEDIA_MAX_HEIGHT = 350;
const MEASURE_TIMEOUT_MS = 8_000;

/** Reads a remote image or video's natural size and scales it down to a starting size. */
export function measureMediaUrl(
  url: string,
  kind: "image" | "video",
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const finish = (width: number, height: number) => {
      window.clearTimeout(timer);
      if (width <= 0 || height <= 0) {
        resolve(null);
        return;
      }
      const scale = Math.min(1, INITIAL_MEDIA_MAX_WIDTH / width, INITIAL_MEDIA_MAX_HEIGHT / height);
      resolve({
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
      });
    };
    const timer = window.setTimeout(() => resolve(null), MEASURE_TIMEOUT_MS);
    if (kind === "image") {
      const image = new Image();
      image.onload = () => finish(image.naturalWidth, image.naturalHeight);
      image.onerror = () => {
        window.clearTimeout(timer);
        resolve(null);
      };
      image.src = url;
      return;
    }
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => finish(video.videoWidth, video.videoHeight);
    video.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    video.src = url;
  });
}
