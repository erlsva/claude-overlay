import cors from "cors";
import express from "express";
import { authRouter } from "./auth/routes.js";
import { createWhitelistRouter } from "./auth/whitelist.js";
import { CLIENT_URL } from "./config/env.js";
import { createFeatureRouter } from "./features/routes.js";
import { libraryRouter } from "./library/routes.js";
import { activeUsers, app, io } from "./runtime.js";
import { triggerRouter } from "./triggers/routes.js";
import { ttsRouter } from "./tts/routes.js";
import { createEventRoutes } from "./twitch/eventRoutes.js";
import { emitTwitchEvent } from "./twitch/eventsub.js";
import { createEventWebhook } from "./twitch/eventWebhook.js";
import { myinstantsRouter } from "./uploads/myinstants.js";
import { setUploadedMediaHeaders, uploadRouter, UPLOAD_DIR } from "./uploads/routes.js";

/** Mounts middleware and every HTTP route. The order matters: the raw-body webhook comes before JSON parsing. */
export function configureApp() {
  app.set("trust proxy", 1);
  app.use(cors({ origin: CLIENT_URL, credentials: true }));
  app.use(
    "/twitch/eventsub",
    express.raw({ type: "application/json", limit: "256kb" }),
    createEventWebhook(emitTwitchEvent),
  );
  app.use(express.json());
  app.use(createEventRoutes(emitTwitchEvent));
  app.use("/tts", ttsRouter);
  app.use(
    "/features",
    createFeatureRouter((flags) => io.emit("features:updated", flags)),
  );
  app.get("/ping", (_, res) => res.sendStatus(200));
  app.use("/triggers", triggerRouter);
  app.use("/auth", authRouter);
  app.use("/whitelist", createWhitelistRouter(io, activeUsers));
  app.use("/upload", uploadRouter);
  app.use("/library", libraryRouter);
  app.use("/myinstants", myinstantsRouter);
  app.use("/files", setUploadedMediaHeaders, express.static(UPLOAD_DIR));
}
