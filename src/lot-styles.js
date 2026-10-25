/** Curated local models only; community submissions cannot supply executable assets. */
export const LOT_STYLES = Object.freeze([
  { id: 'studio', label: 'Studio', description: 'A welcoming place for tools and new ideas.' },
  { id: 'arcade', label: 'Arcade', description: 'A lively storefront for playable projects.' },
  { id: 'gallery', label: 'Gallery', description: 'A bright home for art and images.' },
  { id: 'workshop', label: 'Workshop', description: 'A neighborhood workshop for mods and makers.' },
  { id: 'tower', label: 'Tower', description: 'A tall city landmark for your project.' },
  { id: 'garden', label: 'Garden', description: 'A quiet green retreat in the city.' },
].map(style => Object.freeze({ ...style, model: `./assets/city-upgrade/styles/${style.id}.glb` })));
const STYLE_IDS = new Set(LOT_STYLES.map(style => style.id));
const DEFAULTS = Object.freeze({ games: 'arcade', tools: 'studio', art: 'gallery', android: 'tower', mods: 'workshop' });
export const isLotStyle = value => STYLE_IDS.has(value);
export const defaultLotStyle = district => DEFAULTS[district] || 'studio';
