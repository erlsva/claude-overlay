import binoculars from "../../assets/vicksyBinoculars-4x.png";
import boogie from "../../assets/vicksyBoogie.gif";
import bork from "../../assets/vicksyBork.png";
import bounce from "../../assets/vicksyBounce.gif";
import campfire from "../../assets/foxsittingverycomfortablearoundacampfirewithitsfriends-4x.gif";
import dance from "../../assets/vicksyDance.gif";
import ga from "../../assets/vicksyGa.png";
import gainsane from "../../assets/vicksyGainsane-4x.png";
import insane from "../../assets/vicksyInsane.png";
import peek from "../../assets/vicksyPeek.png";
import spin from "../../assets/vicksySpin.gif";
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
  | "gainsane"
  | "insane"
  | "peek"
  | "spin"
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
  spin: { src: spin, width: 112, height: 112, still: "icon" },
  wixelsSit: { src: wixelsSit, width: 112, height: 112, still: "peek" },
  campfire: { src: campfire, width: 384, height: 96, still: "ga" },
};
