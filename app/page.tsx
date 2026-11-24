import { CoffeePourMenu, type CoffeeItem } from "@/components/ui/coffee-pour-menu";
import CookieBreeze from "@/components/ui/cookie-breeze";

const items: CoffeeItem[] = [
  {
    id: "espresso",
    name: "Espresso",
    subtitle: "30 ml · bold",
    description: "a short, intense shot with golden crema",
    vessel: "demitasse",
    layers: [{ type: "espresso", amount: 0.72 }],
    crema: true,
  },
  {
    id: "americano",
    name: "Americano",
    subtitle: "240 ml · smooth",
    description: "espresso over hot water",
    vessel: "glass-mug",
    layers: [
      { type: "water", amount: 0.54 },
      { type: "espresso", amount: 0.24 },
    ],
    crema: true,
    blend: 0.9,
  },
  {
    id: "cappuccino",
    name: "Cappuccino",
    subtitle: "180 ml · velvety",
    description: "espresso with steamed milk and foam",
    vessel: "cup",
    layers: [
      { type: "espresso", amount: 0.3 },
      { type: "milk", amount: 0.44 },
    ],
    foam: 0.14,
    art: "heart",
  },
  {
    id: "latte",
    name: "Latte",
    subtitle: "300 ml · mellow",
    description: "espresso with lots of steamed milk and microfoam",
    vessel: "tall-glass",
    layers: [
      { type: "espresso", amount: 0.25 },
      { type: "milk", amount: 0.51 },
    ],
    foam: 0.11,
    blend: 0.15,
  },
];

export default function Home() {
  return (
    <div className="relative w-full min-h-screen overflow-hidden">
      {/* Cookie Breeze — full-viewport background (replaces the old solid background) */}
      <div className="absolute inset-0">
        <CookieBreeze
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            aspectRatio: "auto",
            minHeight: "100vh",
          }}
        />
      </div>

      {/* Content above the background */}
      <div className="relative z-10 flex min-h-screen w-full flex-col items-center justify-center p-2 sm:p-6">
        <CoffeePourMenu items={items} defaultValue="cappuccino" className="max-w-5xl" />
        <p className="mt-4 text-center text-sm tracking-tight text-[#7a5a42]">
          by{" "}
          <a
            href="https://aakashmehra.com/ref/coffeepourmenu"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[#3a271d] underline-offset-4 hover:underline"
          >
            aakashmehra.com
          </a>
        </p>
      </div>
    </div>
  );
}
