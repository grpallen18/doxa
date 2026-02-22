import Link from 'next/link'
import { LandingHeader } from '@/components/LandingHeader'
import { Separator } from '@/components/ui/separator'
import { stripMarkdownForPreview } from '@/lib/utils'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { searchTopics } from '@/lib/topic-search'

const PAGE_SIZE = 15

type SearchPageProps = {
  searchParams: Promise<{ q?: string; page?: string }>
}

function buildSearchPageHref(query: string, page: number): string {
  const base = `/search?q=${encodeURIComponent(query)}`
  return page <= 1 ? base : `${base}&page=${page}`
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q, page: pageParam } = await searchParams
  const query = (q ?? '').trim()
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1)

  const allResults = query ? await searchTopics(query, 100) : []
  const totalCount = allResults.length
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const from = (page - 1) * PAGE_SIZE
  const results = allResults.slice(from, from + PAGE_SIZE)
  const hasPagination = totalPages > 1

  return (
    <main className="min-h-screen px-4 pb-16 pt-6 text-foreground sm:px-6 md:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 md:gap-12">
        <LandingHeader />

        <section aria-labelledby="results-heading" className="space-y-4">
          <h2 id="results-heading" className="text-lg font-semibold tracking-tight text-foreground">
            {query ? `Results for "${query}"` : 'Search results'}
          </h2>
          {!query ? (
            <p className="text-sm text-muted">Enter a search term to find topics.</p>
          ) : results.length === 0 ? (
            <p className="text-sm text-muted">No topics found.</p>
          ) : (
            <>
              <ul className="rounded-md border border-subtle bg-surface">
                {results.map((topic, i) => (
                  <li key={topic.topic_id}>
                    {i > 0 && <Separator />}
                    <Link
                      href={`/page/${topic.topic_id}`}
                      className="block px-4 py-3 transition-colors hover:bg-muted/50"
                    >
                      <p className="font-medium text-foreground">{topic.title}</p>
                      {topic.summary && (
                        <p className="mt-1 line-clamp-2 text-sm text-muted">
                          {(() => {
                            const plain = stripMarkdownForPreview(topic.summary)
                            return plain.length > 150 ? `${plain.slice(0, 150)}…` : plain
                          })()}
                        </p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
              {hasPagination && (
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href={page > 1 ? buildSearchPageHref(query, page - 1) : '#'}
                        aria-disabled={page <= 1}
                        className={page <= 1 ? 'pointer-events-none opacity-50' : ''}
                      />
                    </PaginationItem>
                    {(() => {
                      const maxVisible = 5
                      let start: number, end: number
                      if (totalPages <= maxVisible) {
                        start = 1
                        end = totalPages
                      } else if (page <= 3) {
                        start = 1
                        end = maxVisible
                      } else if (page >= totalPages - 2) {
                        start = totalPages - maxVisible + 1
                        end = totalPages
                      } else {
                        start = page - 2
                        end = page + 2
                      }
                      const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i)
                      return (
                        <>
                          {start > 1 && (
                            <>
                              <PaginationItem>
                                <PaginationLink href={buildSearchPageHref(query, 1)}>
                                  1
                                </PaginationLink>
                              </PaginationItem>
                              {start > 2 && (
                                <PaginationItem>
                                  <PaginationEllipsis />
                                </PaginationItem>
                              )}
                            </>
                          )}
                          {pages.map((pageNum) => (
                            <PaginationItem key={pageNum}>
                              <PaginationLink
                                href={buildSearchPageHref(query, pageNum)}
                                isActive={pageNum === page}
                              >
                                {pageNum}
                              </PaginationLink>
                            </PaginationItem>
                          ))}
                          {end < totalPages && (
                            <>
                              {end < totalPages - 1 && (
                                <PaginationItem>
                                  <PaginationEllipsis />
                                </PaginationItem>
                              )}
                              <PaginationItem>
                                <PaginationLink href={buildSearchPageHref(query, totalPages)}>
                                  {totalPages}
                                </PaginationLink>
                              </PaginationItem>
                            </>
                          )}
                        </>
                      )
                    })()}
                    <PaginationItem>
                      <PaginationNext
                        href={page < totalPages ? buildSearchPageHref(query, page + 1) : '#'}
                        aria-disabled={page >= totalPages}
                        className={page >= totalPages ? 'pointer-events-none opacity-50' : ''}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
            </>
          )}
        </section>

        <footer className="flex flex-col gap-3 border-t border-subtle pt-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="hover:text-foreground">
            ← Home
          </Link>
        </footer>
      </div>
    </main>
  )
}
