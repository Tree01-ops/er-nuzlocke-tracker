// Nuzlocke areas in Hoenn story order. Reorder freely; the build script follows this file.
//
// Each area claims game maps by name. A pattern matches a map whose name equals it or starts
// with it followed by a space ("Granite Cave" matches "Granite Cave B1F", "Route 11" does not
// match "Route 111"). When several areas match, the longest pattern wins, so "Route 111 Desert"
// beats "Route 111". Maps no area claims end up in an "Unsorted" group and are printed by the
// build script.
//
// Placement of Elite Redux's added areas (Seaspray Cave, Ashen Woods, Ember Path,
// Sandstrewn Ruins, ...) is a guess.

export type AreaConfig = { name: string; match?: string[] };
export type AreaGroup = { group: string; areas: AreaConfig[] };

// Maps to drop entirely (unused leftovers in the game data).
export const IGNORED_MAPS = ["Cave Of Origin Unused"];

export const AREA_ORDER: AreaGroup[] = [
  {
    group: "Littleroot to Rustboro",
    areas: [
      { name: "Littleroot Town" },
      { name: "Route 101" },
      { name: "Oldale Town" },
      { name: "Route 103" },
      { name: "Route 102" },
      { name: "Petalburg City" },
      { name: "Route 104" },
      { name: "Petalburg Woods" },
      { name: "Rustboro City" },
      { name: "Route 116" },
      { name: "Rusturf Tunnel" },
    ],
  },
  {
    group: "Dewford and Slateport",
    areas: [
      { name: "Route 105" },
      { name: "Dewford Town" },
      { name: "Dewford Meadow" },
      { name: "Dewford Manor" },
      { name: "Route 106" },
      { name: "Granite Cave" },
      { name: "Route 107" },
      { name: "Route 108" },
      { name: "Abandoned Ship" },
      { name: "Route 109" },
      { name: "Slateport City" },
      { name: "Route 110" },
    ],
  },
  {
    group: "Mauville and the volcano",
    areas: [
      { name: "Mauville City" },
      { name: "Route 117" },
      { name: "Verdanturf Town" },
      { name: "Verdanturf Meadow" },
      { name: "Route 111" },
      {
        name: "Route 111 Desert",
        match: ["Route 111 Desert", "Route 111 Sunhollow Ruins", "Route 111 Ruins Exterior"],
      },
      { name: "Route 112" },
      { name: "Fiery Path" },
      { name: "Ember Path" },
      { name: "Route 113" },
      { name: "Ashen Woods" },
      { name: "Fallarbor Town" },
      { name: "Route 114" },
      { name: "Meteor Falls" },
      { name: "Route 115" },
      { name: "Seaspray Cave" },
      { name: "Jagged Pass" },
      { name: "Lavaridge Town" },
    ],
  },
  {
    group: "Desert and New Mauville",
    areas: [
      { name: "Sandstrewn Ruins" },
      { name: "Mirage Tower" },
      { name: "Desert Underpass" },
      { name: "New Mauville" },
    ],
  },
  {
    group: "Fortree to Lilycove",
    areas: [
      { name: "Route 118" },
      { name: "Route 119" },
      { name: "Route 120" },
      { name: "Route 121" },
      { name: "Fortree City" },
      { name: "Scorched Slab" },
      { name: "Safari Zone" },
      { name: "Lilycove City" },
      { name: "Route 122" },
      { name: "Mt Pyre" },
      { name: "Route 123" },
      { name: "Magma Hideout" },
      { name: "Aqua Hideout" },
    ],
  },
  {
    group: "Mossdeep and Sootopolis",
    areas: [
      { name: "Route 124" },
      { name: "Mossdeep City" },
      { name: "Route 125" },
      { name: "Shoal Cave" },
      { name: "Route 126" },
      { name: "Route 127" },
      { name: "Route 128" },
      { name: "Underwater Routes", match: ["Underwater"] },
      { name: "Sootopolis City" },
      { name: "Seafloor Cavern" },
      { name: "Cave of Origin", match: ["Cave Of Origin"] },
    ],
  },
  {
    group: "Southern sea and Ever Grande",
    areas: [
      { name: "Route 129" },
      { name: "Route 130" },
      { name: "Route 131" },
      { name: "Route 132" },
      { name: "Route 133" },
      { name: "Route 134" },
      { name: "Pacifidlog Town" },
      { name: "Sky Pillar" },
      { name: "Ever Grande City", match: ["Ever Grande City", "Evergrande City"] },
      { name: "Victory Road" },
    ],
  },
  {
    group: "Side areas and postgame",
    areas: [
      { name: "Artisan Cave" },
      { name: "Altering Cave" },
      { name: "Secret Dungeon" },
      {
        name: "Berry Trees",
        match: ["Tree StageSprouted", "Tree StageTaller", "Tree StageFlowering", "Tree StageBerries"],
      },
      { name: "Southern Island" },
      { name: "Faraway Island" },
      { name: "Navel Rock" },
      { name: "Birth Island" },
      { name: "Sealed Chamber" },
      { name: "Desert Ruins" },
      { name: "Island Cave" },
      { name: "Ancient Tomb" },
      { name: "Marine Cave" },
      { name: "Terra Cave" },
      { name: "Battle Frontier" },
    ],
  },
];
