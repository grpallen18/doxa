import type { ReactNode, ElementType, ComponentPropsWithoutRef } from 'react'

type PanelVariant = 'base' | 'soft' | 'interactive'

type PanelProps<TAs extends ElementType = 'div'> = {
  as?: TAs
  variant?: PanelVariant
  className?: string
  children: ReactNode
} & Omit<ComponentPropsWithoutRef<TAs>, 'as' | 'children'>

const variantClassNames: Record<PanelVariant, string> = {
  base: 'panel-bevel',
  soft: 'panel-bevel-soft',
  interactive: 'panel-bevel panel-bevel-interactive',
}

export function Panel<TAs extends ElementType = 'div'>({
  as,
  variant = 'base',
  className,
  children,
  ...rest
}: PanelProps<TAs>) {
  const Component = (as || 'div') as ElementType
  const classes = `${variantClassNames[variant]} ${className ?? ''}`.trim()

  return (
    <Component className={classes} {...rest}>
      {children}
    </Component>
  )
}

