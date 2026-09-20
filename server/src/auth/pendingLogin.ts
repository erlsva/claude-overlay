import type { Request, Response } from "express";
import { verifyToken } from "./jwt.js";

/**
 * When a streamer signs in and still owes Twitch the Events permissions, the dashboard session is
 * held in this short-lived, HTTP-only cookie while she visits Twitch's permission screen, then
 * handed to the dashboard on the way back. It never goes through Twitch's URLs.
 */
export const PENDING_LOGIN_COOKIE = "pending_login";
const PENDING_LOGIN_MS = 10 * 60 * 1000;

export function readCookie(header: string | undefined, name: string): string | undefined {
  return (header ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(name + "="))
    ?.slice(name.length + 1);
}

export function holdPendingLogin(res: Response, token: string, secure: boolean) {
  res.cookie(PENDING_LOGIN_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: PENDING_LOGIN_MS,
  });
}

/** Returns the held session token, once, and only if it is still a valid one. */
export function takePendingLogin(req: Request, res: Response, secret: string): string | null {
  const token = readCookie(req.headers.cookie, PENDING_LOGIN_COOKIE);
  if (token === undefined) return null;
  res.clearCookie(PENDING_LOGIN_COOKIE);
  try {
    verifyToken(token, secret);
    return token;
  } catch {
    return null;
  }
}
