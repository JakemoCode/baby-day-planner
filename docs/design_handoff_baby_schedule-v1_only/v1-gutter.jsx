// VARIATION 1: INLINE GUTTER
// Single column. Blocks fill most of width. A right gutter holds instant chips
// that "pin" to their exact time via a leader line. Concurrent instants fan
// horizontally within the gutter at the same y, never stacking vertically.

function V1_InlineGutter({ events, density, dimPast, colorMode }) {
  const startMin = window.M(6, 0);
  const endMin = window.M(20, 0);
  const PX_PER_MIN = density / 60;
  const totalH = (endMin - startMin) * PX_PER_MIN;
  const AXIS_W = 50;
  const GUTTER_W = 110;
  const PAD = 6;

  const yOf = (m) => (m - startMin) * PX_PER_MIN;
  const blocks = events.filter(e => e.kind === 'block');
  const instants = events.filter(e => e.kind === 'instant');
  const groups = window.groupInstants(events);
  const isPast = (m) => dimPast && m < window.NOW_MIN;

  return (
    <div style={{ position: 'relative', height: totalH + 40, padding: '12px 6px 24px' }}>
      {/* Hour grid lines + labels (UNDER blocks) */}
      {Array.from({ length: (endMin - startMin) / 60 + 1 }).map((_, i) => {
        const m = startMin + i * 60;
        return (
          <React.Fragment key={i}>
            <div style={{
              position: 'absolute', left: AXIS_W, right: 6, top: yOf(m),
              borderTop: '1px dashed #c8bea8', height: 0,
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

      {/* BLOCKS — wake / nap / putdown / custom */}
      {blocks.map((b, i) => {
        const t = window.TYPES[b.type];
        const ow = b.owner ? window.OWNERS[b.owner] : null;
        const top = yOf(b.start);
        const h = yOf(b.end) - yOf(b.start);
        const isPutdown = b.type === 'putdown';
        const isCustom = b.type === 'custom';
        const useOwnerColor = colorMode === 'owner' && ow;

        return (
          <div key={i} style={{
            position: 'absolute',
            left: AXIS_W + 4,
            right: GUTTER_W,
            top,
            height: h,
            background: isPutdown
              ? `repeating-linear-gradient(45deg, ${t.fill}, ${t.fill} 5px, #f3e8c8 5px, #f3e8c8 10px)`
              : (useOwnerColor ? ow.color + '22' : t.fill),
            border: `1.5px solid ${useOwnerColor ? ow.color : t.stroke}`,
            borderLeft: ow ? `5px solid ${ow.color}` : `1.5px solid ${t.stroke}`,
            borderRadius: 4,
            padding: '3px 6px',
            opacity: isPast(b.end) ? 0.45 : 1,
            fontSize: 11,
            color: '#2a2620',
            overflow: 'visible',
            zIndex: isPutdown ? 2 : (isCustom ? 3 : 1),
            // Putdown: anchored to LEFT, narrower so it doesn't cover wake text
            ...(isPutdown ? { right: GUTTER_W + 30, borderRadius: '4px 0 0 4px' } : {}),
            // Custom: anchored to RIGHT as a sub-block, wake/parent window text stays visible on left
            ...(isCustom ? { left: AXIS_W + 4 + 110, borderRadius: '0 4px 4px 0' } : {}),
          }}>
            <div style={{ fontFamily: "'Caveat', cursive", fontSize: 14, fontWeight: 700, lineHeight: 1 }}>
              {b.label}
            </div>
            <div style={{ fontSize: 9, color: '#5a5040', marginTop: 1 }}>
              {window.fmtShort(b.start)}–{window.fmtShort(b.end)}
              {ow && <span style={{ marginLeft: 4, color: ow.color, fontWeight: 700 }}>· {ow.name}</span>}
            </div>
            {/* Custom event: explicit start/end markers (thin horizontal lines at edges) */}
            {isCustom && (
              <>
                <div style={{
                  position: 'absolute', left: -4, right: -4, top: -1, height: 0,
                  borderTop: `1px solid ${useOwnerColor ? ow.color : t.dot || '#7a9479'}`,
                }} />
                <div style={{
                  position: 'absolute', left: -4, right: -4, bottom: -1, height: 0,
                  borderTop: `1px solid ${useOwnerColor ? ow.color : t.dot || '#7a9479'}`,
                }} />
              </>
            )}
          </div>
        );
      })}

      {/* INSTANTS — in right gutter, type chips stacked, time inline in each chip */}
      {groups.map((g, gi) => {
        const y = yOf(g.at);
        const past = isPast(g.at);
        return (
          <div key={gi} style={{
            position: 'absolute',
            right: 6,
            top: y - 10,
            width: GUTTER_W - 8,
            opacity: past ? 0.45 : 1,
            zIndex: 5,
          }}>
            {/* leader line from block edge to chip cluster */}
            <div style={{
              position: 'absolute', left: -4, top: 10, width: 4, height: 0,
              borderTop: '1.5px solid #6f6657',
            }} />
            <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 3, justifyContent: 'flex-start' }}>
              {g.items.map((it, j) => {
                const t = window.TYPES[it.type];
                const ow = it.owner ? window.OWNERS[it.owner] : null;
                const useOwnerColor = colorMode === 'owner' && ow;
                return (
                  <div key={j} title={it.label} style={{
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
                      flexShrink: 0,
                    }} />
                    <span style={{ fontWeight: 700 }}>{t.name}</span>
                    <span style={{ color: '#7a6f5d', fontSize: 9 }}>{window.fmtShort(g.at)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* NOW line */}
      <NowLine y={yOf(window.NOW_MIN)} left={AXIS_W} right={6} />
    </div>
  );
}

function NowLine({ y, left=0, right=0 }) {
  // Pill sits in the axis column to the LEFT of `left`, so it cannot cover
  // any event content. Caller must reserve enough axis-column space.
  return (
    <>
      <div style={{
        position: 'absolute', left, right, top: y,
        borderTop: '2px solid #d04a3a', height: 0, zIndex: 10,
      }} />
      <div style={{
        position: 'absolute', left: 0, top: y - 9, zIndex: 11,
        width: left - 2,
        background: '#d04a3a', color: '#fff',
        fontFamily: "'Caveat', cursive", fontSize: 12, fontWeight: 700,
        padding: '0 3px', borderRadius: 3,
        textAlign: 'center', whiteSpace: 'nowrap',
        boxSizing: 'border-box',
      }}>
        {window.fmt(window.NOW_MIN)}
      </div>
    </>
  );
}

window.V1_InlineGutter = V1_InlineGutter;
window.NowLine = NowLine;
