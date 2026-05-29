export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#F5F3FF', minHeight: '100vh', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      {children}
    </div>
  )
}
