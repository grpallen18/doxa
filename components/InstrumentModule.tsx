type InstrumentModuleProps = {
  title: string
  value?: string
  indicator?: boolean
}

export function InstrumentModule({ title, value = '60%', indicator }: InstrumentModuleProps) {
  return (
    <div className="rounded-[16px] bg-surface p-5 shadow-panel-soft">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-medium uppercase tracking-[0.12em] text-muted">
          {title}
        </span>
        {indicator && <span className="indicator-dot" />}
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background shadow-inset-soft">
          <div className="h-3 w-3 rounded-full bg-[#8a7f6f]" />
        </div>
        <div className="flex-1 rounded-full bg-background shadow-inset-soft">
          <div
            className="h-2 rounded-full bg-accent-cyan"
            style={{ width: value }}
          />
        </div>
      </div>

      <div className="flex gap-2">
        {[0, 1, 2].map((index) => (
          <div
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            className="h-6 w-6 rounded-[6px] bg-background shadow-inset-soft"
          />
        ))}
      </div>
    </div>
  )
}

