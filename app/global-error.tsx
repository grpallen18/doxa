'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: '#e4e1dd',
          color: '#1a1712',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 400,
            textAlign: 'center',
            padding: 32,
            borderRadius: 20,
            background: '#e9e6e2',
            boxShadow: '8px 8px 24px rgba(0,0,0,0.06), -8px -8px 24px rgba(255,255,255,0.8)',
          }}
        >
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 16 }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 14, color: '#4a4539', marginBottom: 24 }}>
            A critical error occurred. Reload the page or open the home page in a new tab.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                padding: '12px 24px',
                fontSize: 14,
                fontWeight: 500,
                borderRadius: 16,
                border: '1px solid rgba(255,255,255,0.5)',
                background: '#c9a55d',
                color: '#1a1712',
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                padding: '12px 24px',
                fontSize: 14,
                fontWeight: 500,
                borderRadius: 16,
                border: '1px solid rgba(255,255,255,0.7)',
                background: '#e9e6e2',
                color: '#1a1712',
                textDecoration: 'none',
                boxShadow: '4px 4px 12px rgba(0,0,0,0.08), -2px -2px 8px rgba(255,255,255,0.7)',
              }}
            >
              Go home
            </a>
          </div>
        </div>
      </body>
    </html>
  )
}
