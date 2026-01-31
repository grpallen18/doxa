'use client'

import { useEffect } from 'react'

const BALL_CLASSES = ['ball0', 'ball1', 'ball2', 'ball3', 'ball4', 'ball5', 'ball6', 'ball7', 'ball8'] as const

const FADE_OUT_DURATION_MS = 500

export function PostLoginLoader({
  duration = 3000,
  fadeOut = false,
  onComplete,
}: {
  duration?: number
  /** When true, loader fades out over FADE_OUT_DURATION_MS before onComplete is called */
  fadeOut?: boolean
  onComplete?: () => void
}) {
  /* When fadeOut is true, run fade-out then call onComplete after FADE_OUT_DURATION_MS */
  useEffect(() => {
    if (!fadeOut || !onComplete) return
    const t = setTimeout(() => {
      onComplete()
    }, FADE_OUT_DURATION_MS)
    return () => clearTimeout(t)
  }, [fadeOut, onComplete])

  return (
    <div
      className={`post-login-loader-main fixed inset-0 z-50 flex items-center justify-center animate-in fade-in duration-500 ${fadeOut ? 'post-login-loader-fade-out' : ''}`}
      aria-hidden="true"
    >
      <div className="post-login-loader-inner relative">
        <div className="loaders">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="loader" />
          ))}
        </div>
        <div className="loadersB">
          {BALL_CLASSES.map((ballClass, i) => (
            <div key={i} className="loaderA">
              <div className={ballClass} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
