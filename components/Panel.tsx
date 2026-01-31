import { forwardRef, type ReactNode, type ElementType, type ComponentPropsWithoutRef } from 'react'

type PanelVariant = 'base' | 'soft' | 'interactive'

type PanelProps<TAs extends ElementType = 'div'> = {
  as?: TAs
  variant?: PanelVariant
  /** When true (default), soft panels get hover styling (surface-soft). Set false for static soft panels. */
  interactive?: boolean
  className?: string
  children: ReactNode
} & Omit<ComponentPropsWithoutRef<TAs>, 'as' | 'children'>

const variantClassNames: Record<PanelVariant, string> = {
  base: 'panel-bevel',
  soft: 'panel-bevel-soft',
  interactive: 'panel-bevel panel-bevel-interactive',
}

export const Panel = forwardRef(function Panel<TAs extends ElementType = 'div'>(
  {
    as,
    variant = 'base',
    interactive = true,
    className,
    children,
    ...rest
  }: PanelProps<TAs>,
  ref: React.Ref<HTMLDivElement>
) {
  const Component = (as || 'div') as ElementType
  const baseClasses = variantClassNames[variant]
  const interactiveClass =
    variant === 'soft' && interactive ? ' panel-bevel-interactive' : ''
  const classes = `${baseClasses}${interactiveClass} ${className ?? ''}`.trim()

  return (
    <Component ref={ref} className={classes} {...rest}>
      {children}
    </Component>
  )
}) as <TAs extends ElementType = 'div'>(props: PanelProps<TAs> & { ref?: React.Ref<HTMLDivElement> }) => React.ReactElement

