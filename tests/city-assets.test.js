import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { LOT_STYLES } from '../src/lot-styles.js';

const publicRoot = new URL('../public/', import.meta.url);
test('downloaded scenery ships every curated model with intact source and license records', async () => {
  const manifest = JSON.parse(await readFile(new URL('assets/city-upgrade/manifest.json', publicRoot)));
  const included = new Set();
  for (const asset of manifest.assets) {
    const data = await readFile(new URL(asset.path, publicRoot));
    assert.equal(data.length, asset.bytes, asset.path);
    assert.equal(createHash('sha256').update(data).digest('hex'), asset.sha256, asset.path);
    assert.equal(asset.license, 'CC0-1.0');
    assert.ok(asset.source.startsWith('https://'));
    if (asset.licenseFile) assert.ok((await readFile(new URL(asset.licenseFile, publicRoot))).length > 100);
    if (asset.path.endsWith('.glb')) assert.equal(data.toString('ascii', 0, 4), 'glTF');
    included.add(asset.path);
  }
  for (const style of LOT_STYLES) assert.ok(included.has(style.model), `Missing ${style.id}`);
});
