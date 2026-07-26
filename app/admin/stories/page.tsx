'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronsLeft,
  ChevronsRight,
  ListFilter,
  Plus,
  Search,
  X,
} from 'lucide-react'
import { Panel } from '@/components/Panel'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { storyAdminHref } from '@/lib/admin/friendly-id'
import { pageCount } from '@/lib/admin/pagination'
import type { StoryListItem } from '@/lib/admin/story-extraction-review'
import {
  countActiveStoryFilters,
  DEFAULT_STORY_SORTS,
  DEFAULT_VISIBLE_STORY_FILTERS,
  emptyStoryFilters,
  serializeStorySorts,
  STORY_FILTER_FIELDS,
  visibleFilterKeysFromValues,
  type StoryFilterKey,
  type StoryFilters,
  type StorySortRule,
} from '@/lib/admin/story-list-fields'
import { StoriesSortMenu } from '@/components/admin/stories/stories-sort-menu'
import { Skeleton } from '@/components/ui/skeleton'

const PAGE_SIZE = 10

const EMPTY_FILTERS = emptyStoryFilters()

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function visiblePageRange(page: number, totalPages: number): { start: number; end: number } {
  const maxVisible = 5
  if (totalPages <= maxVisible) return { start: 1, end: totalPages }
  if (page <= 3) return { start: 1, end: maxVisible }
  if (page >= totalPages - 2) return { start: totalPages - maxVisible + 1, end: totalPages }
  return { start: page - 2, end: page + 2 }
}

function StoryListRowSkeleton() {
  return (
    <div className="px-3 py-2" aria-hidden>
      <Skeleton className="h-5 w-[72%]" />
      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-3 w-32" />
      </div>
    </div>
  )
}

function StoriesListSkeleton({ rows = PAGE_SIZE }: { rows?: number }) {
  return (
    <ul aria-busy="true" aria-label="Loading stories">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i}>
          <StoryListRowSkeleton />
        </li>
      ))}
    </ul>
  )
}

function StoriesPaginationSkeleton() {
  return (
    <div
      className="grid grid-cols-1 items-center gap-3 border-t border-border px-4 py-3 sm:grid-cols-[1fr_auto_1fr]"
      aria-hidden
    >
      <Skeleton className="h-5 w-36 sm:justify-self-start" />
      <div className="flex items-center gap-1 sm:justify-self-center">
        {Array.from({ length: 9 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-9" />
        ))}
      </div>
      <div className="flex items-center gap-1.5 sm:justify-self-end">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-10" />
      </div>
    </div>
  )
}

