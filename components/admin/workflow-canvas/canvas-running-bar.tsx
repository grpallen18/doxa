export function CanvasRunningBar() {
  return (
    <div className="relative h-0.5 w-full overflow-hidden bg-zinc-800" aria-hidden>
      <div className="canvas-running-bar-shuttle absolute left-0 top-0 h-full w-1/4 bg-emerald-500" />
    </div>
  )
}
