'use client'

import Link from 'next/link'
import { useRef, useCallback, useEffect } from 'react'
import type {
  ReactNode,
  ButtonHTMLAttributes,
  AnchorHTMLAttributes,
} from 'react'
import { INTERACTIVE_ANIMATION_MS } from '@/lib/constants'

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

  const activeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const userOnMouseDown = (rest as any).onMouseDown

  useEffect(
    () => () => {
      if (activeTimeoutRef.current) {
        clearTimeout(activeTimeoutRef.current)
      }
    },
    []
  )

  const handlePrimaryMouseDown = useCallback(
    (e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => {
      const el = e.currentTarget
      if (activeTimeoutRef.current) {
        clearTimeout(activeTimeoutRef.current)
        activeTimeoutRef.current = null
      }
      el.classList.add('btn-primary-active')
      activeTimeoutRef.current = setTimeout(() => {
        el.classList.remove('btn-primary-active')
        activeTimeoutRef.current = null
      }, INTERACTIVE_ANIMATION_MS)
      userOnMouseDown?.(e)
    },
    [userOnMouseDown]
  )

  const classes = [
    variantClassNames[variant],
    sizeClassNames[size],
    fullWidth ? 'w-full justify-center' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  const primaryHandlers =
    variant === 'primary'
      ? { onMouseDown: handlePrimaryMouseDown }
      : {}

  if ('href' in props && props.href) {
    return (
      <Link
        href={props.href}
        className={classes}
        {...(rest as any)}
        {...primaryHandlers}
      >
        {children}
      </Link>
    )
  }

  return (
    <button className={classes} {...(rest as any)} {...primaryHandlers}>
      {children}
    </button>
  )
}

