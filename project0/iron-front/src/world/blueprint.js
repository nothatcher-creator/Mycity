// The island of Varden, as data: its places, rivers, lakes and roads. Metres; x runs east, z runs south
// (north is -z on the map), y up; the sea is at y = 0. The heightfield (heightfield.js) shapes the land
// from this, and the generators (buildings.js, vegetation.js) fill it in.

export const WORLD = 12000            // the square the island sits in, metres a side
export const HALF = WORLD / 2
export const SEED = 1987

// Places. kind: city, town, village, military, airport, industry, landmark. r: rough radius (metres).
export const PLACES = [
  { id: 'anselm', name: 'Port Anselm', kind: 'city', x: -3300, z: 3000, r: 950, style: 'modern', desc: 'Modern coastal city: towers, harbour and docks' },
  { id: 'kaldor', name: 'Kaldor', kind: 'city', x: 500, z: 800, r: 720, style: 'old', desc: 'Old inland city on the River Ost' },
  { id: 'kessel', name: 'Kessel Airbase', kind: 'airport', x: -2400, z: -1900, r: 1400, desc: 'Military and civilian airfield' },
  { id: 'halvik', name: 'Halvik', kind: 'town', x: 3700, z: 1600, r: 260, desc: 'Fishing town on the east coast' },
  { id: 'koriv', name: 'Koriv', kind: 'village', x: 1700, z: 3650, r: 230, desc: 'Farming village in the south' },
  { id: 'dresk', name: 'Dresk', kind: 'town', x: -1200, z: -3800, r: 250, desc: 'Northern town' },
  { id: 'belno', name: 'Belno', kind: 'town', x: -4300, z: -300, r: 240, desc: 'West-coast town with a fuel depot' },
  { id: 'marsk', name: 'Marsk', kind: 'town', x: 3500, z: -500, r: 240, desc: 'Logging town in the eastern foothills' },
  { id: 'tovar', name: 'Tovar', kind: 'town', x: -400, z: 2600, r: 260, desc: 'Crossroads town with garages' },
  { id: 'ilsen', name: 'Ilsen', kind: 'village', x: 1250, z: -1150, r: 200, desc: 'Lakeside village below Mount Hallen' },
  { id: 'sorn', name: 'Sorn', kind: 'village', x: -2600, z: 800, r: 220, desc: 'Farms and orchards in the west' },
  { id: 'sentinel', name: 'Camp Sentinel', kind: 'military', x: 500, z: -4200, r: 230, desc: 'Northern army base' },
  { id: 'grail', name: 'Fort Grail', kind: 'military', x: 2900, z: -1700, r: 160, desc: 'Mountain fort on Hallen\'s shoulder' },
  { id: 'hallen', name: 'Mount Hallen', kind: 'landmark', x: 2440, z: -2760, r: 60, desc: 'Summit radio station' },
  { id: 'quarry', name: 'Rask Quarry', kind: 'industry', x: -200, z: -2300, r: 180, desc: 'Stone quarry' },
  { id: 'lumber', name: 'Marsk Sawmill', kind: 'industry', x: 3100, z: -900, r: 120, desc: 'Logging site' },
  { id: 'power', name: 'Anselm Power Station', kind: 'industry', x: -1800, z: 3600, r: 160, desc: 'Coastal power station' },
]
export const place = id => PLACES.find(p => p.id === id)

// The land: an ellipse roughed up by noise, with capes that keep places on land and bays that let the sea in.
export const ISLAND = { rx: 5200, rz: 5000, capes: [
  { x: -3100, z: 2800, r: 900, a: 0.25 }, { x: 3900, z: 1500, r: 600, a: 0.2 }, { x: -4400, z: -300, r: 600, a: 0.2 },
  { x: 1700, z: 3650, r: 800, a: 0.25 }, { x: -1200, z: -3800, r: 700, a: 0.3 }, { x: 500, z: -4200, r: 700, a: 0.3 },
  { x: -1800, z: 3500, r: 600, a: 0.2 }, { x: -2600, z: -1900, r: 1200, a: 0.15 },
], bays: [
  // the great south-west bay that Port Anselm's harbour opens on
  { x: -4500, z: 4300, r: 1500, a: 0.75 }, { x: -3700, z: 3650, r: 420, a: 0.5 },
  { x: 4900, z: 1700, r: 900, a: 0.55 }, { x: -5300, z: -300, r: 800, a: 0.5 },
  { x: 4500, z: 2700, r: 600, a: 0.35 }, { x: -200, z: 5000, r: 800, a: 0.35 },
  { x: 4800, z: -2500, r: 800, a: 0.35 }, { x: -5000, z: -2300, r: 800, a: 0.35 }, { x: 2600, z: 5000, r: 700, a: 0.3 },
  { x: -1500, z: -5200, r: 700, a: 0.3 },
] }

// Mountains: peaks of a massif (h metres, r spread), and a lower range of hills.
export const PEAKS = [
  { x: 2300, z: -2500, h: 720, r: 1500, ridge: 0.35 },
  { x: 3150, z: -3350, h: 330, r: 850, ridge: 0.4 },
  { x: 1350, z: -3100, h: 260, r: 750, ridge: 0.4 },
  { x: 3350, z: -1650, h: 170, r: 650, ridge: 0.3 },
  { x: -4000, z: -2500, h: 210, r: 1200, ridge: 0.25 },
  { x: 2500, z: 2300, h: 140, r: 900, ridge: 0.2 },
]

