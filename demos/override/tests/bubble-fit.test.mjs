import test from 'node:test';
import assert from 'node:assert/strict';
import { BUBBLE, bubbleFit, bubbleX } from '../client/bubble-fit.ts';

const height = lines => BUBBLE.chrome + lines * BUBBLE.lineHeight;

test('plenty_of_room: the bubble keeps its anchor and is capped at maxLines', () => {
  assert.deepEqual(bubbleFit(-400, 357), { bottom: 357, lines: BUBBLE.maxLines });
});

test('whole_lines_only: the lines that fit between top and anchor, never a partial line', () => {
  const top = 10;
  const anchor = top + height(2) + BUBBLE.lineHeight / 2;
  const fit = bubbleFit(top, anchor);
  assert.equal(fit.lines, 2);
  assert.equal(fit.bottom, anchor);
  assert.ok(fit.bottom - height(fit.lines) >= top);
});

test('back_row_under_the_hud: no room above the tag, so one line moves down and still clears the HUD', () => {
  // Ken at 1728x864: the HUD edge sits about 55 room px down, his tag anchor at 89.
  const fit = bubbleFit(55, 89);
  assert.equal(fit.lines, 1);
  assert.ok(fit.bottom >= 89);
  assert.ok(Math.abs(fit.bottom - height(1) - 55) < 1e-9, 'its top sits on the HUD edge, not under it');
});

test('the old clip is gone: never a box shorter than one line plus padding', () => {
  for (const [top, anchor] of [[55, 89], [80, 73], [4, 101], [-40, 89]]) {
    const fit = bubbleFit(top, anchor);
    assert.ok(fit.bottom - top >= height(fit.lines) - 1e-9, `${top},${anchor}`);
  }
});

test('bubble_x: centred on the speaker, inside the room', () => {
  assert.equal(bubbleX(540, 220, 1280), 540);
  assert.equal(bubbleX(40, 220, 1280), 110);
  assert.equal(bubbleX(1250, 320, 1280), 1120);
});
