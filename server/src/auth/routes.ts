import { Router, type Request } from "express";
import { randomUUID } from "crypto";
import {
  getTwitchAuthUrl,
  exchangeCode,
  getTwitchUserFromToken,
  getTwitchChatColor,
  isStreamerLive,
} from "./twitch.js";
import { getWhitelistEntry } from "../db/index.js";
import { signToken, verifyToken } from "./jwt.js";
import { SESSION_SECRET } from "./secret.js";
import { loginRateLimit } from "../middleware/rateLimits.js";
import {
  getConfiguredTwitchChannels,
  getDefaultTwitchChannel,
  getStreamerLogins,
} from "../twitch/channels.js";
import type { UserRole } from "../types.js";
import { CLIENT_URL } from "../config/env.js";
import { eventsAuthUrlForLogin } from "../twitch/eventOAuth.js";
import { holdPendingLogin, readCookie } from "./pendingLogin.js";

const OWNER = (process.env.OWNER_TWITCH_USERNAME ?? "vicksy").toLowerCase();
const IS_PROD = process.env.NODE_ENV === "production";

export const authRouter = Router();

const STATE_COOKIE = "oauth_state";
export interface AuthUser {
  id: string;
  login: string;
  displayName: string;
  avatar: string;
  color: string;
  isOwner: boolean;
  isAdmin: boolean;
  /** Primary label, kept for places that show a single tag. */
  role: UserRole;
  /** Every label that applies, e.g. Streamer and Super moderator. */
  roles: UserRole[];
}

/**
 * Display role. It is a label, not a new permission: the owner is set by
 * OWNER_TWITCH_USERNAME, streamers are the configured channel accounts, and
 * the existing admin flag is presented as "super moderator".
 */
export function rolesFor(login: string, isOwner: boolean, isAdmin: boolean): UserRole[] {
  const roles: UserRole[] = [];
  if (isOwner) roles.push("owner");
  if (getStreamerLogins().includes(login)) roles.push("streamer");
  // Streamers are moderators too, so being one does not hide the access level.
  if (!isOwner) roles.push(isAdmin ? "super-moderator" : "moderator");
  return roles;
}

export function roleFor(login: string, isOwner: boolean, isAdmin: boolean): UserRole {
  return rolesFor(login, isOwner, isAdmin)[0];
}

function authorizeTokenUser(tokenUser: Record<string, unknown>): AuthUser | null {
  if (typeof tokenUser.login !== "string") return null;
  const login = tokenUser.login.toLowerCase();
  const isOwner = login === OWNER;
  const whitelistEntry = isOwner ? null : getWhitelistEntry(login);
  if (!isOwner && !whitelistEntry) return null;

  return {
    id: String(tokenUser.id ?? ""),
    login,
    displayName: String(tokenUser.displayName ?? login),
    avatar: String(tokenUser.avatar ?? ""),
    color: String(tokenUser.color ?? "#9146FF"),
    isOwner,
    isAdmin: isOwner || (whitelistEntry?.isAdmin ?? false),
    role: roleFor(login, isOwner, isOwner || (whitelistEntry?.isAdmin ?? false)),
    roles: rolesFor(login, isOwner, isOwner || (whitelistEntry?.isAdmin ?? false)),
  };
}

export function getUserFromToken(token: string): AuthUser | null {
  try {
    return authorizeTokenUser(verifyToken(token, SESSION_SECRET));
  } catch {
    return null;
  }
}

function getUserFromRequest(req: Request): AuthUser | null {
  const auth = req.headers?.authorization as string | undefined;
  if (auth?.startsWith("Bearer ")) {
    return getUserFromToken(auth.slice(7));
  }
  return null;
}

export { getUserFromRequest };

authRouter.get("/twitch", loginRateLimit, (_req, res) => {
  const state = randomUUID();
  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "lax",
    maxAge: 5 * 60 * 1000,
  });
  res.redirect(getTwitchAuthUrl(state));
});

authRouter.get("/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;
  const storedState = readCookie(req.headers.cookie, STATE_COOKIE);
  res.clearCookie(STATE_COOKIE);

  if (error) {
    res.redirect(`${CLIENT_URL}/login?error=twitch_denied`);
    return;
  }
  if (!state || !storedState || state !== storedState) {
    res.redirect(`${CLIENT_URL}/login?error=invalid_state`);
    return;
  }

  try {
    const tokenSet = await exchangeCode(code);
    const accessToken = tokenSet.accessToken;
    const twitchUser = await getTwitchUserFromToken(accessToken);
    const login = twitchUser.login.toLowerCase();

    if (login !== OWNER && !getWhitelistEntry(login)) {
      res.redirect(`${CLIENT_URL}/login?error=not_whitelisted`);
      return;
    }

    const color = await getTwitchChatColor(twitchUser.id, accessToken);
    const whitelistEntry = login !== OWNER ? getWhitelistEntry(login) : null;

    const user = {
      id: twitchUser.id,
      login,
      displayName: twitchUser.display_name,
      avatar: twitchUser.profile_image_url,
      color,
      isOwner: login === OWNER,
      isAdmin: login === OWNER || (whitelistEntry?.isAdmin ?? false),
    };

    const token = signToken(user, SESSION_SECRET);
    // A broadcaster who has not yet granted the Events permissions is asked for them now, once.
    const eventsUrl = await eventsAuthUrlForLogin(login);
    if (eventsUrl) {
      holdPendingLogin(res, token, IS_PROD);
      res.redirect(eventsUrl);
      return;
    }
    // In the fragment, which browsers never send to a server, so it stays out of request logs.
    res.redirect(`${CLIENT_URL}/#token=${token}`);
  } catch (err) {
    console.error("OAuth callback error:", err);
    res.redirect(`${CLIENT_URL}/login?error=server_error`);
  }
});

authRouter.get("/me", (req, res) => {
  const user = getUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json(user);
});

authRouter.get("/refresh", (req, res) => {
  const user = getUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json(user);
});

authRouter.post("/logout", (_req, res) => {
  res.sendStatus(200);
});

// Anyone can call /live, so answers are shared for a short while instead of each call spending
// Twitch API quota that logins and whitelist lookups also need.
const LIVE_CACHE_MS = 20_000;
const liveCache = new Map<string, { live: boolean; at: number }>();

authRouter.get("/live", async (req, res) => {
  try {
    const requestedChannel = String(req.query.channel ?? getDefaultTwitchChannel()).toLowerCase();
    const channel = getConfiguredTwitchChannels().includes(requestedChannel)
      ? requestedChannel
      : getDefaultTwitchChannel();
    const cached = liveCache.get(channel);
    if (cached && Date.now() - cached.at < LIVE_CACHE_MS) {
      res.json({ live: cached.live });
      return;
    }
    const live = await isStreamerLive(channel);
    liveCache.set(channel, { live, at: Date.now() });
    res.json({ live });
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});
