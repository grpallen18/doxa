import Link from 'next/link'
import type {
  ReactNode,
  ButtonHTMLAttributes,
  AnchorHTMLAttributes,
} from 'react'

type ButtonVariant = 'primary' | 'secondary'
type ButtonSize = 'md' | 'lg'

type BaseProps = {
  children: ReactNode
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  className?: string
}

type ButtonAsButton = BaseProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & {
    href?: undefined
  }

type ButtonAsLink = BaseProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'href'> & {
    href: string
  }

export type ButtonProps = ButtonAsButton | ButtonAsLink

const variantClassNames: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
}

const sizeClassNames: Record<ButtonSize, string> = {
  md: 'text-sm',
  lg: 'text-base px-6 py-3',
}

export function Button(props: ButtonProps) {
  const {
    children,
    variant = 'primary',
    size = 'md',
    fullWidth,
    className,
    ...rest
  } = props as ButtonProps

  const classes = [
    variantClassNames[variant],
    sizeClassNames[size],
    fullWidth ? 'w-full justify-center' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  if ('href' in props && props.href) {
    return (
      <Link href={props.href} className={classes} {...(rest as any)}>
        {children}
      </Link>
    )
  }

  return (
    <button className={classes} {...(rest as any)}>
      {children}
    </button>
  )
}

