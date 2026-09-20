/**
 * The overlay canvas geometry. The OBS stream is a 1920x1080 window placed in the
 * middle of a larger workspace so elements can be parked off-screen.
 */
export const STREAM_W = 1920;
export const STREAM_H = 1080;
export const WORKSPACE_W = 4000;
export const WORKSPACE_H = 3000;

export const STREAM_OFFSET_X = Math.round((WORKSPACE_W - STREAM_W) / 2);
export const STREAM_OFFSET_Y = Math.round((WORKSPACE_H - STREAM_H) / 2);
export const SPAWN_X = STREAM_OFFSET_X - 800;
export const SPAWN_Y = STREAM_OFFSET_Y + 100;
