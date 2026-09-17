import React from 'react';

//
// Practice counts drawn the way they are kept on the back of an envelope:
// four upright strokes and a fifth laid across them. A number alone is read;
// a gate is glanced at, which is all a card needs.
//
const GROUP_WIDTH = 20;   // four strokes plus the gap before the next group
const STROKE_GAP = 4;
const BAR_HEIGHT = 14;

/**
 * @param count   how many times the song has been opened
 * @param max     groups of five drawn before the rest is given as a number
 */
export default function TallyMarks({ count = 0, max = 4, size = 14, color = 'currentColor' }) {
  if (!count) return null;

  const groups = Math.floor(count / 5);
  const drawnGroups = Math.min(groups, max);
  const remainder = drawnGroups === groups ? count % 5 : 0;
  const undrawn = count - drawnGroups * 5 - remainder;

  const scale = size / BAR_HEIGHT;
  const width = drawnGroups * GROUP_WIDTH + (remainder ? remainder * STROKE_GAP + 2 : 0);

  const strokes = [];
  let x = 0;

  for (let group = 0; group < drawnGroups; group += 1) {
    for (let stroke = 0; stroke < 4; stroke += 1) {
      strokes.push(<line key={`${group}-${stroke}`} x1={x + stroke * STROKE_GAP} y1="1" x2={x + stroke * STROKE_GAP} y2={BAR_HEIGHT - 1} />);
    }
    // The fifth mark, laid across the other four
    strokes.push(
      <line key={`${group}-cross`} x1={x - 2} y1={BAR_HEIGHT - 1} x2={x + 3 * STROKE_GAP + 2} y2="1" />
    );
    x += GROUP_WIDTH;
  }

  for (let stroke = 0; stroke < remainder; stroke += 1) {
    strokes.push(<line key={`rest-${stroke}`} x1={x + stroke * STROKE_GAP} y1="1" x2={x + stroke * STROKE_GAP} y2={BAR_HEIGHT - 1} />);
  }

  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color }}
      title={`Practised ${count} ${count === 1 ? 'time' : 'times'}`}
    >
      <svg
        width={Math.max(width, 1) * scale}
        height={size}
        viewBox={`-3 0 ${Math.max(width, 1) + 3} ${BAR_HEIGHT}`}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        aria-hidden="true"
      >
        {strokes}
      </svg>
      {undrawn > 0 && (
        // Past a few gates the marks stop being countable, so the number takes over
        <span style={{ fontSize: size - 3, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {count}
        </span>
      )}
    </span>
  );
}
