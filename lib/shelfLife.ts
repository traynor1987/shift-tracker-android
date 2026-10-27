export type ShelfLifePeriod = {
  label: string;
  amount: number;
  unit: "days" | "hours";
};

export type ShelfLifeItem = {
  category: string;
  products: string[];
  periods: ShelfLifePeriod[];
  note?: string;
};

export type ShelfLifeSection = {
  id: string;
  title: string;
  subtitle: string;
  items: ShelfLifeItem[];
};

export const SHELF_LIFE_CHART_VALID_TO = "2026-09-06";

export const SHELF_LIFE_SECTIONS: ShelfLifeSection[] = [
  {
    id: "defrosted",
    title: "Defrosted / frozen before use",
    subtitle: "Walk-in or makeline · use only when fully defrosted",
    items: [
      { category: "Toppings", products: ["Pepperoni", "Chorizo", "Nduja sausage"], periods: [{ label: "From delivery", amount: 12, unit: "days" }] },
      { category: "Toppings", products: ["Tandoori chicken"], periods: [{ label: "From delivery", amount: 10, unit: "days" }] },
      { category: "Toppings", products: ["Bacon (frozen)"], periods: [{ label: "From delivery", amount: 10, unit: "days" }, { label: "In use", amount: 7, unit: "days" }], note: "Supply Chain will advise stores receiving frozen bacon." },
      { category: "Toppings", products: ["Beef", "Chicken", "Hot dog slices", "Meatballs"], periods: [{ label: "From delivery", amount: 9, unit: "days" }] },
      { category: "Toppings", products: ["Sausage"], periods: [{ label: "From delivery", amount: 6, unit: "days" }] },
      { category: "Sides", products: ["Chicken strippers", "Chicken kickers", "Chicken tenders", "Chicken boneless bites"], periods: [{ label: "From delivery", amount: 10, unit: "days" }] },
      { category: "Sides", products: ["Chicken wings"], periods: [{ label: "From delivery", amount: 9, unit: "days" }], note: "Prepped life is the remaining life of the wings." },
      { category: "Sides", products: ["Potato wedges", "Fries"], periods: [{ label: "From delivery", amount: 7, unit: "days" }] },
      { category: "Sides", products: ["Mac'n'Cheese"], periods: [{ label: "From delivery", amount: 6, unit: "days" }, { label: "Prepped", amount: 48, unit: "hours" }] },
      { category: "Desserts", products: ["Double Chocolate & Caramel Cookies", "Domino's Cookies with Creme Egg"], periods: [{ label: "From delivery", amount: 14, unit: "days" }] },
      { category: "Desserts", products: ["Cookies"], periods: [{ label: "From delivery", amount: 17, unit: "days" }] },
      { category: "Cheese", products: ["Cheese String - Garlic & Herb"], periods: [{ label: "From delivery", amount: 7, unit: "days" }], note: "Keep in a clean, sanitised and lidded container." },
      { category: "Cheese", products: ["Goats cheese"], periods: [{ label: "From delivery", amount: 14, unit: "days" }] },
      { category: "Bases", products: ["Thin crust shells - all sizes"], periods: [{ label: "Chilled", amount: 21, unit: "days" }], note: "Once open, keep wrapped. If ambient, use within 24 hours and do not return to chill." },
      { category: "Bases", products: ["Wraps"], periods: [{ label: "Chilled", amount: 22, unit: "days" }], note: "Once open, keep wrapped. If ambient, use within 24 hours and do not return to chill." },
    ],
  },
  {
    id: "chilled",
    title: "Chilled items",
    subtitle: "Unopened date remains the date on the pack unless stated",
    items: [
      { category: "Toppings", products: ["Pepperoni"], periods: [{ label: "Prepped", amount: 12, unit: "days" }] },
      { category: "Toppings", products: ["Bacon", "Ham"], periods: [{ label: "Prepped", amount: 6, unit: "days" }] },
      { category: "Toppings", products: ["Green chillies", "Mushrooms", "Onions", "Peppers", "Tomatoes"], periods: [{ label: "Prepped", amount: 48, unit: "hours" }] },
      { category: "Cheese", products: ["Mozzarella cheese - Standard", "Mozzarella cheese - Delight"], periods: [{ label: "Prepped", amount: 9, unit: "days" }] },
      { category: "Cheese", products: ["Plant-Based Cheese Alternative"], periods: [{ label: "Prepped", amount: 7, unit: "days" }] },
      { category: "Sauces", products: ["Garlic butter"], periods: [{ label: "Prepped", amount: 10, unit: "days" }, { label: "In use", amount: 12, unit: "hours" }] },
      { category: "Sauces", products: ["Liquid cheese"], periods: [{ label: "Prepped", amount: 6, unit: "days" }] },
      { category: "Bases", products: ["Prepared Double Decadence bases"], periods: [{ label: "Chilled", amount: 12, unit: "hours" }, { label: "Ambient", amount: 4, unit: "hours" }], note: "The 12-hour rule includes 8 hours chilled plus 4 hours ambient. Do not return to chill after 4 hours ambient." },
    ],
  },
  {
    id: "ambient-before-use",
    title: "Chilled - ambient before use",
    subtitle: "Prep life and ambient-use limit shown separately",
    items: [
      { category: "Sauces", products: ["Pizza sauce", "Pizza Sauce Pre-Bake Drizzle", "BBQ sauce"], periods: [{ label: "Prepped", amount: 10, unit: "days" }, { label: "Ambient use", amount: 15, unit: "hours" }] },
      { category: "Sauces", products: ["Sundried Tomato and Garlic"], periods: [{ label: "Prepped", amount: 10, unit: "days" }, { label: "Ambient use", amount: 12, unit: "hours" }] },
      { category: "Sauces", products: ["Cheese sauce"], periods: [{ label: "Prepped", amount: 8, unit: "days" }, { label: "Ambient use", amount: 15, unit: "hours" }] },
      { category: "Toppings", products: ["Sliced gherkins"], periods: [{ label: "Prepped", amount: 16, unit: "days" }], note: "Keep in brine." },
      { category: "Toppings", products: ["Sweetcorn", "Jalapenos Green"], periods: [{ label: "Prepped", amount: 11, unit: "days" }] },
      { category: "Toppings", products: ["Peppadew Piquante Peppers"], periods: [{ label: "Prepped", amount: 25, unit: "days" }] },
      { category: "Toppings", products: ["Pineapple", "Olives"], periods: [{ label: "Prepped", amount: 10, unit: "days" }] },
      { category: "Toppings", products: ["Tuna"], periods: [{ label: "Prepped", amount: 6, unit: "days" }] },
    ],
  },
  {
    id: "ambient",
    title: "Ambient items",
    subtitle: "Keep ambient",
    items: [
      { category: "Sauces", products: ["Burger sauce"], periods: [{ label: "Prepped", amount: 14, unit: "days" }] },
      { category: "Sauces", products: ["Pesto drizzle"], periods: [{ label: "Prepped", amount: 28, unit: "days" }] },
      { category: "Sauces", products: ["Habanero Hot Honey"], periods: [{ label: "Prepped", amount: 35, unit: "days" }] },
    ],
  },
];

