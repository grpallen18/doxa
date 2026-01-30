import { Button } from '@/components/Button'

export function SearchBar() {
  return (
    <section aria-label="Search" className="w-full">
      <form action="/search" method="get" className="w-full">
        <label htmlFor="search-input" className="sr-only">
          Search for a headline or topic to research
        </label>
        <div className="flex w-full flex-col gap-3 sm:flex-row">
          <input
            id="search-input"
            type="search"
            name="q"
            placeholder="Search for a headline or topic to research"
            className="min-h-[48px] flex-1 rounded-bevel border border-subtle bg-surface px-4 py-3 text-base text-foreground shadow-inset-soft placeholder:text-muted-soft outline-none transition-shadow focus:shadow-inset-strong"
          />
          <Button type="submit" variant="primary" className="min-h-[48px] shrink-0 px-6">
            Search
          </Button>
        </div>
      </form>
    </section>
  )
}
