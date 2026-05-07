// Shared sample baby-day data + helpers for the wireframe explorations.
// Times are minutes-since-midnight to keep math simple.

const M = (h, m=0) => h*60 + m;
const fmt = (mins) => {
  const h24 = Math.floor(mins/60);
  const m = mins % 60;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = ((h24 + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
};
const fmtShort = (mins) => {
  const h24 = Math.floor(mins/60);
  const m = mins % 60;
  const ampm = h24 >= 12 ? 'p' : 'a';
  const h12 = ((h24 + 11) % 12) + 1;
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2,'0')}${ampm}`;
};

// Owners — color-coded
const OWNERS = {
  mom:   { name: 'Mom',   color: '#c4626b' },
  dad:   { name: 'Dad',   color: '#5b7fa8' },
  nana:  { name: 'Nana',  color: '#9d7eb8' },
};

// Event-type colors (used for fill/border on blocks, and on instant chips)
const TYPES = {
  wake:    { name: 'Wake',    fill: '#fbeec8', stroke: '#b89a4a' },
  nap:     { name: 'Nap',     fill: '#cfd9c5', stroke: '#6f8560' },
  putdown: { name: 'Putdown', fill: '#e8dcc0', stroke: '#a08658', hatch: true },
  bottle:  { name: 'Bottle', dot: '#7c9bbd' },
  pump:    { name: 'Pump',   dot: '#a37ab8' },
  bedtime: { name: 'Bed',    dot: '#3a3a55' },
  cook:    { name: 'Cook',   dot: '#d18a4a' },
  custom:  { name: 'Custom', dot: '#7a9479' },
};

// A reasonably busy "default" day for a 7-month-old.
// Busy day adds extras (friend visit, dream feed, more pumps).
const BUSY_DAY = [
  // BLOCKS
  { kind: 'block', type: 'wake',    start: M(6,30), end: M(8,25),  label: 'Wake Window 1', owner: 'dad' },
  { kind: 'block', type: 'putdown', start: M(8,10), end: M(8,25),  label: 'Putdown · Nap 1', owner: 'dad' },
  { kind: 'block', type: 'nap',     start: M(8,25), end: M(9,10),  label: 'Nap 1' },
  { kind: 'block', type: 'wake',    start: M(9,10), end: M(10,45), label: 'Wake Window 2', owner: 'mom' },
  { kind: 'block', type: 'putdown', start: M(10,30),end: M(10,45), label: 'Putdown · Nap 2', owner: 'mom' },
  { kind: 'block', type: 'nap',     start: M(10,45),end: M(11,30), label: 'Nap 2' },
  { kind: 'block', type: 'wake',    start: M(11,30),end: M(13,20), label: 'Wake Window 3', owner: 'mom' },
  { kind: 'block', type: 'putdown', start: M(13,5), end: M(13,20), label: 'Putdown · Nap 3', owner: 'mom' },
  { kind: 'block', type: 'nap',     start: M(13,20),end: M(14,50), label: 'Nap 3' },
  { kind: 'block', type: 'wake',    start: M(14,50),end: M(17,30), label: 'Wake Window 4', owner: 'dad' },
  { kind: 'block', type: 'custom',  start: M(15,30),end: M(16,30), label: 'Friend visit', owner: 'dad' },
  { kind: 'block', type: 'putdown', start: M(17,15),end: M(17,30), label: 'Putdown · Nap 4', owner: 'dad' },
  { kind: 'block', type: 'nap',     start: M(17,30),end: M(18,0),  label: 'Cat nap' },
  { kind: 'block', type: 'wake',    start: M(18,0), end: M(19,30), label: 'Wake Window 5', owner: 'mom' },

  // INSTANTS
  { kind: 'instant', type: 'bottle', at: M(7,0),   label: 'Bottle 6oz', owner: 'dad' },
  { kind: 'instant', type: 'pump',   at: M(7,0),   label: 'Pump',       owner: 'mom' },
  { kind: 'instant', type: 'bottle', at: M(10,0),  label: 'Bottle 5oz', owner: 'mom' },
  { kind: 'instant', type: 'pump',   at: M(10,0),  label: 'Pump',       owner: 'mom' },
  { kind: 'instant', type: 'pump',   at: M(13,0),  label: 'Pump',       owner: 'mom' },
  { kind: 'instant', type: 'bottle', at: M(13,5),  label: 'Bottle 5oz', owner: 'dad' },
  { kind: 'instant', type: 'pump',   at: M(16,0),  label: 'Pump',       owner: 'mom' },
  { kind: 'instant', type: 'cook',   at: M(17,0),  label: 'Cook dinner',owner: 'dad' },
  { kind: 'instant', type: 'bottle', at: M(18,30), label: 'Bottle 6oz', owner: 'mom' },
  { kind: 'instant', type: 'bedtime',at: M(19,30), label: 'Bedtime',    owner: 'mom' },
  { kind: 'instant', type: 'pump',   at: M(22,0),  label: 'Dream-feed pump', owner: 'mom' },
];

const SIMPLE_DAY = [
  { kind: 'block', type: 'wake',    start: M(7,0),  end: M(9,0),   label: 'Wake Window 1', owner: 'mom' },
  { kind: 'block', type: 'putdown', start: M(8,45), end: M(9,0),   label: 'Putdown', owner: 'mom' },
  { kind: 'block', type: 'nap',     start: M(9,0),  end: M(10,30), label: 'Nap 1' },
  { kind: 'block', type: 'wake',    start: M(10,30),end: M(13,0),  label: 'Wake Window 2', owner: 'mom' },
  { kind: 'block', type: 'putdown', start: M(12,45),end: M(13,0),  label: 'Putdown', owner: 'mom' },
  { kind: 'block', type: 'nap',     start: M(13,0), end: M(14,30), label: 'Nap 2' },
  { kind: 'block', type: 'wake',    start: M(14,30),end: M(17,0),  label: 'Wake Window 3', owner: 'dad' },

  { kind: 'instant', type: 'bottle', at: M(7,15),  label: 'Bottle 6oz', owner: 'mom' },
  { kind: 'instant', type: 'bottle', at: M(11,0),  label: 'Bottle 5oz', owner: 'mom' },
  { kind: 'instant', type: 'pump',   at: M(11,0),  label: 'Pump',       owner: 'mom' },
  { kind: 'instant', type: 'cook',   at: M(16,30), label: 'Cook',       owner: 'dad' },
  { kind: 'instant', type: 'bottle', at: M(15,30), label: 'Bottle 5oz', owner: 'dad' },
  { kind: 'instant', type: 'bedtime',at: M(18,30), label: 'Bedtime',    owner: 'dad' },
];

const NOW_MIN = M(11, 18); // simulated "now" — middle of Nap 2

// Group instants by exact same time so layouts can fan them out horizontally.
function groupInstants(events) {
  const map = new Map();
  for (const e of events.filter(e => e.kind === 'instant')) {
    const key = e.at;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(e);
  }
  return [...map.entries()].map(([at, items]) => ({ at, items }));
}

Object.assign(window, { M, fmt, fmtShort, OWNERS, TYPES, BUSY_DAY, SIMPLE_DAY, NOW_MIN, groupInstants });
