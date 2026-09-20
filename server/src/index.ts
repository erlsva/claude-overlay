import { configureApp } from "./app.js";
import { PORT } from "./config/env.js";
import { installTtsPlayback } from "./playback/tts.js";
import { registerConnections } from "./realtime/connection.js";
import { httpServer } from "./runtime.js";
import { initializePersistence } from "./startup/persistence.js";
import { startTwitchEvents } from "./startup/twitch.js";

await initializePersistence();
installTtsPlayback();
configureApp();
registerConnections();
startTwitchEvents();

httpServer.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
