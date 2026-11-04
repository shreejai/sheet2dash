// Sample orders for the public demo: a made-up cake business, generated from
// a fixed seed so every visitor sees the same shop, with dates anchored to
// today so the calendar always has pickups coming up. Pure: runs anywhere.

import { addDays, addYears, startOfYear, weekdayIndex } from "./dates";
import type { Order, UnpricedOrder } from "./orders";

export const DEMO_BUSINESS = "Crumb & Co. Cakes";

/** Small, fast, seeded PRNG (mulberry32): same seed, same orders. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Weighted toward the flavours that sell best, like a real shop.
const FLAVOURS: [string, number][] = [
  ["chocolate", 10],
  ["red velvet", 6],
  ["biscoff", 6],
  ["vanilla", 5],
  ["lemon", 4],
  ["pistachio", 4],
  ["salted caramel", 4],
  ["strawberry", 3],
  ["black forest", 3],
  ["mango", 3],
  ["coffee", 2],
  ["passion fruit", 2],
  ["white chocolate", 2],
  ["raspberry", 2],
];

const STYLES: { make: (f: string, r: () => number) => string; price: [number, number] }[] = [
  {
    make: (f, r) => `${pick(r, [12, 18, 24])} ${f} cupcakes`,
    price: [45, 90],
  },
  {
    make: (f, r) => `${pick(r, [10, 15, 20])} people ${f} cake, ${pick(r, DESIGNS)}`,
    price: [85, 160],
  },
  {
    make: (f, r) => `${pick(r, [30, 40, 50])} servings 2 tier ${f} cake, ${pick(r, DESIGNS)}`,
    price: [220, 380],
  },
  {
    make: (f, r) =>
      `${pick(r, [60, 75, 100])} servings 3 tier ${f} cake, ${pick(r, ["floral", "gold leaf", "semi-naked"])} wedding design`,
    price: [450, 750],
  },
  {
    make: (f) => `${f} cheesecake, 8 inch`,
    price: [70, 110],
  },
];

const DESIGNS = [
  "gold drip",
  "pastel buttercream flowers",
  "unicorn theme",
  "dinosaur theme",
  "number 30 topper",
  "fresh berries",
  "rainbow sprinkles",
  "space theme",
  "minimal white",
  "football theme",
];

const CUSTOMERS = [
  "Priya",
  "Olivia",
  "Aarav",
  "Charlotte",
  "Mia",
  "Noah",
  "Ananya",
  "Isla",
  "Jack",
  "Zara",
  "Leo",
  "Amelia",
  "Rohan",
  "Grace",
  "Ella",
  "Kabir",
  "Sophie",
  "Lucas",
  "Meera",
  "Harper",
  "Oscar",
  "Aisha",
  "Henry",
  "Chloe",
  "Ivy",
  "Arjun",
  "Ruby",
  "Liam",
  "Sana",
  "Willow",
  "Ethan",
  "Tara",
  "Hugo",
  "Lily",
  "Dev",
  "Matilda",
  "Ava",
  "Kai",
  "Nina",
  "Sam",
];

// One-off customers: a first name plus an initial, so they rarely repeat.
const INITIALS = "ABCDEFGHJKLMNPRSTW";

function pick<T>(r: () => number, items: readonly T[]): T {
  return items[Math.floor(r() * items.length)];
}

function weighted<T>(r: () => number, items: readonly [T, number][]): T {
  let n = r() * items.reduce((t, [, w]) => t + w, 0);
  for (const [item, w] of items) if ((n -= w) < 0) return item;
  return items[items.length - 1][0];
}

/** Poisson-distributed count with mean `mean` (small means only). */
function poisson(r: () => number, mean: number) {
  const limit = Math.exp(-mean);
  let k = 0;
  let p = r();
  while (p > limit) {
    k++;
    p *= r();
  }
  return k;
}

// Saturdays are the big day; Mondays are quiet.
const WEEKDAY_WEIGHT = [0.35, 0.45, 0.55, 0.7, 1.2, 2.4, 1.6];

/**
 * About three years of orders: from 1 January two years ago to a month
 * ahead. The shop grows over time, has a December rush, and has regulars
 * who come back. Future orders sometimes have no price yet.
 */
export function demoOrders(today: string): { orders: Order[]; unpriced: UnpricedOrder[] } {
  const r = random(20221001);
  const start = startOfYear(addYears(today, -2));
  const end = addDays(today, 30);
  const orders: Order[] = [];
  const unpriced: UnpricedOrder[] = [];

  // Regulars are picked more often: weight falls off down the list.
  const customerWeights = CUSTOMERS.map((name, i): [string, number] => [name, 1 / (i + 6)]);

  const totalDays = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000);
  for (let day = 0; day <= totalDays; day++) {
    const date = addDays(start, day);
    const growth = 0.45 + 0.75 * (day / totalDays); // busier each year
    const month = Number(date.slice(5, 7));
    const season = month === 12 ? 1.6 : month === 5 ? 1.25 : month === 1 ? 0.75 : 1;
    const count = poisson(r, 0.62 * growth * season * WEEKDAY_WEIGHT[weekdayIndex(date)]);

    for (let i = 0; i < count; i++) {
      const style = weighted(r, [
        [STYLES[0], 4],
        [STYLES[1], 6],
        [STYLES[2], 2],
        [STYLES[3], 0.6],
        [STYLES[4], 1.5],
      ]);
      const flavour = weighted(r, FLAVOURS);
      const description = style.make(flavour, r);
      // About half the orders come from regulars; the rest are mostly one-off.
      const customer =
        r() < 0.5
          ? weighted(r, customerWeights)
          : `${pick(r, CUSTOMERS)} ${pick(r, [...INITIALS])}.`;
      const [lo, hi] = style.price;
      const amount = Math.round((lo + r() * (hi - lo)) / 5) * 5;
      // Most orders have a pickup time between 9am and 6pm, on the half hour.
      const pickupMinutes = r() < 0.72 ? 9 * 60 + Math.floor(r() * 19) * 30 : null;
      const base = {
        dueDate: date,
        pickupMinutes,
        cakeType: description[0].toUpperCase() + description.slice(1),
        customer,
        customerKey: customer.toLowerCase(),
        tab: date.slice(0, 4),
      };
      if (date > today && r() < 0.3) unpriced.push({ ...base, amount: null });
      else orders.push({ ...base, amount });
    }
  }
  return { orders, unpriced };
}
