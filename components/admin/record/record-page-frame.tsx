import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export const recordPagePaddingClass = 'px-4 sm:px-6 md:px-8 lg:px-10'

export function RecordPageFrame({ children }: { children: ReactNode }) {
  return <div className={cn('w-full', recordPagePaddingClass)}>{children}</div>
}

export function RecordPageBody({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4 pt-4">{children}</div>
}

export function RecordPageLoading({ message = 'Loading…' }: { message?: string }) {
  return (
    <p className={cn(recordPagePaddingClass, 'py-4 text-sm text-muted')}>{message}</p>
  )
}

export function RecordPageError({ message }: { message: string }) {
  return (
    <p className={cn(recordPagePaddingClass, 'py-4 text-sm text-destructive')}>{message}</p>
  )
}
