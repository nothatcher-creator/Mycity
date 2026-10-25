import { buildCityLots } from './city-layout.js';

/** URL-derived suggestions are editable hints, not scraped project metadata. */
export function inferProjectDetails(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
    if (url.protocol !== 'https:') throw new Error('HTTPS required');
  } catch { return { district: 'tools', title: '' }; }
  const host = url.hostname.toLowerCase();
  const path = url.pathname;
  let district = 'tools';
  if (host === 'nexusmods.com' || host.endsWith('.nexusmods.com')) district = 'mods';
  else if (host === 'project0.city') district = 'games';
  else if (/\.apk$/i.test(path)) district = 'android';
  else if (/\.(?:png|jpe?g|webp|gif|avif|svg)$/i.test(path)) district = 'art';
  else if (host === 'itch.io' || host.endsWith('.itch.io')) district = 'games';
  const segments = path.split('/').filter(Boolean);
  let name = segments.at(-1) || host.replace(/^www\./, '').split('.')[0];
  if (host === 'project0.city' && /^#\d+$/.test(url.hash)) name = `Project 0 Lot ${url.hash.slice(1)}`;
  if (/^index\.(?:html?|php)$/i.test(name)) name = segments.at(-2) || host.split('.')[0];
  try { name = decodeURIComponent(name); } catch { /* Keep malformed escapes editable. */ }
  const title = name.replace(/\.(?:html?|apk|png|jpe?g|webp|gif|avif|svg)$/i, '')
    .replace(/[-_]+/g, ' ').replace(/[\u0000-\u001f\u007f]/g, '').trim()
    .replace(/\b[a-z]/g, letter => letter.toUpperCase()).slice(0, 80);
  return { district, title };
}

export function chooseOpenLot(projects, city, { district = 'tools', slotId } = {}) {
  return buildCityLots(projects, city).find(lot => !lot.project && lot.district === district && (!slotId || lot.slotId === slotId)) || null;
}

function comparableUrl(rawUrl, base) {
  try {
    const url = new URL(rawUrl, base);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    // Project 0 lot numbers and hash-router paths identify different projects.
    const routedHash = /^#(?:!|\/|(?:plot|lot)\/)/.test(url.hash)
      || (url.hostname === 'project0.city' && /^#\d+$/.test(url.hash));
    if (!routedHash) url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || key === 'fbclid' || key === 'gclid') url.searchParams.delete(key);
    }
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.href;
  } catch { return null; }
}

export function findDuplicateProject(projects, rawUrl, base = 'https://nothatcher-creator.github.io/Mycity/') {
  const candidate = comparableUrl(rawUrl, base);
  if (!candidate) return null;
  return projects.find(project => comparableUrl(project.url, base) === candidate) || null;
}
