//
// A tally of what actually gets used.
//
// The point is to find out which controls earn their place on the bar and
// which ones are only there out of habit, so the answer has to survive a
// refresh and be readable without a build step. Counts live in the browser,
// where they cost nothing and cannot fail; the individual events go to
// Supabase as well when a table is there to take them, which is what makes
// them worth reading across a phone and a laptop.
//
// Nothing here is allowed to break a click. Every path swallows its errors:
// a tally is not worth a broken button.
//
import { supabase } from './supabase';

const KEY = 'repetoire.usage.v1';
const FLUSH_AFTER = 10000; // ms of quiet before a batch is sent
const MAX_PENDING = 50;    // events held before a send is forced

let pending = [];
let timer = null;
// One missing table is enough to know: stop asking for the rest of the session
let sink = 'unknown'; // unknown | on | off

const readTally = () => {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeTally = (tally) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(tally));
  } catch {
    // A full disk or a private window: carry on without the tally
  }
};

// PostgREST answers a missing table with PGRST205 rather than the Postgres
// code, and says so in the message; both spellings mean the same thing here
const isMissingTable = (error) =>
  error?.code === '42P01' ||
  error?.code === 'PGRST205' ||
  /relation .* does not exist|could not find the table/i.test(error?.message || '');

async function flush() {
  clearTimeout(timer);
  timer = null;
  if (!pending.length || sink === 'off') return;

  const batch = pending;
  pending = [];
  try {
    const { error } = await supabase.from('usage_events').insert(batch);
    if (error) {
      if (isMissingTable(error)) {
        // The table has not been made yet. The local tally still works, so
        // this is a quiet no-op rather than a failure.
        sink = 'off';
        return;
      }
      throw error;
    }
    sink = 'on';
  } catch {
    // Offline, blocked, or refused: the counts are already saved locally
    sink = sink === 'on' ? 'on' : 'off';
  }
}

/**
 * Record one use of a control.
 *
 * `action` is a stable dotted name — "loop.beat", "text.transpose" — so the
 * tally stays comparable as the labels on the buttons change. `detail` is for
 * the value that makes the count make sense: which direction, which preset.
 */
export function track(action, detail = null) {
  if (!action) return;
  try {
    const tally = readTally();
    const seen = tally[action] || { count: 0 };
    tally[action] = { count: seen.count + 1, last: Date.now() };
    writeTally(tally);

    pending.push({ action, detail: detail === null ? null : String(detail) });
    if (pending.length >= MAX_PENDING) {
      flush();
    } else if (!timer) {
      timer = setTimeout(flush, FLUSH_AFTER);
    }
  } catch {
    // Never let a count get in the way of the thing it is counting
  }
}

/** The tally, most used first — what the whole exercise is for. */
export function usageReport() {
  const tally = readTally();
  return Object.entries(tally)
    .map(([action, { count, last }]) => ({
      action,
      count,
      last: last ? new Date(last).toISOString() : null
    }))
    .sort((a, b) => b.count - a.count);
}

export function clearUsage() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear
  }
  pending = [];
}

if (typeof window !== 'undefined') {
  // A batch in hand when the tab goes away would otherwise be lost
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  // Readable from the console without a build step, which is the whole point
  window.repetoireUsage = usageReport;
  window.repetoireUsageClear = clearUsage;
}
