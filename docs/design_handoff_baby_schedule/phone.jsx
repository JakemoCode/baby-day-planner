// Tiny "phone frame" for mobile wireframes — sketchy style.
// Wraps children in a 360-wide, ~720-tall mobile viewport with a header + scroll area.

function PhoneFrame({ title, subtitle, children, height = 760, width = 360 }) {
  return (
    <div style={{
      width: width + 16,
      background: '#fdfbf4',
      border: '2px solid #2a2620',
      borderRadius: 28,
      padding: 8,
      boxShadow: '4px 5px 0 #2a2620',
      fontFamily: "'Kalam', sans-serif",
    }}>
      <div style={{
        width,
        height,
        background: '#fdfbf4',
        borderRadius: 22,
        overflow: 'hidden',
        position: 'relative',
        border: '1.5px solid #2a2620',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* status bar */}
        <div style={{
          height: 22,
          background: '#f3eedf',
          borderBottom: '1px dashed #b8aa88',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 14px',
          fontFamily: "'Caveat', cursive",
          fontSize: 13,
          color: '#5a5040',
        }}>
          <span>9:03</span>
          <span style={{ letterSpacing: 2 }}>• • •</span>
        </div>
        {/* app header */}
        <div style={{
          padding: '10px 14px 6px',
          borderBottom: '1.5px solid #2a2620',
          background: '#fdfbf4',
        }}>
          <div style={{
            fontFamily: "'Caveat', cursive",
            fontSize: 22,
            fontWeight: 700,
            lineHeight: 1,
            color: '#2a2620',
          }}>{title}</div>
          {subtitle && (
            <div style={{ fontSize: 11, color: '#7a6f5d', marginTop: 2 }}>{subtitle}</div>
          )}
        </div>
        {/* content */}
        <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

window.PhoneFrame = PhoneFrame;
