// Groups free-text cake descriptions ("10 people rasmalai cake") by flavour.
// The first flavour mentioned in the text wins; unmatched orders are "Other".

const FLAVOURS: { name: string; pattern: RegExp }[] = [
  { name: "Rasmalai", pattern: /\bras ?ma?lai\b|\brasmali\b/ },
  { name: "Red velvet", pattern: /\bred ?velvet\b/ },
  { name: "Black forest", pattern: /\bblack ?forest\b/ },
  { name: "White chocolate", pattern: /\bwhite (choc|chocolate)\b/ },
  { name: "Chocolate", pattern: /\bchoc(olate|o)?\b|\bnutella\b|\bferrero\b|\boreo\b/ },
  { name: "Biscoff", pattern: /\bbiscoff\b|\blotus\b/ },
  { name: "Butterscotch", pattern: /\bbutter ?scotch\b/ },
  { name: "Pistachio", pattern: /\bpistachio\b/ },
  { name: "Caramel", pattern: /\bcaramel\b/ },
  { name: "Raspberry", pattern: /\braspberr(y|ies)\b/ },
  { name: "Strawberry", pattern: /\bstrawberr(y|ies)\b/ },
  { name: "Mango", pattern: /\bmango\b/ },
  { name: "Passion fruit", pattern: /\bpassion ?fruit\b/ },
  { name: "Lemon", pattern: /\blemon\b/ },
  { name: "Coffee", pattern: /\bcoffee\b|\bmocha\b|\btiramisu\b/ },
  { name: "Vanilla", pattern: /\bvanilla\b/ },
];

export const OTHER_FLAVOUR = "Other";

export function flavourOf(description: string | null): string {
  if (!description) return OTHER_FLAVOUR;
  const text = description.toLowerCase();
  let best: { name: string; at: number } | null = null;
  for (const { name, pattern } of FLAVOURS) {
    const at = text.search(pattern);
    if (at !== -1 && (!best || at < best.at)) best = { name, at };
  }
  return best?.name ?? OTHER_FLAVOUR;
}
