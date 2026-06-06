'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

const SCROLL_DELTA = 8

export function useHeadroomHeader() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(true)
  const lastScrollY = useRef(0)

  useEffect(() => {
    setVisible(true)
    lastScrollY.current = window.scrollY
  }, [pathname])

  useEffect(() => {
    function onScroll() {
      const currentScrollY = window.scrollY

      if (currentScrollY <= SCROLL_DELTA) {
        setVisible(true)
      } else if (currentScrollY > lastScrollY.current + SCROLL_DELTA) {
        setVisible(false)
      } else if (currentScrollY < lastScrollY.current - SCROLL_DELTA) {
        setVisible(true)
      }

      lastScrollY.current = currentScrollY
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return visible
}
