import { cn } from '@/lib/utils'

/** Agent icon center offset from the start of a flow lane column (`size-5` / 2). */
export const FLOW_AGENT_ANCHOR = '0.625rem'

const flowLineClass = 'bg-[var(--pipeline-step-track)]'

function ArrowDown({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 8"
      className={cn('size-2 fill-[var(--pipeline-step-track)]', className)}
      aria-hidden
    >
      <path d="M6 8 0 0h12L6 8Z" />
    </svg>
  )
}

function LaneAgentAnchor({ className, top }: { className?: string; top: string }) {
  return (
    <div
      className={cn('absolute flex -translate-x-1/2 flex-col items-center', className)}
      style={{ left: FLOW_AGENT_ANCHOR, top }}
    >
      <div className={cn('h-2 w-px', flowLineClass)} />
      <ArrowDown />
    </div>
  )
}

/** Vertical connector aligned to the agent icon in a single-column step row. */
export function FlowConnector({
  variant = 'vertical',
  className,
}: {
  variant?: 'vertical' | 'fork' | 'join' | 'dual-vertical'
  className?: string
}) {
  if (variant === 'fork') {
    return (
      <div
        className={cn('relative col-span-2 grid h-9 grid-cols-subgrid', className)}
        aria-hidden
      >
        <div className="relative col-start-1">
          <div
            className={cn('absolute top-0 w-px -translate-x-1/2', flowLineClass)}
            style={{ left: FLOW_AGENT_ANCHOR, height: '1rem' }}
          />
          <div
            className={cn('absolute top-4 h-px -right-4 sm:-right-6', flowLineClass)}
            style={{ left: FLOW_AGENT_ANCHOR }}
          />
          <LaneAgentAnchor top="1rem" />
        </div>
        <div className="relative col-start-2">
          <div
            className={cn('absolute top-4 h-px', flowLineClass)}
            style={{ left: 0, width: FLOW_AGENT_ANCHOR }}
          />
          <LaneAgentAnchor top="1rem" />
        </div>
      </div>
    )
  }

  if (variant === 'dual-vertical') {
    return (
      <div
        className={cn('relative col-span-2 grid h-5 grid-cols-subgrid', className)}
        aria-hidden
      >
        <div className="relative col-start-1">
          <div
            className="absolute top-0 flex h-full -translate-x-1/2 flex-col items-center"
            style={{ left: FLOW_AGENT_ANCHOR }}
          >
            <div className={cn('h-3 w-px', flowLineClass)} />
            <ArrowDown />
          </div>
        </div>
        <div className="relative col-start-2">
          <div
            className="absolute top-0 flex h-full -translate-x-1/2 flex-col items-center"
            style={{ left: FLOW_AGENT_ANCHOR }}
          >
            <div className={cn('h-3 w-px', flowLineClass)} />
            <ArrowDown />
          </div>
        </div>
      </div>
    )
  }

  if (variant === 'join') {
    return (
      <div
        className={cn('relative col-span-2 grid h-9 grid-cols-subgrid', className)}
        aria-hidden
      >
        <div className="relative col-start-1">
          <div
            className={cn('absolute top-0 w-px -translate-x-1/2', flowLineClass)}
            style={{ left: FLOW_AGENT_ANCHOR, height: '0.5rem' }}
          />
          <div
            className={cn('absolute top-2 h-px -right-4 sm:-right-6', flowLineClass)}
            style={{ left: FLOW_AGENT_ANCHOR }}
          />
        </div>
        <div className="relative col-start-2">
          <div
            className={cn('absolute top-0 w-px -translate-x-1/2', flowLineClass)}
            style={{ left: FLOW_AGENT_ANCHOR, height: '0.5rem' }}
          />
          <div
            className={cn('absolute top-2 h-px', flowLineClass)}
            style={{ left: 0, width: FLOW_AGENT_ANCHOR }}
          />
        </div>
        <div className="relative col-start-1">
          <LaneAgentAnchor top="0.5rem" />
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn('flex py-0.5', className)}
      style={{ paddingLeft: FLOW_AGENT_ANCHOR }}
      aria-hidden
    >
      <div className="-translate-x-1/2 flex flex-col items-center">
        <div className={cn('h-3 w-px', flowLineClass)} />
        <ArrowDown />
      </div>
    </div>
  )
}

/** Shared grid template for parallel lanes + subgrid connectors. */
export const FLOW_PARALLEL_GRID_CLASS =
  'inline-grid grid-cols-[max-content_max-content] gap-x-4 sm:gap-x-6'
