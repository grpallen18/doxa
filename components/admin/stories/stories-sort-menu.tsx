'use client'

import { useMemo, useState } from 'react'
import {
  ArrowDownWideNarrow,
  ArrowUpDown,
  ArrowUpNarrowWide,
  GripVertical,
  Plus,
  X,
} from 'lucide-react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  DEFAULT_STORY_SORTS,
  STORY_SORT_FIELDS,
  serializeStorySorts,
  sortsAreDefault,
  storyListFieldLabel,
  type StoryListFieldKey,
  type StorySortRule,
} from '@/lib/admin/story-list-fields'
import { cn } from '@/lib/utils'

export type { StoryListFieldKey as StorySortKey, StorySortRule }
export {
  DEFAULT_STORY_SORTS,
  serializeStorySorts,
  sortsAreDefault,
}

function SortableSortRow({
  rule,
  canRemove,
  onToggleDirection,
  onRemove,
}: {
  rule: StorySortRule
  canRemove: boolean
  onToggleDirection: () => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: rule.key,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const DirectionIcon =
    rule.direction === 'asc' ? ArrowUpNarrowWide : ArrowDownWideNarrow
  const label = storyListFieldLabel(rule.key)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative flex items-center gap-1 rounded-md px-0.5 py-0.5',
        isDragging && 'z-10 bg-surface opacity-90 shadow-sm'
      )}
    >
      <button
        type="button"
        className="flex h-7 w-6 shrink-0 cursor-grab items-center justify-center rounded-md text-muted hover:text-foreground active:cursor-grabbing"
        aria-label={`Reorder ${label}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted hover:text-foreground"
        aria-label={
          rule.direction === 'asc'
            ? `Sort ${label} ascending. Click for descending.`
            : `Sort ${label} descending. Click for ascending.`
        }
        onClick={onToggleDirection}
      >
        <DirectionIcon className="h-3.5 w-3.5" />
      </Button>
      <span className="min-w-0 flex-1 truncate text-xs text-muted">{label}</span>
      {canRemove ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-muted hover:text-foreground"
          aria-label={`Remove ${label} sort`}
          onClick={onRemove}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      ) : (
        <span className="h-6 w-6 shrink-0" aria-hidden />
      )}
    </div>
  )
}

export function StoriesSortMenu({
  sorts,
  onApply,
  disabled,
}: {
  sorts: StorySortRule[]
  onApply: (next: StorySortRule[]) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<StorySortRule[]>(sorts)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const addable = useMemo(
    () => STORY_SORT_FIELDS.filter((def) => !draft.some((rule) => rule.key === def.key)),
    [draft]
  )

  const activeCount = sortsAreDefault(sorts) ? 0 : sorts.length

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (nextOpen) setDraft(sorts.map((rule) => ({ ...rule })))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setDraft((prev) => {
      const oldIndex = prev.findIndex((rule) => rule.key === active.id)
      const newIndex = prev.findIndex((rule) => rule.key === over.id)
      if (oldIndex < 0 || newIndex < 0) return prev
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  const toggleDirection = (key: StoryListFieldKey) => {
    setDraft((prev) =>
      prev.map((rule) =>
        rule.key === key
          ? { ...rule, direction: rule.direction === 'asc' ? 'desc' : 'asc' }
          : rule
      )
    )
  }

  const addSort = (key: StoryListFieldKey) => {
    setDraft((prev) =>
      prev.some((rule) => rule.key === key)
        ? prev
        : [...prev, { key, direction: 'desc' }]
    )
  }

  const removeSort = (key: StoryListFieldKey) => {
    setDraft((prev) => {
      if (prev.length <= 1) return prev
      return prev.filter((rule) => rule.key !== key)
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onApply(draft.length > 0 ? draft : DEFAULT_STORY_SORTS)
    setOpen(false)
  }

  const handleClear = () => {
    onApply(DEFAULT_STORY_SORTS)
    setDraft(DEFAULT_STORY_SORTS)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <ArrowUpDown className="h-4 w-4" />
          Sort
          {activeCount > 0 ? (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
              {activeCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[28rem] overflow-hidden p-0">
        <form onSubmit={handleSubmit}>
          <div className="max-h-[min(20rem,var(--radix-popover-content-available-height,20rem))] overflow-y-auto px-2 py-2">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={draft.map((rule) => rule.key)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-1">
                  {draft.map((rule) => (
                    <SortableSortRow
                      key={rule.key}
                      rule={rule}
                      canRemove={draft.length > 1}
                      onToggleDirection={() => toggleDirection(rule.key)}
                      onRemove={() => removeSort(rule.key)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            {addable.length > 0 ? (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-7 px-1.5 text-xs font-normal text-muted hover:text-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add sort
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-64 w-52 overflow-y-auto">
                  {addable.map((def) => (
                    <DropdownMenuItem key={def.key} onSelect={() => addSort(def.key)}>
                      {def.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
          <div className="flex gap-2 border-t border-border px-2 py-2">
            <Button type="submit" size="sm" disabled={disabled}>
              Apply
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || (sortsAreDefault(draft) && sortsAreDefault(sorts))}
              onClick={handleClear}
            >
              Clear
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
