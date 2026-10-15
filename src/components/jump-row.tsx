"use client";

import { useEffect, useLayoutEffect } from "react";

import { jumpTargetId } from "./jump-target";

type Kid = { id: string; name: string; photoBlobId: string | null };

/**
 * A row of the children's faces under the title band. A tap scrolls that
 * child's card to just below the (sticky) band, so with four kids nobody is
 * more than one tap away. Cards opt in with id={jumpTargetId(id)} and the
 * `jump-target` class, whose scroll margin is the band's height.
 */
export function JumpRow({ kids }: { kids: Kid[] }) {
  // Keep --band-h equal to the pinned band so scroll-margin clears it — set
  // in a layout effect so it's in place before Next.js scrolls to a #hash.
  useLayoutEffect(() => {
    const band = document.querySelector<HTMLElement>(".page-band");
    if (!band) return;
    const set = () =>
      document.documentElement.style.setProperty("--band-h", `${band.offsetHeight}px`);
    set();
    const observer = new ResizeObserver(set);
    observer.observe(band);
    return () => observer.disconnect();
  }, []);

  // Arriving from the Dashboard with #child-…: land on that card.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) requestAnimationFrame(() => jump(id, "instant"));
  }, []);

  if (kids.length < 2) return null;

  // A light strip under the green band rather than part of it: it reads as
  // navigation within the page, not as the page's title.
  return (
    <nav
      aria-label="Jump to a child"
      className="flex h-14 items-center justify-center gap-1 overflow-x-auto border-b border-ink-200 bg-white/95 px-2
        backdrop-blur dark:border-ink-700 dark:bg-ink-800/95 md:mt-2 md:rounded-xl md:border"
    >
      {kids.map((k) => (
        <button
          key={k.id}
          type="button"
          onClick={() => {
            history.replaceState(null, "", `#${jumpTargetId(k.id)}`);
            jump(jumpTargetId(k.id), "smooth");
          }}
          className="flex w-16 shrink-0 flex-col items-center gap-0.5 rounded-lg py-0.5 text-ink-600 transition
            active:bg-ink-100 dark:text-ink-300 dark:active:bg-ink-700"
        >
          {k.photoBlobId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/blobs/${k.photoBlobId}`} alt="" className="h-7 w-7 rounded-full object-cover" />
          ) : (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ledger-100 text-xs font-semibold text-ledger-600 dark:bg-ink-700 dark:text-ink-100">
              {k.name.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="max-w-full truncate text-[11px] leading-tight">{k.name.split(" ")[0]}</span>
        </button>
      ))}
    </nav>
  );
}

function jump(id: string, behavior: ScrollBehavior) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior, block: "start" });
  el.classList.remove("jump-flash");
  void el.offsetWidth; // restart the animation on a repeat tap
  el.classList.add("jump-flash");
}
