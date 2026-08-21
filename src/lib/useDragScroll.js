import { useCallback, useRef } from 'react'

/**
 * Makes a horizontally-scrolling container draggable with a mouse, the way it already is with a
 * finger on a phone -- on desktop the only way to move these sliders was the scrollbar.
 *
 * Returns a ref to spread onto the scrolling element. Touch is deliberately untouched: native
 * touch scrolling already works and is smoother (momentum, rubber-banding) than anything
 * reimplemented here, so this only binds mouse events.
 */
export function useDragScroll() {
  const ref = useRef(null)
  const state = useRef({ down: false, dragging: false, startX: 0, startScroll: 0 })

  const onMouseDown = useCallback((event) => {
    // Left button only -- middle-click is paste-and-go on Linux, right is the context menu.
    if (event.button !== 0) return
    const el = ref.current
    if (!el) return
    state.current = { down: true, dragging: false, startX: event.pageX, startScroll: el.scrollLeft }
  }, [])

  const onMouseMove = useCallback((event) => {
    const el = ref.current
    if (!el || !state.current.down) return
    const delta = event.pageX - state.current.startX
    // A few px of slop before this counts as a drag, so a slightly shaky click still lands on the
    // poster underneath instead of being swallowed as a tiny scroll.
    if (!state.current.dragging && Math.abs(delta) < 5) return
    state.current.dragging = true
    // Otherwise the browser starts a native text/image drag mid-scroll.
    event.preventDefault()
    el.scrollLeft = state.current.startScroll - delta
  }, [])

  const endDrag = useCallback(() => {
    state.current.down = false
    // Cleared on the next frame, not now: the click event fires after mouseup, and the capture
    // handler below reads this flag to decide whether to swallow it.
    requestAnimationFrame(() => {
      state.current.dragging = false
    })
  }, [])

  // Capture phase so a drag that ends over a poster doesn't also "click" it.
  const onClickCapture = useCallback((event) => {
    if (!state.current.dragging) return
    event.preventDefault()
    event.stopPropagation()
  }, [])

  return {
    ref,
    handlers: {
      onMouseDown,
      onMouseMove,
      onMouseUp: endDrag,
      onMouseLeave: endDrag,
      onClickCapture,
    },
  }
}
