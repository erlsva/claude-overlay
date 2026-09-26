import binoculars from "../../assets/vicksyBinoculars-4x.png";
import boogie from "../../assets/vicksyBoogie.gif";
import bork from "../../assets/vicksyBork.png";
import bounce from "../../assets/vicksyBounce.gif";
import campfire from "../../assets/foxsittingverycomfortablearoundacampfirewithitsfriends-4x.gif";
import dance from "../../assets/vicksyDance.gif";
import ga from "../../assets/vicksyGa.png";
import gaCard from "../../assets/vicksyGaCard-4x.gif";
import gainsane from "../../assets/vicksyGainsane-4x.png";
import insane from "../../assets/vicksyInsane.png";
import peek from "../../assets/vicksyPeek.png";
import pounce from "../../assets/vicksyPounce.gif";
import spin from "../../assets/vicksySpin.gif";
import steppies from "../../assets/vicksySteppies.gif";
import tomfoolery from "../../assets/vicksyTomfoolery-4x.png";
import wixelsSit from "../../assets/wixeisSit.gif";
import vicksyIcon from "../../assets/vicksyW.png";

/**
 * The emotes the public pages use. An animated one names a still one to show instead for people
 * who ask their system for less motion. `width` and `height` are the file's own size, so the
 * page can reserve the space before the picture arrives.
 */
export type EmoteName =
  | "binoculars"
  | "boogie"
  | "bork"
  | "bounce"
  | "campfire"
  | "dance"
  | "ga"
  | "gaCard"
  | "gainsane"
  | "insane"
  | "peek"
  | "pounce"
  | "spin"
  | "steppies"
  | "tomfoolery"
  | "wixelsSit"
  | "icon";

export interface EmoteDef {
  src: string;
  width: number;
  height: number;
  /** A still emote to show when the visitor prefers reduced motion. */
  still?: EmoteName;
}

export const EMOTES: Record<EmoteName, EmoteDef> = {
  binoculars: { src: binoculars, width: 160, height: 128 },
  bork: { src: bork, width: 112, height: 112 },
  ga: { src: ga, width: 112, height: 112 },
  gainsane: { src: gainsane, width: 128, height: 128 },
  insane: { src: insane, width: 112, height: 112 },
  peek: { src: peek, width: 112, height: 112 },
  tomfoolery: { src: tomfoolery, width: 128, height: 128 },
  icon: { src: vicksyIcon, width: 112, height: 112 },
  boogie: { src: boogie, width: 112, height: 112, still: "ga" },
  bounce: { src: bounce, width: 112, height: 112, still: "ga" },
  dance: { src: dance, width: 112, height: 112, still: "tomfoolery" },
  gaCard: { src: gaCard, width: 128, height: 128, still: "ga" },
  pounce: { src: pounce, width: 112, height: 112, still: "ga" },
  spin: { src: spin, width: 112, height: 112, still: "icon" },
  steppies: { src: steppies, width: 112, height: 112, still: "ga" },
  wixelsSit: { src: wixelsSit, width: 112, height: 112, still: "peek" },
  campfire: { src: campfire, width: 384, height: 96, still: "ga" },
};

/** The still emotes a clip's avatar can be. */
export const AVATARS: EmoteName[] = [
  "ga",
  "bork",
  "tomfoolery",
  "peek",
  "insane",
  "gainsane",
  "binoculars",
];

/** What a clip's avatar turns into while it plays. */
export const DANCERS: EmoteName[] = ["dance", "boogie", "bounce", "steppies", "pounce"];

/** The same clip always gets the same emote, so the list looks familiar from one visit to the next. */
export function pickFor<T>(id: string, options: readonly T[]): T {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return options[hash % options.length];
}
