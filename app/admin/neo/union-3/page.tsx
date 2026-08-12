import { redirect } from 'next/navigation'

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function focusFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>
): string | null {
  const raw = searchParams.focus
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  if (Array.isArray(raw) && typeof raw[0] === 'string' && raw[0].trim()) {
    return raw[0].trim()
  }
  return null
}

/** Legacy Union 3.0 URL — Neo baseline is /admin/neo/union. */
export default async function AdminNeoUnionV3RedirectPage({
  searchParams,
}: PageProps) {
  const focus = focusFromSearchParams(await searchParams)
  redirect(
    focus
      ? `/admin/neo/union?focus=${encodeURIComponent(focus)}`
      : '/admin/neo/union'
  )
}