export const SHELF_LIFE_REFERENCE_RULES = [
  { category: "Dough", products: ["Standard dough (all sizes)"], rule: "Best-before date on tray + 1 day. Follow the dough proofing chart; day 6 dough must be in good condition." },
  { category: "Cornmeal", products: ["Cornmeal"], rule: "Use the best-before date on the original pack and date the tub with it." },
  { category: "Original packaging", products: ["Franks Hot Sauce", "Butter Whirl", "Coleslaw", "Salt sachets", "Ketchup sachets", "Dip pots", "Chick'N'Dip dip pots", "Herbs", "Dr Schar gluten-free pizza base", "Drinks", "Ice cream", "Chocolate discs", "Cinnamon sugar", "Tortilla chips"], rule: "Use the date on the original packaging." },
];

export function shelfLifeProductId(product: string) {
  return product.toLocaleLowerCase("en-GB").replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export const SHELF_LIFE_PRODUCT_CATALOG = Array.from(new Map([
  ...SHELF_LIFE_SECTIONS.flatMap((section) => section.items.flatMap((item) => item.products.map((product) => [shelfLifeProductId(product), { id: shelfLifeProductId(product), product, category: item.category, section: section.title }] as const))),
  ...SHELF_LIFE_REFERENCE_RULES.flatMap((item) => item.products.map((product) => [shelfLifeProductId(product), { id: shelfLifeProductId(product), product, category: item.category, section: "Use the pack date" }] as const)),
]).values());

export function shelfLifeExpiry(anchor: Date, period: ShelfLifePeriod) {
  if (!Number.isFinite(anchor.getTime()) || period.amount <= 0) throw new Error("A valid date and positive shelf-life period are required");
  if (period.unit === "hours") return new Date(anchor.getTime() + period.amount * 60 * 60 * 1000);
  // Store shelf-life day dots count the preparation/delivery day as day one.
  // Midday avoids a UK DST transition changing the local calendar result.
  return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + period.amount - 1, 12, 0, 0, 0);
}

export function formatShelfLifeExpiry(anchor: Date, period: ShelfLifePeriod) {
  const expiry = shelfLifeExpiry(anchor, period);
  if (period.unit === "days") return expiry.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  return expiry.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}
