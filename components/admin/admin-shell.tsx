import { cn } from '@/lib/utils'

type AdminShellProps = {
  children: React.ReactNode
  className?: string
  maxWidth?: 'default' | 'wide' | 'content'
}

const maxWidthClasses = {
  default: 'max-w-5xl',
  wide: 'max-w-7xl',
  content: 'max-w-content',
} as const

export function AdminShell({ children, className, maxWidth = 'default' }: AdminShellProps) {
  return (
    <div
      className={cn(
        'mx-auto flex w-full flex-col gap-4 px-4 pb-12 pt-4 sm:px-6 md:px-8 lg:px-10',
        maxWidthClasses[maxWidth],
        className
      )}
    >
      {children}
    </div>
  )
}
