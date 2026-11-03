// The arsenal of Varden: every gun and launcher as data. Names are the game's own.
// Ballistics: v (muzzle velocity m/s), mass (bullet g), drag (per metre: how fast it slows), dmg (damage to an
// unarmoured torso at the muzzle, out of 100), pen (armour/material penetration, 1 = rifle round).
// Handling: rpm, modes ('semi', 'burst', 'auto', 'bolt', 'pump', 'single'), mag, reload/reloadEmpty (s),
// recoil (vertical, horizontal, in degrees), sway, moa (spread), ads (s), weight (kg).
// model: how weapon-models.js builds it (body, barrel length, stock, magazine, handguard...).

export const AMMO = {
  '9mm': { name: '9 mm', v: 380, mass: 8, drag: 0.0016, dmg: 28, pen: 0.35, tracer: 0, crate: 120 },
  '45': { name: '11.4 mm', v: 270, mass: 15, drag: 0.0018, dmg: 34, pen: 0.3, crate: 90 },
  '57': { name: '5.7 mm', v: 715, mass: 2, drag: 0.0012, dmg: 24, pen: 0.6, crate: 150 },
  '556': { name: '5.56 mm', v: 920, mass: 4, drag: 0.0009, dmg: 34, pen: 1, tracer: 0, crate: 210 },
  '545': { name: '5.45 mm', v: 880, mass: 3.4, drag: 0.0009, dmg: 33, pen: 0.95, crate: 210 },
  '762s': { name: '7.62 mm short', v: 715, mass: 8, drag: 0.0011, dmg: 40, pen: 1.05, crate: 180 },
  '762n': { name: '7.62 mm NATO', v: 840, mass: 9.5, drag: 0.0007, dmg: 52, pen: 1.4, crate: 160 },
  '762l': { name: '7.62 mm long', v: 830, mass: 9.6, drag: 0.0007, dmg: 53, pen: 1.4, crate: 160 },
  '338': { name: '8.6 mm magnum', v: 900, mass: 16, drag: 0.0005, dmg: 90, pen: 2.2, crate: 50 },
  '50': { name: '12.7 mm', v: 880, mass: 42, drag: 0.0004, dmg: 160, pen: 4, crate: 40 },
  '12g': { name: '12 gauge', v: 400, mass: 3.5, drag: 0.004, dmg: 15, pen: 0.2, pellets: 9, crate: 60 },
  '12slug': { name: '12 gauge slug', v: 450, mass: 28, drag: 0.002, dmg: 75, pen: 0.6, crate: 40 },
  '44': { name: '11.2 mm magnum', v: 440, mass: 15.5, drag: 0.0015, dmg: 55, pen: 0.55, crate: 60 },
  '40mm': { name: '40 mm grenade', v: 76, mass: 230, drag: 0.0003, dmg: 0, explosive: { radius: 7, dmg: 120 }, crate: 12 },
  'rocket': { name: 'HEAT rocket', v: 140, mass: 2500, drag: 0, dmg: 0, explosive: { radius: 5, dmg: 140, heat: 600 }, rocket: { accel: 160, max: 300 }, crate: 4 },
  'rocket84': { name: '84 mm rocket', v: 230, mass: 3000, drag: 0, dmg: 0, explosive: { radius: 5, dmg: 150, heat: 520 }, crate: 1 },
  'atgm': { name: 'AT missile', v: 60, mass: 11000, drag: 0, dmg: 0, explosive: { radius: 6, dmg: 160, heat: 900 }, rocket: { accel: 120, max: 260, guided: 'ground' }, crate: 1 },
  'aam': { name: 'AA missile', v: 80, mass: 10000, drag: 0, dmg: 0, explosive: { radius: 8, dmg: 200, heat: 400 }, rocket: { accel: 300, max: 650, guided: 'air' }, crate: 1 },
  '20mm': { name: '20 mm', v: 1030, mass: 100, drag: 0.0006, dmg: 80, pen: 4, explosive: { radius: 2.5, dmg: 50 }, crate: 400 },
  '30mm': { name: '30 mm', v: 1080, mass: 390, drag: 0.0005, dmg: 120, pen: 6, explosive: { radius: 3.5, dmg: 70, heat: 60 }, crate: 200 },
  '120mm': { name: '120 mm', v: 1650, mass: 8000, drag: 0.0002, dmg: 0, pen: 40, explosive: { radius: 6, dmg: 200, heat: 1400 }, crate: 30 },
  '70mm': { name: '70 mm rocket', v: 80, mass: 6000, drag: 0, dmg: 0, explosive: { radius: 7, dmg: 160, heat: 300 }, rocket: { accel: 500, max: 700 }, crate: 38 },
  'bomb': { name: 'Bomb', v: 0, mass: 250000, drag: 0.00005, dmg: 0, explosive: { radius: 18, dmg: 400, heat: 1500 }, crate: 4 },
}

