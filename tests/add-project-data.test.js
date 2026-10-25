import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inferProjectDetails, findDuplicateProject, chooseOpenLot } from '../src/add-project-data.js';
import { LOT_STYLES, defaultLotStyle, isLotStyle } from '../src/lot-styles.js';
const city = JSON.parse(readFileSync(new URL('../public/city.json', import.meta.url)));
const projects = JSON.parse(readFileSync(new URL('../public/projects.json', import.meta.url)));

test('paste suggestions classify known project links and produce editable names', () => {
  assert.deepEqual(inferProjectDetails('https://friend.itch.io/moon-garden'), { district: 'games', title: 'Moon Garden' });
  assert.equal(inferProjectDetails('https://www.nexusmods.com/example/mods/42').district, 'mods');
  assert.equal(inferProjectDetails('https://example.com/releases/space-tools.apk').district, 'android');
  assert.deepEqual(inferProjectDetails('https://example.com/art/sunset.jpg'), { district: 'art', title: 'Sunset' });
  assert.equal(inferProjectDetails('https://friend.github.io/pixel-lab/').title, 'Pixel Lab');
  assert.equal(inferProjectDetails('https://notitch.io/hello').district, 'tools');
  assert.deepEqual(inferProjectDetails('https://project0.city/#9999'), { district: 'games', title: 'Project 0 Lot 9999' });
  assert.deepEqual(inferProjectDetails('not a URL'), { district: 'tools', title: '' });
});
test('automatic placement selects first vacant slot in requested neighborhood', () => {
  const lot = chooseOpenLot(projects, city, { district: 'games' });
  assert.equal(lot.slotId, 'games-17');
  assert.equal(lot.project, null);
  assert.equal(chooseOpenLot(projects, city, { district: 'art', slotId: 'art-05' }).slotId, 'art-05');
  assert.equal(chooseOpenLot(projects, city, { district: 'games', slotId: 'games-01' }), null);
  assert.equal(chooseOpenLot(projects, city, { district: 'art', slotId: 'games-17' }), null);
  assert.equal(chooseOpenLot(projects, city, { district: 'missing' }), null);
});
test('duplicate matching ignores fragments, trailing slash and tracking parameters while retaining meaningful query data', () => {
  const items = [{ id: 'one', url: 'https://friend.example/my-app/' }, { id: 'two', url: './gallery/' }, { id: 'three', url: 'https://example.com/view?project=2' }];
  assert.equal(findDuplicateProject(items, 'https://FRIEND.example/my-app?utm_source=city#play').id, 'one');
  assert.equal(findDuplicateProject(items, 'https://nothatcher-creator.github.io/Mycity/gallery/').id, 'two');
  assert.equal(findDuplicateProject(items, 'https://example.com/view?project=3'), null);
  assert.equal(findDuplicateProject(items, 'javascript:alert(1)'), null);
});
test('building styles are a fixed local model whitelist', () => {
  assert.equal(LOT_STYLES.length, 6);
  for (const style of LOT_STYLES) {
    assert.equal(style.model, `./assets/city-upgrade/styles/${style.id}.glb`);
    assert.equal(isLotStyle(style.id), true);
  }
  assert.equal(defaultLotStyle('games'), 'arcade');
  assert.equal(defaultLotStyle('android'), 'tower');
  assert.equal(isLotStyle('https://example.com/model.glb'), false);
});

test('duplicate detection preserves original lot numbers and hash-router destinations', () => {
  assert.equal(findDuplicateProject(projects, 'https://project0.city/#3672').id, 'relicfall');
  assert.equal(findDuplicateProject(projects, 'https://project0.city/#9999'), null);
  const routed = [{ id: 'one', url: 'https://example.com/#/projects/one' }];
  assert.equal(findDuplicateProject(routed, 'https://example.com/#/projects/two'), null);
});
