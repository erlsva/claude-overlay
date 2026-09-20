/** Small word helpers shared by the casting modules. */

export const words = (s: string): string[] => s.toLowerCase().match(/[a-z]+/g) || [];

export const regexEscape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const normalizedVoiceName = (value: string) => words(value).join(" ");