const R = (o) => ({ cat: 'rifle', modes: ['semi', 'auto'], mag: 30, reload: 2.4, reloadEmpty: 3.0, ads: 0.25, sway: 1, moa: 2.5, weight: 3.4, slot: 'primary', optic: 'iron', rails: true, ...o })

export const WEAPONS = [
  // ---- assault rifles ----
  R({ id: 'vr4c', name: 'VR-4 Carbine', ammo: '556', rpm: 820, recoil: [0.55, 0.22], weight: 3.0, moa: 2.6, desc: 'Light, quick carbine. The Coalition\'s standard.', model: { body: 'ar', barrel: 0.36, stock: 'collapsible', mag: 'stanag', hand: 'rail' } }),
  R({ id: 'vr4l', name: 'VR-4L Rifle', ammo: '556', rpm: 760, recoil: [0.5, 0.2], weight: 3.6, moa: 1.8, vmul: 1.04, desc: 'Full-length barrel: steadier at range.', model: { body: 'ar', barrel: 0.5, stock: 'fixed', mag: 'stanag', hand: 'rail' } }),
  R({ id: 'ks47', name: 'KS-47', ammo: '762s', rpm: 600, recoil: [0.85, 0.35], weight: 3.9, moa: 3.2, desc: 'Rugged and hard-hitting; climbs on full auto.', faction: 'nlf', model: { body: 'ak', barrel: 0.42, stock: 'wood', mag: 'curved', hand: 'wood' } }),
  R({ id: 'ks74', name: 'KS-74M', ammo: '545', rpm: 650, recoil: [0.5, 0.25], weight: 3.4, moa: 2.6, desc: 'Flat-shooting small-calibre rifle with a big brake.', model: { body: 'ak', barrel: 0.42, stock: 'folding', mag: 'curved', hand: 'poly', brake: true } }),
  R({ id: 'tarn', name: 'Tarn Bullpup', ammo: '556', rpm: 800, recoil: [0.5, 0.25], weight: 3.3, moa: 2.2, ads: 0.28, desc: 'Long barrel in a short rifle.', model: { body: 'bullpup', barrel: 0.5, mag: 'stanag' } }),
  R({ id: 'brenner', name: 'Brenner AR', ammo: '556', rpm: 750, modes: ['semi', 'burst', 'auto'], recoil: [0.48, 0.2], weight: 3.5, moa: 2.0, desc: 'Varden Defence Forces rifle. Three-round burst.', faction: 'vdf', model: { body: 'ar', barrel: 0.44, stock: 'fixed', mag: 'stanag', hand: 'poly' } }),
  R({ id: 'scr7', name: 'SCR-7 Compact', ammo: '762s', rpm: 700, recoil: [0.7, 0.3], weight: 2.9, moa: 3.5, vmul: 0.85, suppressed: true, desc: 'Short and integrally suppressed. Quiet in close.', model: { body: 'ar', barrel: 0.24, stock: 'collapsible', mag: 'stanag', hand: 'rail', can: true } }),
  R({ id: 'm70', name: 'Varden M70', ammo: '762s', rpm: 620, recoil: [0.8, 0.32], weight: 3.8, moa: 3, rails: false, desc: 'Old service rifle of the island\'s militia.', faction: 'res', model: { body: 'ak', barrel: 0.42, stock: 'wood', mag: 'curved', hand: 'wood' } }),
  // ---- battle rifles ----
  R({ cat: 'battle', id: 'br51', name: 'BR-51', ammo: '762n', rpm: 600, mag: 20, recoil: [1.15, 0.4], weight: 4.4, moa: 1.6, ads: 0.3, desc: 'Full-power battle rifle.', model: { body: 'ar', barrel: 0.5, stock: 'fixed', mag: 'box20', hand: 'rail', thick: 1.15 } }),
  R({ cat: 'battle', id: 'kestrel17', name: 'Kestrel 17', ammo: '762n', rpm: 560, mag: 20, recoil: [1.05, 0.38], weight: 4.1, moa: 1.5, ads: 0.3, desc: 'Modular battle rifle with a folding stock.', model: { body: 'scar', barrel: 0.43, stock: 'folding', mag: 'box20', hand: 'rail' } }),
  R({ cat: 'battle', id: 'faro', name: 'Faro BR', ammo: '762n', rpm: 650, mag: 20, recoil: [1.2, 0.42], weight: 4.5, moa: 1.8, rails: false, desc: 'Classic long rifle of the old army.', faction: 'vdf', model: { body: 'fal', barrel: 0.53, stock: 'wood', mag: 'box20', hand: 'wood' } }),
  R({ cat: 'battle', id: 's14', name: 'Sentinel 14', ammo: '762n', rpm: 700, mag: 20, recoil: [1.25, 0.45], weight: 4.6, moa: 1.4, ads: 0.32, desc: 'Wooden-stocked rifle, still deadly.', model: { body: 'm14', barrel: 0.56, stock: 'wood', mag: 'box20', hand: 'wood' } }),
  // ---- SMGs ----
  R({ cat: 'smg', id: 'vespa', name: 'Vespa SMG', ammo: '9mm', rpm: 900, recoil: [0.3, 0.2], weight: 2.6, moa: 4, ads: 0.18, desc: 'Reliable 9 mm submachine gun.', model: { body: 'smg', barrel: 0.22, stock: 'collapsible', mag: 'straight', hand: 'poly' } }),
  R({ cat: 'smg', id: 'mp9c', name: 'MP-9C', ammo: '9mm', rpm: 1100, mag: 25, recoil: [0.36, 0.28], weight: 1.6, moa: 5, ads: 0.15, desc: 'Tiny and fast-firing.', model: { body: 'smg', barrel: 0.13, stock: 'folding', mag: 'straight', hand: 'none', compact: true } }),
  R({ cat: 'smg', id: 'gale45', name: 'Gale .45', ammo: '45', rpm: 650, mag: 25, recoil: [0.4, 0.22], weight: 2.7, moa: 4.2, ads: 0.18, desc: 'Heavy, slow rounds; low recoil.', model: { body: 'smg', barrel: 0.2, stock: 'fixed', mag: 'straight', hand: 'poly', thick: 1.1 } }),
  R({ cat: 'smg', id: 'pdw57', name: 'PDW-57', ammo: '57', rpm: 900, mag: 50, recoil: [0.28, 0.16], weight: 2.8, moa: 3.5, ads: 0.17, desc: 'Fifty rounds of armour-piercing 5.7.', model: { body: 'p90', barrel: 0.26 } }),
  R({ cat: 'smg', id: 'saigapp', name: 'Saiga PP', ammo: '9mm', rpm: 700, mag: 64, recoil: [0.32, 0.18], weight: 2.5, moa: 4.2, ads: 0.2, desc: 'Helical 64-round magazine.', faction: 'nlf', model: { body: 'ak', barrel: 0.23, stock: 'folding', mag: 'helical', hand: 'poly' } }),
  // ---- LMGs ----
  R({ cat: 'lmg', id: 'halberd', name: 'Halberd LMG', ammo: '556', rpm: 800, mag: 100, belt: true, reload: 6, reloadEmpty: 7, recoil: [0.5, 0.3], weight: 7.5, moa: 3, ads: 0.4, sway: 1.5, bipod: true, desc: 'Belt-fed squad automatic weapon.', modes: ['auto'], model: { body: 'lmg', barrel: 0.46, stock: 'fixed', mag: 'box100', hand: 'rail' } }),
  R({ cat: 'lmg', id: 'ks47l', name: 'KS-47L', ammo: '762s', rpm: 600, mag: 75, reload: 3.4, reloadEmpty: 4.0, recoil: [0.7, 0.3], weight: 5.4, moa: 2.6, ads: 0.34, sway: 1.3, bipod: true, desc: 'Heavy-barrel rifle with a drum.', faction: 'nlf', model: { body: 'ak', barrel: 0.59, stock: 'wood', mag: 'drum', hand: 'wood' } }),
  R({ cat: 'lmg', id: 'tarnl', name: 'Tarn L', ammo: '556', rpm: 760, mag: 60, reload: 3, reloadEmpty: 3.6, recoil: [0.45, 0.24], weight: 4.6, moa: 2.4, ads: 0.32, bipod: true, desc: 'Bullpup support rifle, 60-round mags.', model: { body: 'bullpup', barrel: 0.62, mag: 'stanag', long: true } }),
  R({ cat: 'lmg', id: 'volt', name: 'Volt LMG', ammo: '556', rpm: 650, mag: 100, belt: true, reload: 5.5, reloadEmpty: 6.5, recoil: [0.4, 0.22], weight: 5.0, moa: 3, ads: 0.36, bipod: true, modes: ['auto'], desc: 'Light, controllable drum-fed gun.', model: { body: 'lmg', barrel: 0.4, stock: 'collapsible', mag: 'drum', hand: 'rail' } }),
  // ---- MMGs ----
  R({ cat: 'mmg', id: 'ironwood', name: 'Ironwood MG', ammo: '762n', rpm: 650, mag: 100, belt: true, reload: 7, reloadEmpty: 8, recoil: [0.9, 0.4], weight: 11.5, moa: 3, ads: 0.5, sway: 2, bipod: true, modes: ['auto'], desc: 'General-purpose machine gun. Suppresses everything.', model: { body: 'lmg', barrel: 0.55, stock: 'fixed', mag: 'box100', hand: 'none', heavy: true } }),
  R({ cat: 'mmg', id: 'krag', name: 'Krag MG', ammo: '762l', rpm: 700, mag: 100, belt: true, reload: 7, reloadEmpty: 8, recoil: [0.95, 0.42], weight: 8.5, moa: 3.2, ads: 0.48, sway: 1.9, bipod: true, modes: ['auto'], faction: 'nlf', desc: 'Long-cartridge machine gun.', model: { body: 'lmg', barrel: 0.6, stock: 'skeleton', mag: 'box100', hand: 'none', heavy: true } }),
  R({ cat: 'mmg', id: 'thunder3', name: 'Thunder 3', ammo: '762n', rpm: 1150, mag: 100, belt: true, reload: 7.5, reloadEmpty: 8.5, recoil: [1.05, 0.5], weight: 11.6, moa: 3.6, ads: 0.52, sway: 2.1, bipod: true, modes: ['auto'], desc: 'Buzzsaw rate of fire.', model: { body: 'lmg', barrel: 0.56, stock: 'fixed', mag: 'box100', hand: 'jacket', heavy: true } }),
  // ---- sniper rifles ----
  R({ cat: 'sniper', id: 'longbow', name: 'Longbow .338', ammo: '338', rpm: 40, mag: 5, modes: ['bolt'], reload: 3.4, reloadEmpty: 4.2, recoil: [3.2, 0.6], weight: 6.9, moa: 0.5, ads: 0.4, optic: 'lr525', bipod: true, desc: 'Magnum bolt-action. Reaches across valleys.', model: { body: 'bolt', barrel: 0.68, stock: 'chassis', mag: 'box5', hand: 'rail' } }),
  R({ cat: 'sniper', id: 'hallen24', name: 'Hallen M24', ammo: '762n', rpm: 45, mag: 5, modes: ['bolt'], reload: 3.0, reloadEmpty: 3.8, recoil: [2.2, 0.4], weight: 5.5, moa: 0.6, ads: 0.36, optic: 'hunter8', bipod: true, desc: 'Traditional bolt rifle in 7.62.', model: { body: 'bolt', barrel: 0.61, stock: 'sporter', mag: 'internal', hand: 'none' } }),
  R({ cat: 'sniper', id: 'titan50', name: 'Titan .50', ammo: '50', rpm: 90, mag: 10, modes: ['semi'], reload: 4.5, reloadEmpty: 5.2, recoil: [4.5, 1.0], weight: 13.5, moa: 1.2, ads: 0.6, sway: 2, optic: 'lr525', bipod: true, desc: 'Anti-materiel rifle. Stops light vehicles.', model: { body: 'bolt', barrel: 0.74, stock: 'chassis', mag: 'box10', hand: 'rail', heavy: true, brake: true } }),
  R({ cat: 'sniper', id: 'kestrellr', name: 'Kestrel LR', ammo: '762n', rpm: 45, mag: 10, modes: ['bolt'], reload: 3.0, reloadEmpty: 3.6, recoil: [2.0, 0.4], weight: 5.9, moa: 0.45, ads: 0.36, optic: 'hunter8', bipod: true, desc: 'Precision chassis rifle.', model: { body: 'bolt', barrel: 0.6, stock: 'chassis', mag: 'box10', hand: 'rail' } }),
  R({ cat: 'sniper', id: 'ghostsr', name: 'Ghost SR', ammo: '338', rpm: 40, mag: 5, modes: ['bolt'], reload: 3.4, reloadEmpty: 4.2, recoil: [2.6, 0.5], weight: 7.5, moa: 0.55, ads: 0.42, optic: 'lr525', suppressed: true, vmul: 0.97, bipod: true, desc: 'Suppressed magnum: the shot nobody hears.', model: { body: 'bolt', barrel: 0.55, stock: 'chassis', mag: 'box5', hand: 'rail', can: true } }),
  // ---- DMRs ----
  R({ cat: 'dmr', id: 'dragoon', name: 'Dragoon SV', ammo: '762l', rpm: 120, mag: 10, modes: ['semi'], reload: 2.8, reloadEmpty: 3.3, recoil: [1.6, 0.4], weight: 4.4, moa: 1.1, ads: 0.34, optic: 'pso4', faction: 'nlf', desc: 'Long semi-automatic marksman rifle.', model: { body: 'svd', barrel: 0.62, stock: 'skeleton', mag: 'box10', hand: 'wood' } }),
  R({ cat: 'dmr', id: 'spectre', name: 'Spectre DMR', ammo: '556', rpm: 150, mag: 20, modes: ['semi'], reload: 2.4, reloadEmpty: 2.9, recoil: [0.7, 0.2], weight: 4.0, moa: 0.9, ads: 0.3, optic: 'ta4', desc: 'Accurate 5.56 marksman rifle.', model: { body: 'ar', barrel: 0.46, stock: 'fixed', mag: 'box20', hand: 'rail', can: false } }),
  R({ cat: 'dmr', id: 'varmint', name: 'Varmint DMR', ammo: '762n', rpm: 140, mag: 20, modes: ['semi'], reload: 2.8, reloadEmpty: 3.3, recoil: [1.4, 0.35], weight: 4.8, moa: 0.8, ads: 0.34, optic: 'lpvo', bipod: true, desc: 'Precise 7.62 rifle for the squad marksman.', model: { body: 'ar', barrel: 0.51, stock: 'chassis', mag: 'box20', hand: 'rail', thick: 1.1 } }),
  R({ cat: 'dmr', id: 'br51m', name: 'BR-51 Marksman', ammo: '762n', rpm: 300, mag: 20, modes: ['semi'], reload: 2.7, reloadEmpty: 3.2, recoil: [1.3, 0.35], weight: 5.0, moa: 1.0, ads: 0.34, optic: 'ta4', bipod: true, desc: 'Battle rifle tuned for precision.', model: { body: 'ar', barrel: 0.56, stock: 'chassis', mag: 'box20', hand: 'rail', thick: 1.15 } }),
  // ---- shotguns ----
  R({ cat: 'shotgun', id: 'ranch870', name: 'Ranch 870', ammo: '12g', rpm: 70, mag: 6, tube: true, modes: ['pump'], reload: 0.55, reloadEmpty: 0.55, recoil: [2.4, 0.6], weight: 3.6, moa: 60, ads: 0.24, rails: false, desc: 'Pump-action shotgun. Loads shell by shell.', model: { body: 'shotgun', barrel: 0.5, stock: 'wood', mag: 'tube', hand: 'pump' } }),
  R({ cat: 'shotgun', id: 'brecher', name: 'Brecher Auto', ammo: '12g', rpm: 240, mag: 7, tube: true, modes: ['semi'], reload: 0.5, reloadEmpty: 0.5, recoil: [2.0, 0.6], weight: 3.8, moa: 55, ads: 0.24, desc: 'Semi-automatic tactical shotgun.', model: { body: 'shotgun', barrel: 0.47, stock: 'collapsible', mag: 'tube', hand: 'rail' } }),
  R({ cat: 'shotgun', id: 'ks12', name: 'KS-12', ammo: '12g', rpm: 250, mag: 8, modes: ['semi'], reload: 2.8, reloadEmpty: 3.4, recoil: [2.2, 0.7], weight: 3.9, moa: 58, ads: 0.26, faction: 'nlf', desc: 'Magazine-fed combat shotgun.', model: { body: 'ak', barrel: 0.43, stock: 'folding', mag: 'box10', hand: 'poly', thick: 1.1 } }),
  R({ cat: 'shotgun', id: 'farmer2b', name: 'Farmer\'s 2B', ammo: '12slug', rpm: 300, mag: 2, modes: ['semi'], reload: 2.4, reloadEmpty: 2.4, recoil: [3.0, 0.8], weight: 3.2, moa: 8, ads: 0.24, rails: false, desc: 'Double-barrelled, loaded with slugs.', faction: 'res', model: { body: 'shotgun', barrel: 0.66, stock: 'wood', mag: 'none', hand: 'wood', double: true } }),
  // ---- pistols ----
  R({ cat: 'pistol', id: 'p17', name: 'P-17', ammo: '9mm', rpm: 400, mag: 17, slot: 'sidearm', modes: ['semi'], reload: 1.6, reloadEmpty: 2.0, recoil: [0.9, 0.3], weight: 0.9, moa: 6, ads: 0.14, desc: 'Standard 9 mm sidearm.', model: { body: 'pistol', barrel: 0.11 } }),
  R({ cat: 'pistol', id: 'vm9', name: 'VM-9', ammo: '9mm', rpm: 380, mag: 8, slot: 'sidearm', modes: ['semi'], reload: 1.6, reloadEmpty: 2.0, recoil: [1.0, 0.3], weight: 0.8, moa: 7, ads: 0.14, rails: false, faction: 'nlf', desc: 'Old, small, dependable.', model: { body: 'pistol', barrel: 0.09, small: true } }),
  R({ cat: 'pistol', id: 'ranger44', name: 'Ranger .44', ammo: '44', rpm: 160, mag: 6, slot: 'sidearm', modes: ['semi'], reload: 3.2, reloadEmpty: 3.2, recoil: [3.2, 0.6], weight: 1.4, moa: 4, ads: 0.18, rails: false, desc: 'Six shots of magnum.', model: { body: 'revolver', barrel: 0.16 } }),
  R({ cat: 'pistol', id: 'colonel45', name: 'Colonel .45', ammo: '45', rpm: 350, mag: 8, slot: 'sidearm', modes: ['semi'], reload: 1.7, reloadEmpty: 2.1, recoil: [1.4, 0.35], weight: 1.1, moa: 5, ads: 0.15, desc: 'Big, slow, final.', faction: 'vdf', model: { body: 'pistol', barrel: 0.13 } }),
  R({ cat: 'pistol', id: 'glide18', name: 'Glide 18', ammo: '9mm', rpm: 1100, mag: 33, slot: 'sidearm', modes: ['semi', 'auto'], reload: 1.8, reloadEmpty: 2.2, recoil: [0.8, 0.5], weight: 1.0, moa: 8, ads: 0.14, desc: 'Machine pistol with a long magazine.', model: { body: 'pistol', barrel: 0.11, longmag: true } }),
  // ---- launchers ----
  R({ cat: 'launcher', id: 'rk7', name: 'RK-7', ammo: 'rocket', rpm: 20, mag: 1, slot: 'launcher', modes: ['single'], reload: 4.5, reloadEmpty: 4.5, recoil: [2, 0.5], weight: 7, moa: 6, ads: 0.4, sway: 1.6, rails: false, faction: 'nlf', desc: 'Reloadable rocket launcher. HEAT rounds.', model: { body: 'rpg' } }),
  R({ cat: 'launcher', id: 'lance84', name: 'Lance 84', ammo: 'rocket84', rpm: 20, mag: 1, slot: 'launcher', modes: ['single'], reload: 5, reloadEmpty: 5, recoil: [2.5, 0.5], weight: 6.7, moa: 4, ads: 0.4, sway: 1.5, rails: false, disposable: true, desc: 'One-shot anti-tank tube.', model: { body: 'tube' } }),
  R({ cat: 'launcher', id: 'valkyrie', name: 'Valkyrie ATGM', ammo: 'atgm', rpm: 10, mag: 1, slot: 'launcher', modes: ['single'], reload: 6, reloadEmpty: 6, recoil: [1.5, 0.3], weight: 15, moa: 1, ads: 0.6, sway: 2, rails: false, lock: 'ground', optic: 'atgm', desc: 'Locks on to vehicles, then flies by itself.', model: { body: 'atgm' } }),
  R({ cat: 'launcher', id: 'skyguard', name: 'Skyguard', ammo: 'aam', rpm: 10, mag: 1, slot: 'launcher', modes: ['single'], reload: 6, reloadEmpty: 6, recoil: [1.2, 0.3], weight: 14, moa: 1, ads: 0.5, sway: 1.8, rails: false, lock: 'air', desc: 'Shoulder-fired anti-aircraft missile.', model: { body: 'manpad' } }),
  R({ cat: 'launcher', id: 'thumper', name: 'Thumper 40', ammo: '40mm', rpm: 30, mag: 1, slot: 'launcher', modes: ['single'], reload: 2.2, reloadEmpty: 2.2, recoil: [2.2, 0.5], weight: 2.7, moa: 3, ads: 0.25, rails: false, desc: 'Break-action grenade launcher.', model: { body: 'gl' } }),
  R({ cat: 'launcher', id: 'revolvergl', name: 'Revolver GL', ammo: '40mm', rpm: 120, mag: 6, slot: 'launcher', modes: ['semi'], reload: 6, reloadEmpty: 6, recoil: [2.2, 0.6], weight: 5.3, moa: 3, ads: 0.3, rails: false, desc: 'Six-shot grenade launcher.', model: { body: 'gl6' } }),
]
// Mounted weapons: vehicles and emplacements.
export const MOUNTED = [
  { id: 'm2hb', name: 'Ripsaw .50', ammo: '50', rpm: 500, mag: 100, modes: ['auto'], recoil: [0.4, 0.2], moa: 3, tracerEvery: 3, mounted: true },
  { id: 'gpmg', name: 'Coaxial MG', ammo: '762n', rpm: 700, mag: 200, modes: ['auto'], recoil: [0.2, 0.1], moa: 2.5, tracerEvery: 4, mounted: true },
  { id: 'ac30', name: '30 mm Autocannon', ammo: '30mm', rpm: 200, mag: 120, modes: ['auto', 'semi'], recoil: [0.5, 0.2], moa: 1.5, tracerEvery: 1, mounted: true },
  { id: 'cannon120', name: '120 mm Cannon', ammo: '120mm', rpm: 8, mag: 1, reload: 6, modes: ['single'], recoil: [3, 0.5], moa: 0.3, tracerEvery: 1, mounted: true },
  { id: 'minigun', name: 'Door Minigun', ammo: '762n', rpm: 3000, mag: 2000, modes: ['auto'], recoil: [0.15, 0.15], moa: 4, tracerEvery: 3, mounted: true },
  { id: 'gmg40', name: '40 mm Grenade MG', ammo: '40mm', rpm: 350, mag: 48, modes: ['auto'], recoil: [0.6, 0.3], moa: 3, mounted: true, velocity: 240 },
  { id: 'pods70', name: 'Rocket Pods', ammo: '70mm', rpm: 300, mag: 38, modes: ['auto'], recoil: [0.1, 0.05], moa: 2, mounted: true },
  { id: 'cannon20', name: '20 mm Cannon', ammo: '20mm', rpm: 1500, mag: 500, modes: ['auto'], recoil: [0.15, 0.1], moa: 2, tracerEvery: 2, mounted: true },
  { id: 'aamrack', name: 'AA Missiles', ammo: 'aam', rpm: 30, mag: 4, modes: ['single'], lock: 'air', recoil: [0, 0], moa: 0, mounted: true },
  { id: 'atgmrack', name: 'AT Missiles', ammo: 'atgm', rpm: 20, mag: 4, modes: ['single'], lock: 'ground', recoil: [0, 0], moa: 0, mounted: true },
  { id: 'bombs', name: 'Bombs', ammo: 'bomb', rpm: 60, mag: 4, modes: ['single'], recoil: [0, 0], moa: 0, mounted: true, drop: true },
]
export const weapon = id => WEAPONS.find(w => w.id === id) || MOUNTED.find(w => w.id === id)
export const CATEGORIES = {
  rifle: 'Assault rifles', battle: 'Battle rifles', smg: 'SMGs', lmg: 'Light machine guns', mmg: 'Medium machine guns',
  sniper: 'Sniper rifles', dmr: 'Marksman rifles', shotgun: 'Shotguns', pistol: 'Pistols', launcher: 'Launchers',
}

