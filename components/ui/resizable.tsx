"use client"

import * as React from "react"
import { GripVerticalIcon } from "lucide-react"
import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle,
  type GroupProps,
  type PanelProps,
  type SeparatorProps,
} from "react-resizable-panels"

import { cn } from "@/lib/utils"

function ResizablePanelGroup({
  className,
  ...props
}: GroupProps) {
  return (
    <PanelGroup
      className={cn(
        "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
        className,
      )}
      {...props}
    />
  )
}

function ResizablePanel({ ...props }: PanelProps) {
  return <Panel {...props} />
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: SeparatorProps & { withHandle?: boolean }) {
  return (
    <PanelResizeHandle
      className={cn(
        "relative flex w-px items-center justify-center bg-[var(--border-subtle)] after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-1 data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:-translate-y-1/2 data-[panel-group-direction=vertical]:after:translate-x-0 [&[data-panel-group-direction=vertical]>div]:rotate-90",
        className,
      )}
      {...props}
    >
      {withHandle && (
        <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border border-[var(--border-subtle)] bg-[var(--surface)]">
          <GripVerticalIcon className="size-2.5 text-muted" />
        </div>
      )}
    </PanelResizeHandle>
  )
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