export default function AdminStoriesPage() {
  const router = useRouter()
  const [filters, setFilters] = useState<StoryFilters>(EMPTY_FILTERS)
  const [draftFilters, setDraftFilters] = useState<StoryFilters>(EMPTY_FILTERS)
  const [visibleFilterKeys, setVisibleFilterKeys] = useState<StoryFilterKey[]>(
    DEFAULT_VISIBLE_STORY_FILTERS
  )
  const [filterOpen, setFilterOpen] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [sorts, setSorts] = useState<StorySortRule[]>(DEFAULT_STORY_SORTS)
  const [items, setItems] = useState<StoryListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageInput, setPageInput] = useState('1')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const totalPages = pageCount(total, PAGE_SIZE)
  const activeFilterCount = countActiveStoryFilters(filters)
  const offset = (page - 1) * PAGE_SIZE
  const addableFilters = STORY_FILTER_FIELDS.filter(
    (def) => !visibleFilterKeys.includes(def.key)
  )
  const visibleFilterDefs = STORY_FILTER_FIELDS.filter((def) =>
    visibleFilterKeys.includes(def.key)
  )

  const pageNumbers = useMemo(() => {
    const { start, end } = visiblePageRange(page, totalPages)
    return Array.from({ length: end - start + 1 }, (_, i) => start + i)
  }, [page, totalPages])

  const fetchStories = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
        sort: serializeStorySorts(sorts),
      })
      for (const field of STORY_FILTER_FIELDS) {
        const value = filters[field.key].trim()
        if (value) params.set(field.key, value)
      }

      const res = await fetch(`/api/admin/stories/list?${params}`)
      const json = await res.json()
      if (!res.ok) {
        setError(json.error?.message ?? 'Failed to load stories')
        setItems([])
        return
      }
      setItems(json.data?.items ?? [])
      setTotal(json.data?.total ?? 0)
    } catch {
      setError('Failed to load stories')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [filters, sorts, offset])

  useEffect(() => {
    fetchStories()
  }, [fetchStories])

  useEffect(() => {
    setSearchInput(filters.keyword)
  }, [filters.keyword])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      let changed = false
      setFilters((prev) => {
        if (prev.keyword === searchInput) return prev
        changed = true
        return { ...prev, keyword: searchInput }
      })
      setDraftFilters((prev) =>
        prev.keyword === searchInput ? prev : { ...prev, keyword: searchInput }
      )
      if (changed) setPage(1)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    setPageInput(String(page))
  }, [page])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const goToPage = (nextPage: number) => {
    if (loading) return
    const clamped = Math.min(totalPages, Math.max(1, nextPage))
    setPage(clamped)
  }

  const applyFilters = (
    next: StoryFilters,
    nextVisible: StoryFilterKey[] = visibleFilterKeys
  ) => {
    setFilters(next)
    setDraftFilters(next)
    setVisibleFilterKeys(nextVisible)
    setPage(1)
    setFilterOpen(false)
  }

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    applyFilters(draftFilters, visibleFilterKeys)
  }

  const handleClearFilters = () => {
    applyFilters(EMPTY_FILTERS, DEFAULT_VISIBLE_STORY_FILTERS)
  }

  const addFilter = (key: StoryFilterKey) => {
    setVisibleFilterKeys((prev) => (prev.includes(key) ? prev : [...prev, key]))
  }

  const removeFilter = (key: StoryFilterKey) => {
    if (key === 'title') return
    setVisibleFilterKeys((prev) => prev.filter((k) => k !== key))
    setDraftFilters((prev) => ({ ...prev, [key]: '' }))
  }

  const handleSortApply = (next: StorySortRule[]) => {
    setSorts(next)
    setPage(1)
  }

  const handlePageJump = (e: React.FormEvent) => {
    e.preventDefault()
    const parsed = Number.parseInt(pageInput, 10)
    if (!Number.isFinite(parsed)) {
      setPageInput(String(page))
      return
    }
    goToPage(parsed)
  }

  const { start: rangeStart, end: rangeEnd } = visiblePageRange(page, totalPages)
  const pagerDisabled = loading || total === 0

  const inputClassName = (removable: boolean) =>
    removable
      ? 'h-7 min-w-0 px-2 pr-7 text-xs md:text-xs focus-visible:border-input focus-visible:ring-0'
      : 'h-7 min-w-0 px-2 text-xs md:text-xs focus-visible:border-input focus-visible:ring-0'

  const selectTriggerClassName = (removable: boolean) =>
    removable
      ? 'h-7 min-w-0 px-2 pr-7 text-xs focus:border-input focus:ring-0'
      : 'h-7 min-w-0 px-2 text-xs focus:border-input focus:ring-0'

  return (
    <>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <Panel variant="soft" interactive={false} className="overflow-hidden">
        <div className="grid grid-cols-1 items-center gap-2 px-3 py-2.5 sm:grid-cols-[1fr_minmax(14rem,36rem)_1fr]">
          <div className="flex flex-wrap items-center gap-2 sm:justify-self-start">
          <Popover
            open={filterOpen}
            onOpenChange={(open) => {
              setFilterOpen(open)
              if (open) {
                setDraftFilters(filters)
                setVisibleFilterKeys((prev) => {
                  const fromApplied = visibleFilterKeysFromValues(filters)
                  return Array.from(new Set([...fromApplied, ...prev]))
                })
              }
            }}
          >
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                <ListFilter className="h-4 w-4" />
                Filters
                {activeFilterCount > 0 ? (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
                    {activeFilterCount}
                  </span>
                ) : null}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-[28rem] overflow-hidden p-0"
            >
              <form onSubmit={handleFilterSubmit}>
                <div className="max-h-[min(20rem,var(--radix-popover-content-available-height,20rem))] overflow-y-auto px-2 py-2">
                  <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-2 gap-y-2">
                    {visibleFilterDefs.map((def) => {
                      const removable = def.key !== 'title'
                      return (
                        <Fragment key={def.key}>
                          <Label
                            htmlFor={`story-filter-${def.key}`}
                            className="truncate text-xs text-muted"
                          >
                            {def.label}
                          </Label>
                          <div className="relative min-w-0">
                            {def.filterKind === 'select' ? (
                              <Select
                                value={draftFilters[def.key] || 'any'}
                                onValueChange={(value) =>
                                  setDraftFilters((prev) => ({
                                    ...prev,
                                    [def.key]: value === 'any' ? '' : value,
                                  }))
                                }
                              >
                                <SelectTrigger
                                  id={`story-filter-${def.key}`}
                                  className={selectTriggerClassName(removable)}
                                >
                                  <SelectValue placeholder="Any" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="any">Any</SelectItem>
                                  {(def.options ?? []).map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                id={`story-filter-${def.key}`}
                                value={draftFilters[def.key]}
                                onChange={(e) =>
                                  setDraftFilters((prev) => ({
                                    ...prev,
                                    [def.key]: e.target.value,
                                  }))
                                }
                                placeholder={def.placeholder}
                                className={inputClassName(removable)}
                              />
                            )}
                            {removable ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute right-0.5 top-1/2 h-6 w-6 -translate-y-1/2 text-muted hover:text-foreground"
                                aria-label={`Remove ${def.label} filter`}
                                onClick={() => removeFilter(def.key)}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            ) : null}
                          </div>
                        </Fragment>
                      )
                    })}
                  </div>
                  {addableFilters.length > 0 ? (
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="mt-2 h-7 px-1.5 text-xs font-normal text-muted hover:text-foreground"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add filter
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="max-h-64 w-52 overflow-y-auto">
                        {addableFilters.map((def) => (
                          <DropdownMenuItem key={def.key} onSelect={() => addFilter(def.key)}>
                            {def.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
                <div className="flex gap-2 border-t border-border px-2 py-2">
                  <Button type="submit" size="sm" disabled={loading}>
                    Apply
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={
                      loading ||
                      (countActiveStoryFilters(draftFilters) === 0 &&
                        visibleFilterKeys.length === DEFAULT_VISIBLE_STORY_FILTERS.length)
                    }
                    onClick={handleClearFilters}
                  >
                    Clear
                  </Button>
                </div>
              </form>
            </PopoverContent>
          </Popover>

          <StoriesSortMenu sorts={sorts} onApply={handleSortApply} disabled={loading} />
          </div>

          <div className="relative w-full sm:justify-self-center">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search stories…"
              aria-label="Search stories"
              autoComplete="off"
              className="h-9 w-full bg-background pl-9 pr-3"
            />
          </div>

          <div className="hidden sm:block" aria-hidden />
        </div>

        <div>
          {loading && items.length === 0 ? (
            <StoriesListSkeleton />
          ) : items.length === 0 ? (
            <p className="p-6 text-sm text-muted">No stories found.</p>
          ) : (
            <ul className={loading ? 'pointer-events-none opacity-60' : undefined}>
              {items.map((story) => {
                const href = storyAdminHref(story)
                return (
                  <li key={story.story_id}>
                    <Link
                      href={href}
                      prefetch={false}
                      className="block min-w-0 px-3 py-2 transition-colors hover:bg-muted/30"
                      onClick={(e) => {
                        if (
                          e.defaultPrevented ||
                          e.button !== 0 ||
                          e.metaKey ||
                          e.ctrlKey ||
                          e.shiftKey ||
                          e.altKey
                        ) {
                          return
                        }
                        e.preventDefault()
                        router.push(href)
                      }}
                    >
                      <p className="truncate text-sm font-medium">{story.title}</p>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                        <span>{story.source_name ?? 'Unknown source'}</span>
                        <span>Published {formatDate(story.published_at)}</span>
                        <span>Ingested {formatDate(story.fetched_at)}</span>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        {loading && total === 0 ? (
          <StoriesPaginationSkeleton />
        ) : total > 0 ? (
          <div className="grid grid-cols-1 items-center gap-3 border-t border-border px-4 py-3 sm:grid-cols-[1fr_auto_1fr]">
            <span className="text-sm font-normal text-muted tabular-nums sm:justify-self-start">
              {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
            </span>
            <Pagination className="mx-0 w-auto justify-center sm:justify-self-center">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationLink
                      href="#"
                      aria-label="Go to first page"
                      size="icon"
                      className={page <= 1 || pagerDisabled ? 'pointer-events-none opacity-50' : ''}
                      onClick={(e) => {
                        e.preventDefault()
                        goToPage(1)
                      }}
                    >
                      <ChevronsLeft className="h-4 w-4" />
                    </PaginationLink>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      aria-disabled={page <= 1 || pagerDisabled}
                      className={page <= 1 || pagerDisabled ? 'pointer-events-none opacity-50' : ''}
                      onClick={(e) => {
                        e.preventDefault()
                        goToPage(page - 1)
                      }}
                    />
                  </PaginationItem>
                  {rangeStart > 1 && (
                    <>
                      <PaginationItem>
                        <PaginationLink
                          href="#"
                          onClick={(e) => {
                            e.preventDefault()
                            goToPage(1)
                          }}
                        >
                          1
                        </PaginationLink>
                      </PaginationItem>
                      {rangeStart > 2 && (
                        <PaginationItem>
                          <PaginationEllipsis />
                        </PaginationItem>
                      )}
                    </>
                  )}
                  {pageNumbers.map((pageNum) => (
                    <PaginationItem key={pageNum}>
                      <PaginationLink
                        href="#"
                        isActive={pageNum === page}
                        className={pagerDisabled ? 'pointer-events-none opacity-50' : undefined}
                        onClick={(e) => {
                          e.preventDefault()
                          goToPage(pageNum)
                        }}
                      >
                        {pageNum}
                      </PaginationLink>
                    </PaginationItem>
                  ))}
                  {rangeEnd < totalPages && (
                    <>
                      {rangeEnd < totalPages - 1 && (
                        <PaginationItem>
                          <PaginationEllipsis />
                        </PaginationItem>
                      )}
                      <PaginationItem>
                        <PaginationLink
                          href="#"
                          onClick={(e) => {
                            e.preventDefault()
                            goToPage(totalPages)
                          }}
                        >
                          {totalPages}
                        </PaginationLink>
                      </PaginationItem>
                    </>
                  )}
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      aria-disabled={page >= totalPages || pagerDisabled}
                      className={
                        page >= totalPages || pagerDisabled ? 'pointer-events-none opacity-50' : ''
                      }
                      onClick={(e) => {
                        e.preventDefault()
                        goToPage(page + 1)
                      }}
                    />
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationLink
                      href="#"
                      aria-label="Go to last page"
                      size="icon"
                      className={
                        page >= totalPages || pagerDisabled ? 'pointer-events-none opacity-50' : ''
                      }
                      onClick={(e) => {
                        e.preventDefault()
                        goToPage(totalPages)
                      }}
                    >
                      <ChevronsRight className="h-4 w-4" />
                    </PaginationLink>
                  </PaginationItem>
                </PaginationContent>
            </Pagination>
            <form
              onSubmit={handlePageJump}
              className="flex items-center gap-1.5 sm:justify-self-end"
            >
              <Label htmlFor="story-page-jump" className="sr-only">
                Go to page
              </Label>
              <Input
                id="story-page-jump"
                type="number"
                min={1}
                max={totalPages}
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                disabled={pagerDisabled}
                className="h-8 w-16 px-2 text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                aria-label="Page number"
              />
              <Button type="submit" size="sm" disabled={pagerDisabled}>
                Go
              </Button>
            </form>
          </div>
        ) : null}
      </Panel>
    </>
  )
}
