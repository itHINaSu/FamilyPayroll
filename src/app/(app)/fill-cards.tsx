"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/**
 * On a phone, sizes the Dashboard's cards so four of them exactly share the
 * space between this container's top and the tab bar, by setting --card-h.
 * Measured rather than calculated in CSS, because what sits above it (the
 * installed app's status bar, the browser's own header, an alert line or
 * two) varies. Wider screens leave the cards at their natural height.
 */
export function FillCards({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const wide = window.matchMedia("(min-width: 768px)");

    const measure = () => {
      if (wide.matches) {
        el.style.removeProperty("--card-h");
        return;
      }
      const barTop =
        document.querySelector(".bottom-tab-bar")?.getBoundingClientRect().top ?? window.innerHeight;
      // Where the cards start with the page scrolled to the top.
      const top = el.getBoundingClientRect().top + window.scrollY;
      const gap = parseFloat(getComputedStyle(el).rowGap) || 0;
      const height = Math.floor((barTop - top - 8 - gap * 3) / 4);
      // A floor for very short screens: past it the page scrolls instead.
      el.style.setProperty("--card-h", `${Math.max(112, height)}px`);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    window.addEventListener("resize", measure);
    wide.addEventListener("change", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      wide.removeEventListener("change", measure);
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
