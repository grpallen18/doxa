'use client'

import { useLayoutEffect, useRef, type ReactNode } from 'react'

const DEFAULT_DURATION_MS = 3000
const LETTER_FADE_MS = 200

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function collectTextNodes(root: HTMLElement): Text[] {
  const nodes: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement
      if (parent?.closest('[data-no-reveal]')) return NodeFilter.FILTER_REJECT
      if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })
  let current = walker.nextNode()
  while (current) {
    nodes.push(current as Text)
    current = walker.nextNode()
  }
  return nodes
}

function wrapTextNode(
  textNode: Text,
  startCharIndex: number,
  totalChars: number,
  durationMs: number
) {
  const text = textNode.textContent ?? ''
  const fragment = document.createDocumentFragment()

  for (let i = 0; i < text.length; i++) {
    const charIndex = startCharIndex + i
    const span = document.createElement('span')
    span.style.display = 'inline-block'
    span.style.opacity = '0'
    span.style.animation = `step-detail-letter-fade-in ${LETTER_FADE_MS}ms ease forwards`
    span.style.animationDelay = `${totalChars <= 1 ? 0 : (charIndex / totalChars) * durationMs}ms`
    span.textContent = text[i] === ' ' ? '\u00A0' : text[i]
    fragment.appendChild(span)
  }

  textNode.parentNode?.replaceChild(fragment, textNode)
}

export function StepDetailReveal({
  active,
  durationMs = DEFAULT_DURATION_MS,
  children,
}: {
  active: boolean
  durationMs?: number
  children: ReactNode
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const animatedRef = useRef(false)

  useLayoutEffect(() => {
    if (!active || animatedRef.current || prefersReducedMotion()) return
    const root = rootRef.current
    if (!root) return

    const textNodes = collectTextNodes(root)
    const totalChars = textNodes.reduce((sum, node) => sum + (node.textContent?.length ?? 0), 0)
    if (totalChars === 0) return

    animatedRef.current = true
    let charIndex = 0
    for (const textNode of textNodes) {
      const len = textNode.textContent?.length ?? 0
      wrapTextNode(textNode, charIndex, totalChars, durationMs)
      charIndex += len
    }
  }, [active, durationMs, children])

  if (!active) {
    return <>{children}</>
  }

  return (
    <div ref={rootRef} className="step-detail-reveal" aria-live="off">
      {children}
    </div>
  )
}

export { DEFAULT_DURATION_MS as STEP_DETAIL_REVEAL_DURATION_MS }
