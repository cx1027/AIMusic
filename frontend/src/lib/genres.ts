export const ALL_GENRES = [
  "Electronic",
  "Ambient",
  "Cinematic",
  "Lo-Fi",
  "Rock",
  "Jazz",
  "Classical",
  "Hip-Hop",
  "Pop",
  "R&B",
  "Other",
] as const;

export type Genre = (typeof ALL_GENRES)[number];

export function inferGenresFromPrompt(prompt: string): Genre[] {
  const text = prompt.toLowerCase();
  const genres = new Set<Genre>();

  if (!text.trim()) {
    return [];
  }

  // Electronic
  if (text.includes("electronic") || text.includes("edm") || text.includes("synth")) {
    genres.add("Electronic");
  }

  // Ambient
  if (
    text.includes("ambient") ||
    text.includes("atmospheric") ||
    text.includes("soundscape") ||
    text.includes("drone")
  ) {
    genres.add("Ambient");
  }

  // Cinematic
  if (
    text.includes("cinematic") ||
    text.includes("film score") ||
    text.includes("orchestral") ||
    text.includes("epic") ||
    text.includes("trailer")
  ) {
    genres.add("Cinematic");
  }

  // Lo-Fi
  if (
    text.includes("lofi") ||
    text.includes("lo-fi") ||
    text.includes("chill") ||
    text.includes("study") ||
    text.includes("coffee shop")
  ) {
    genres.add("Lo-Fi");
  }

  // Rock
  if (
    text.includes("rock") ||
    text.includes("guitar") ||
    text.includes("indie") ||
    text.includes("punk") ||
    text.includes("metal")
  ) {
    genres.add("Rock");
  }

  // Jazz
  if (
    text.includes("jazz") ||
    text.includes("swing") ||
    text.includes("sax") ||
    text.includes("saxophone") ||
    text.includes("bebop")
  ) {
    genres.add("Jazz");
  }

  // Classical
  if (
    text.includes("classical") ||
    text.includes("symphony") ||
    text.includes("piano solo") ||
    text.includes("baroque") ||
    text.includes("romantic era")
  ) {
    genres.add("Classical");
  }

  // Hip-Hop
  if (
    text.includes("hip hop") ||
    text.includes("hip-hop") ||
    text.includes("rap") ||
    text.includes("boom bap") ||
    text.includes("trap")
  ) {
    genres.add("Hip-Hop");
  }

  // Pop
  if (
    text.includes("pop") ||
    text.includes("catchy") ||
    text.includes("radio") ||
    text.includes("chart") ||
    text.includes("dance pop")
  ) {
    genres.add("Pop");
  }

  // R&B
  if (
    text.includes("r&b") ||
    text.includes("rnb") ||
    text.includes("soul") ||
    text.includes("neo-soul") ||
    text.includes("slow jam")
  ) {
    genres.add("R&B");
  }

  if (genres.size === 0) {
    genres.add("Other");
  }

  return Array.from(genres);
}

