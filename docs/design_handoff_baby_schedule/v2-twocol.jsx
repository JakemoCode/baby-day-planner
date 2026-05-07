// VARIATION 2: TWO-COLUMN SPLIT
// Axis | Blocks column | Instants column. Blocks live entirely in the left
// content column. Instants live in their own narrow column with explicit
// time labels — concurrent instants fan horizontally inside that column.
// Putdown overlap is rendered as a striped sub-bar on the right edge of
// the wake-window block, never overlapping its label.

function V2_TwoColumn({ events, density, dimPast, colorMode }) {
  const startMin = window.M(6, 0);
  const endMin = window.M(20, 0);
  const PX_PER_MIN = density / 60;
  const totalH = (endMin - startMin) * PX_PER_MIN;
  const AXIS_W = 50;
  const INSTANT_W = 116;

  const yOf = (m) => (m - startMin) * PX_PER_MIN;
  const blocks = events.filter(e => e.kind === 'block');
  const groups = window.groupInstants(events);
  const isPast = (m) => dimPast && m < window.NOW_MIN;

  // Separate putdown from other blocks; we render it as a stripe inside the wake block area
  const putdowns = blocks.filter(b => b.type === 'putdown');
  const mainBlocks = blocks.filter(b => b.type !== 'putdown');

  return (
    <div style={{ position: 'relative', height: totalH + 40, padding: '12px 4px 24px' }}>
      {/* Hour grid lines + labels */}
      {Array.from({ length: (endMin - startMin) / 60 + 1 }).map((_, i) => {
        const m = startMin + i * 60;
        return (
          <React.Fragment key={i}>
            <div style={{
              position: 'absolute', left: AXIS_W, right: 4, top: yOf(m),
              borderTop: '1px dashed #c8bea8',
            }} />
            <div style={{
              position: 'absolute', left: 0, top: yOf(m) - 7, width: AXIS_W,
              fontFamily: "'Caveat', cursive", fontSize: 14, color: '#5a5040',
              textAlign: 'right', paddingRight: 4,
            }}>
              {window.fmtShort(m).toUpperCase()}
            </div>
          </React.Fragment>
        );
      })}

      {/* Column divider */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0, right: INSTANT_W + 4,
        borderRight: '1px solid #d8cdb0',
      }} />

      {/* MAIN BLOCKS */}
      {mainBlocks.map((b, i) => {
        const t = window.TYPES[b.type];
        const ow = b.owner ? window.OWNERS[b.owner] : null;
        const useOwnerColor = colorMode === 'owner' && ow;
        const top = yOf(b.start);
        const h = yOf(b.end) - yOf(b.start);

        return (
          <div key={i} style={{
            position: 'absolute',
            left: AXIS_W + 4,
            right: INSTANT_W + 8,
            top,
            height: h,
            background: useOwnerColor ? ow.color + '22' : t.fill,
            border: `1.5px solid ${useOwnerColor ? ow.color : t.stroke}`,
            borderLeft: ow ? `5px solid ${ow.color}` : `1.5px solid ${t.stroke}`,
            borderRadius: 4,
            padding: '3px 8px 3px 6px',
            opacity: isPast(b.end) ? 0.45 : 1,
            fontSize: 11,
            color: '#2a2620',
            overflow: 'hidden',
          }}>
            <div style={{ fontFamily: "'Caveat', cursive", fontSize: 15, fontWeight: 700, lineHeight: 1 }}>
              {b.label}
            </div>
            <div style={{ fontSize: 9, color: '#5a5040', marginTop: 1 }}>
              {window.fmtShort(b.start)}–{window.fmtShort(b.end)}
              {ow && <span style={{ marginLeft: 4, color: ow.color, fontWeight: 700 }}>· {ow.name}</span>}
            </div>
          </div>
        );
      })}

      {/* PUTDOWN — striped sub-bar pinned to the right edge of the block area */}
      {putdowns.map((p, i) => {
        const top = yOf(p.start);
        const h = yOf(p.end) - yOf(p.start);
        return (
          <div key={`pd${i}`} title={p.label} style={{
            position: 'absolute',
            right: INSTANT_W + 8,
            top, height: h, width: 14,
            background: 'repeating-linear-gradient(45deg, #e8dcc0 0 4px, #b89a4a 4px 5px)',
            borderRadius: '0 4px 4px 0',
            borderTop: '1.5px solid #b89a4a',
            borderRight: '1.5px solid #b89a4a',
            borderBottom: '1.5px solid #b89a4a',
            opacity: isPast(p.end) ? 0.45 : 1,
            zIndex: 2,
          }} />
        );
      })}

      {/* Putdown legend pip in axis column to explain the stripe — shown once near top */}
      <div style={{
        position: 'absolute', right: INSTANT_W + 26, top: 4,
        fontSize: 8, fontFamily: "'Caveat', cursive", color: '#7a6f5d',
        transform: 'rotate(-90deg)', transformOrigin: 'right top',
      }}>↓ putdown</div>

      {/* INSTANTS COLUMN */}
      {groups.map((g, gi) => {
        const y = yOf(g.at);
        const past = isPast(g.at);
        return (
          <div key={gi} style={{
            position: 'absolute',
            right: 4,
            top: y - 10,
            width: INSTANT_W,
            opacity: past ? 0.45 : 1,
          }}>
            {/* Time tick + label */}
            <div style={{
              position: 'absolute', left: -4, top: 10, width: 4,
              borderTop: '1.5px solid #6f6657',
            }} />
            <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
              {g.items.map((it, j) => {
                const t = window.TYPES[it.type];
                const ow = it.owner ? window.OWNERS[it.owner] : null;
                const useOwnerColor = colorMode === 'owner' && ow;
                return (
                  <div key={j} style={{
                    background: '#fdfbf4',
                    border: `1.5px solid ${useOwnerColor ? ow.color : t.dot}`,
                    borderRadius: 10,
                    padding: '1px 6px 1px 4px',
                    fontSize: 10,
                    fontFamily: "'Kalam', sans-serif",
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    whiteSpace: 'nowrap',
                    boxShadow: '1px 1px 0 #2a2620',
                  }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: useOwnerColor ? ow.color : t.dot,
                      border: ow && !useOwnerColor ? `1.5px solid ${ow.color}` : 'none',
                    }} />
                    <span style={{ fontWeight: 700 }}>{t.name}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 9, color: '#5a5040', marginTop: 1, textAlign: 'left' }}>
              {window.fmtShort(g.at)}
            </div>
          </div>
        );
      })}

      <window.NowLine y={yOf(window.NOW_MIN)} left={AXIS_W} right={4} />
    </div>
  );
}

window.V2_TwoColumn = V2_TwoColumn;
