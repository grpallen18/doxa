import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Strips markdown syntax for plain-text previews (e.g. topic cards, search results).
 * Removes headers (# ## ###), bold (**), italic (*), links [text](url) -> text.
 */
export function stripMarkdownForPreview(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '') // # ## ### headers
    .replace(/\*\*(.+?)\*\*/g, '$1') // **bold**
    .replace(/\*(.+?)\*/g, '$1') // *italic*
    .replace(/_(.+?)_/g, '$1') // _italic_
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](url) -> text
    .replace(/\n+/g, ' ') // collapse newlines to space
    .trim()
}
