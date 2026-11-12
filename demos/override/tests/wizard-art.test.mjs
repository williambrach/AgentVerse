import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const dir = new URL('../public/assets/renaissance/characters/', import.meta.url);
const frames = ['listening', 'speaking', 'thinking', 'idle-0', 'idle-1', 'idle-2', 'idle-3', 'talk-0'];

test('every_wizard_frame_present', () => {
  for (const f of frames) assert.ok(existsSync(new URL(`wizard-${f}.png`, dir)), f);
});

test('same_frame_box', () => {
  for (const f of frames) {
    const b = readFileSync(new URL(`wizard-${f}.png`, dir));
    assert.equal(b.readUInt32BE(16), 132, f);
    assert.equal(b.readUInt32BE(20), 188, f);
    assert.equal(b[25], 6, `${f} is RGBA`); // colour type 6
  }
});

test('differs_from_inventor', () => {
  for (const f of frames) {
    const w = readFileSync(new URL(`wizard-${f}.png`, dir));
    const i = readFileSync(new URL(`inventor-${f}.png`, dir));
    assert.ok(!w.equals(i), f);
  }
});

test('check_mode', () => {
  const r = spawnSync('python3', ['-I', new URL('../art/renaissance/wizard_repaint.py', import.meta.url).pathname, '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