// Flat ground for towns, the airfield and bases. h: null takes the land's own height there. w/d and angle
// make an oriented rectangle instead of a disc.
export const PLATEAUS = [
  { id: 'anselm', x: -3300, z: 3000, r: 950, fall: 320, h: 6 },
  { id: 'kaldor', x: 500, z: 800, r: 720, fall: 340, h: null },
  { id: 'kessel', x: -2400, z: -1900, w: 1500, d: 430, angle: 0.26, fall: 380, h: null },
  ...['halvik', 'koriv', 'dresk', 'belno', 'marsk', 'tovar', 'ilsen', 'sorn', 'sentinel', 'quarry', 'lumber', 'power']
    .map(id => { const p = PLACES.find(q => q.id === id); return { id, x: p.x, z: p.z, r: p.r * 0.9, fall: 160, h: id === 'halvik' ? 4 : null } }),
  { id: 'grail', x: 2900, z: -1700, r: 150, fall: 120, h: null },
  { id: 'hallen', x: 2440, z: -2760, r: 55, fall: 70, h: null },
]

export const LAKES = [
  { id: 'selna', name: 'Lake Selna', x: 1350, z: -650, r: 380, depth: 9 },
  { id: 'mirror', name: 'Mirror Pond', x: -1500, z: 1500, r: 160, depth: 5 },
  { id: 'tarn', name: 'Hallen Tarn', x: 1800, z: -2050, r: 120, depth: 6 },
]

// Rivers run from their first point to the sea; width in metres.
export const RIVERS = [
  { id: 'ost', name: 'River Ost', width: 34, pts: [[2000, -1750], [1600, -1050], [1350, -650], [1050, -150], [880, 380], [760, 900], [900, 1500], [1000, 2200], [1250, 2900], [1400, 3500], [1450, 4300], [1450, 5600]] },
  { id: 'vel', name: 'River Vel', width: 26, pts: [[-500, -1700], [-900, -1100], [-1600, -450], [-2150, 450], [-2600, 1150], [-3000, 1650], [-3700, 1950], [-4600, 2100], [-5800, 2150]] },
  { id: 'brook', name: 'Hallen Brook', width: 12, pts: [[2700, -2000], [3200, -1200], [3600, -600], [4100, 0], [4500, 500], [5600, 700]] },
]

// Roads: highways (10 m), roads (7 m), dirt tracks (5 m), as the places they join. tools/roadgen.mjs routes
// each over the land (gentle grades, switchbacks on the mountain, short bridges) into roads-data.js.
export const ROAD_ROUTES = [
  { id: 'h1', kind: 'highway', via: [[-2750, 2650], [-400, 2600], [400, 1050]] },
  { id: 'h2', kind: 'highway', via: [[600, 550], [900, -150], [3500, -500], [3700, 1600]] },
  { id: 'r15', kind: 'road', via: [[900, -150], [1150, -1100]] },
  { id: 'r3', kind: 'road', via: [[3700, 1600], [1700, 3650], [-400, 2600]] },
  { id: 'h4', kind: 'highway', via: [[150, 650], [-1300, 100], [-2350, -1650]] },
  { id: 'r5', kind: 'road', via: [[-2900, -1700], [-4300, -300], [-3400, 2350]] },
  { id: 'r6', kind: 'road', via: [[-1300, 100], [-1350, -1600], [-1200, -3800], [500, -4200]] },
  { id: 'r7', kind: 'dirt', via: [[500, -4200], [2440, -2760]] },
  { id: 'r8', kind: 'dirt', via: [[1150, -1100], [2900, -1700]] },
  { id: 'r9', kind: 'dirt', via: [[-200, -2300], [-1350, -1600]] },
  { id: 'r10', kind: 'dirt', via: [[3100, -900], [3500, -500]] },
  { id: 'r11', kind: 'road', via: [[-1300, 100], [-2600, 800], [-3800, 1300]] },
  { id: 'r12', kind: 'road', via: [[-2600, 800], [-1250, 2520]] },
  { id: 'r13', kind: 'dirt', via: [[-400, 2700], [-1800, 3550]] },
  { id: 'r14', kind: 'dirt', via: [[3500, -500], [2900, -1700]] },
]
export const ROAD_WIDTH = { highway: 10, road: 7, dirt: 5, street: 10, runway: 45, taxiway: 22, apron: 32 }

// Colours of the land (linear-ish sRGB values 0..1), shared by the terrain mesh and the map.
export const LAND_COLORS = {
  sand: [0.86, 0.78, 0.55], grass: [0.42, 0.62, 0.26], grass2: [0.55, 0.68, 0.3], meadow: [0.62, 0.7, 0.32],
  forest: [0.2, 0.38, 0.17], rock: [0.52, 0.5, 0.47], rockDark: [0.38, 0.37, 0.36], dirt: [0.55, 0.43, 0.3],
  snow: [0.92, 0.94, 0.96], seabed: [0.62, 0.6, 0.45], plateau: [0.5, 0.55, 0.32], field1: [0.85, 0.74, 0.32],
  field2: [0.52, 0.36, 0.22], field3: [0.62, 0.75, 0.28], asphalt: [0.2, 0.2, 0.22], concrete: [0.62, 0.62, 0.6],
}
