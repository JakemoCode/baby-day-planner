// VARIATION 3: TICK ON AXIS
// Single column. Blocks fill almost full width. Instants are TICK MARKS
// directly on the time axis (with type-color dot + tiny label callout
// pulled into a margin space to the LEFT of the axis). Block content is
// never obscured because instants live in the axis gutter, not inside blocks.
// Concurrent instants fan horizontally to the LEFT of the axis.

function V3_TickAxis({ events, density, dimPast, colorMode }) {
  const startMin = window.M(6, 0);
  const endMin = window.M(20, 0);
  const PX_PER_MIN = density / 60;
  const totalH = (endMin - startMin) * PX_PER_MIN;
  const AXIS_X = 88; // axis line is here; everything left of it = instants gutter

  const yOf = (m) => (m - startMin) * PX_PER_MIN;
  const blocks = events.filter(e => e.kind === 'block');
  const groups = window.groupInstants(events);
  const isPast = (m) => dimPast && m < window.NOW_MIN;

  return (
    <div style={{ position: 'relative', height: totalH + 40, padding: '12px 4px 24px' }}>
      {/* Vertical axis line */}
      <div style={{
        position: 'absolute', left: AXIS_X, top: 0, bottom: 0,
        borderLeft: '2px solid #2a2620',
      }} />

      {/* Hour ticks + labels */}
      {Array.from({ length: (endMin - startMin) / 60 + 1 }).map((_, i) => {
        const m = startMin + i * 60;
        return (
          <React.Fragment key={i}>
            <div style={{
              position: 'absolute', left: AXIS_X - 4, top: yOf(m), width: 8, height: 0,
              borderTop: '2px solid #2a2620',
            }} />
            <div style={{
              position: 'absolute', left: AXIS_X + 8, top: yOf(m) - 8,
              fontFamily: "'Caveat', cursive", fontSize: 13, color: '#5a5040',
              background: '#fdfbf4', padding: '0 3px',
            }}>
              {window.fmtShort(m).toUpperCase()}
            </div>
          </React.Fragment>
        );
      })}

      {/* BLOCKS — sit to the right of the axis */}
      {blocks.map((b, i) => {
        const t = window.TYPES[b.type];
        const ow = b.owner ? window.OWNERS[b.owner] : null;
        const useOwnerColor = colorMode === 'owner' && ow;
        const top = yOf(b.start);
        const h = yOf(b.end) - yOf(b.start);
        const isPutdown = b.type === 'putdown';

        return (
          <div key={i} style={{
            position: 'absolute',
            left: AXIS_X + 36,
            right: 6,
            top, height: h,
            background: isPutdown
              ? 'repeating-linear-gradient(45deg, #e8dcc0 0 5px, #f3e8c8 5px 10px)'
              : (useOwnerColor ? ow.color + '22' : t.fill),
            border: `1.5px solid ${useOwnerColor ? ow.color : t.stroke}`,
            borderLeft: ow ? `5px solid ${ow.color}` : `1.5px solid ${t.stroke}`,
            borderRadius: 4,
            padding: '3px 6px',
            opacity: isPast(b.end) ? 0.45 : 1,
            fontSize: 11,
            overflow: 'hidden',
            // Putdown narrower so it doesn't overlap the wake's text
            ...(isPutdown ? { left: AXIS_X + 36 + 80, zIndex: 3 } : { zIndex: 1 }),
          }}>
            <div style={{ fontFamily: "'Caveat', cursive", fontSize: 14, fontWeight: 700, lineHeight: 1 }}>
              {b.label}
            </div>
            <div style={{ fontSize: 9, color: '#5a5040', marginTop: 1 }}>
              {window.fmtShort(b.start)}–{window.fmtShort(b.end)}
              {ow && <span style={{ marginLeft: 4, color: ow.color, fontWeight: 700 }}>· {ow.name}</span>}
            </div>
          </div>
        );
      })}

      {/* INSTANTS — tick marks ON the axis, label fans left */}
      {groups.map((g, gi) => {
        const y = yOf(g.at);
        const past = isPast(g.at);
        return (
          <div key={gi} style={{
            position: 'absolute',
            left: 0, top: y - 8, width: AXIS_X - 6, height: 16,
            display: 'flex', flexDirection: 'row-reverse', alignItems: 'center',
            gap: 2,
            opacity: past ? 0.45 : 1,
            zIndex: 5,
          }}>
            {g.items.map((it, j) => {
              const t = window.TYPES[it.type];
              const ow = it.owner ? window.OWNERS[it.owner] : null;
              const useOwnerColor = colorMode === 'owner' && ow;
              return (
                <div key={j} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  background: '#fdfbf4',
                  border: `1.5px solid ${useOwnerColor ? ow.color : t.dot}`,
                  borderRadius: 8, padding: '0 4px',
                  fontFamily: "'Kalam', sans-serif", fontSize: 10,
                  whiteSpace: 'nowrap',
                  boxShadow: '1px 1px 0 #2a2620',
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: useOwnerColor ? ow.color : t.dot,
                    border: ow && !useOwnerColor ? `1px solid ${ow.color}` : 'none',
                  }} />
                  <span style={{ fontWeight: 700, fontSize: 9 }}>{t.name}</span>
                </div>
              );
            })}
            {/* The diamond on the axis */}
            <div style={{
              position: 'absolute', right: -7, top: 4, width: 8, height: 8,
              background: '#2a2620', transform: 'rotate(45deg)',
            }} />
          </div>
        );
      })}

      <window.NowLine y={yOf(window.NOW_MIN)} left={AXIS_X - 6} right={6} />
    </div>
  );
}

window.V3_TickAxis = V3_TickAxis;