// Attachments. type: optic, muzzle, under, mag, stock. fits: weapon categories (or 'rails').
export const ATTACHMENTS = {
  iron: { name: 'Iron sights', type: 'optic', zoom: 1.15, reticle: 'iron' },
  rd1: { name: 'RD-1 red dot', type: 'optic', zoom: 1.2, reticle: 'dot', color: '#ff3b2f', weight: 0.15 },
  eh3: { name: 'EH-3 holographic', type: 'optic', zoom: 1.25, reticle: 'holo', color: '#ff4a3a', weight: 0.3 },
  aco2: { name: 'ACO-2 2x', type: 'optic', zoom: 2, reticle: 'chevron', scope: false, weight: 0.4, fits: ['rifle', 'battle', 'dmr', 'lmg', 'mmg', 'smg'] },
  ta4: { name: 'TA-4 4x', type: 'optic', zoom: 4, reticle: 'bdc', scope: true, weight: 0.5, fits: ['rifle', 'battle', 'dmr', 'lmg', 'mmg', 'sniper'] },
  lpvo: { name: 'LPV 1-6x', type: 'optic', zoom: 1, zooms: [1, 2, 4, 6], reticle: 'bdc', scope: true, weight: 0.65, fits: ['rifle', 'battle', 'dmr', 'lmg', 'sniper'] },
  pso4: { name: 'PS-4 4x', type: 'optic', zoom: 4, reticle: 'chevron', scope: true, weight: 0.6, fits: ['dmr', 'rifle', 'battle', 'sniper'] },
  hunter8: { name: 'Hunter 8x', type: 'optic', zoom: 8, reticle: 'mil', scope: true, weight: 0.7, fits: ['sniper', 'dmr', 'battle'] },
  lr525: { name: 'LR 5-25x', type: 'optic', zoom: 5, zooms: [5, 8, 12, 18, 25], reticle: 'mil', scope: true, weight: 1.0, fits: ['sniper', 'dmr'] },
  nv4: { name: 'NV-4 night scope', type: 'optic', zoom: 4, reticle: 'bdc', scope: true, night: true, weight: 0.9, fits: ['rifle', 'battle', 'dmr', 'sniper'] },
  th2: { name: 'TH-2 thermal', type: 'optic', zoom: 3, zooms: [3, 6], reticle: 'dot', scope: true, thermal: true, weight: 0.9, fits: ['rifle', 'battle', 'dmr', 'sniper', 'lmg', 'mmg'] },
  atgm: { name: 'Missile sight', type: 'optic', zoom: 3, reticle: 'lock', scope: true },
  supp: { name: 'Suppressor', type: 'muzzle', suppress: true, vmul: 1.02, recoil: 0.9, length: 0.17, weight: 0.5, fits: ['rifle', 'battle', 'smg', 'dmr', 'sniper', 'pistol', 'lmg'] },
  comp: { name: 'Compensator', type: 'muzzle', recoilH: 0.75, length: 0.06, weight: 0.15 },
  brake: { name: 'Muzzle brake', type: 'muzzle', recoil: 0.8, length: 0.07, weight: 0.2 },
  flash: { name: 'Flash hider', type: 'muzzle', flash: 0.4, length: 0.05, weight: 0.1 },
  vgrip: { name: 'Vertical grip', type: 'under', recoil: 0.88, sway: 0.95, weight: 0.15 },
  agrip: { name: 'Angled grip', type: 'under', ads: 0.85, recoil: 0.95, weight: 0.1 },
  bipod: { name: 'Bipod', type: 'under', bipod: true, weight: 0.4 },
  laser: { name: 'Light / laser', type: 'under', light: true, hip: 0.75, weight: 0.2 },
  extmag: { name: 'Extended magazine', type: 'mag', magMul: 1.5, reload: 1.1, weight: 0.25, fits: ['rifle', 'smg', 'battle', 'dmr', 'pistol'] },
  heavystock: { name: 'Heavy stock', type: 'stock', recoil: 0.85, ads: 1.15, sway: 0.85, weight: 0.4 },
  lightstock: { name: 'Light stock', type: 'stock', recoil: 1.12, ads: 0.85, weight: -0.2 },
}
// What a weapon may carry, by slot.
export function attachmentsFor(def) {
  const out = { optic: [], muzzle: [], under: [], mag: [], stock: [] }
  for (const [id, a] of Object.entries(ATTACHMENTS)) {
    if (id === 'atgm') continue
    if (a.fits && !a.fits.includes(def.cat)) continue
    if (def.cat === 'launcher' || def.cat === 'shotgun' && a.type === 'mag') continue
    if (!def.rails && (a.type === 'under' || (a.type === 'optic' && id !== 'iron'))) continue
    if (def.cat === 'pistol' && !['iron', 'rd1', 'supp', 'comp', 'extmag', 'laser'].includes(id)) continue
    if (def.suppressed && a.type === 'muzzle') continue
    out[a.type].push(id)
  }
  return out
}
// The handling of a weapon with its attachments (what the game uses when it fires).
export function stats(def, att = {}) {
  const s = { recoilV: def.recoil[0], recoilH: def.recoil[1], sway: def.sway || 1, ads: def.ads || 0.25, mag: def.mag, vmul: def.vmul || 1,
    suppressed: !!def.suppressed, weight: def.weight || 3, reload: def.reload, reloadEmpty: def.reloadEmpty || def.reload, flash: 1, hip: 1, bipod: !!def.bipod, light: false }
  for (const id of Object.values(att)) {
    const a = ATTACHMENTS[id]; if (!a) continue
    if (a.recoil) { s.recoilV *= a.recoil; s.recoilH *= a.recoil }
    if (a.recoilH) s.recoilH *= a.recoilH
    if (a.sway) s.sway *= a.sway
    if (a.ads) s.ads *= a.ads
    if (a.vmul) s.vmul *= a.vmul
    if (a.suppress) s.suppressed = true
    if (a.flash) s.flash *= a.flash
    if (a.magMul && !def.belt && !def.tube) s.mag = Math.round(def.mag * a.magMul)
    if (a.reload) { s.reload *= a.reload; s.reloadEmpty *= a.reload }
    if (a.hip) s.hip *= a.hip
    if (a.bipod) s.bipod = true
    if (a.light) s.light = true
    s.weight += a.weight || 0
  }
  return s
}

// Grenades and throwables.
export const THROWABLES = {
  frag: { name: 'Frag grenade', fuse: 3.5, explosive: { radius: 9, dmg: 150 }, weight: 0.4 },
  smoke: { name: 'Smoke grenade', fuse: 1.5, smoke: 28, weight: 0.4 },
  flash: { name: 'Flashbang', fuse: 1.8, flashbang: 14, weight: 0.3 },
}
