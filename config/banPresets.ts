// Ban presets for the Rules panel. Edit freely: names are matched ignoring case and
// punctuation ("Multi Headed" finds "Multi-Headed"); names missing from a data version are
// listed as such. These are judgment calls from the ability descriptions, not an official list.
//
// "banned": a Pokémon with one of these must be rerolled or boxed.
// "limited": counts toward the stack limit (e.g. at most 1 per Pokémon, counting innates).

export type BanPreset = { id: string; label: string; rule: "banned" | "limited"; names: string[] };

export const BAN_PRESETS: BanPreset[] = [
  {
    id: "outright",
    label: "Ban outright",
    rule: "banned",
    names: [
      "Prismatic Fur", "Wonder Guard", "Huge Power", "Pure Power", "Cryptic Power", "Feline Prowess",
      "Fur Coat", "Ice Scales", "Fire Scales", "Ice Plumes", "Terastal Treasure", "Aura Armor",
      "Primal Armor", "Soul Linker", "Imposter", "Moody",
    ],
  },
  {
    id: "strong",
    label: "Strong (harder run)",
    rule: "limited",
    names: [
      "Multiscale", "Shadow Shield", "Brain Mass", "Lead Coat", "Chrome Coat", "Parental Bond",
      "Multi Headed", "Speed Boost", "Simple", "Contrary", "Shadow Tag", "Arena Trap", "Magic Guard",
      "Regenerator", "Sturdy", "Readied Action", "Adaptability", "Tinted Lens",
    ],
  },
];
