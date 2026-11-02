import type { KeyboardEvent } from "react";

const horizontalDeltas: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };
const allDeltas: Record<string, number> = { ...horizontalDeltas, ArrowDown: 1, ArrowUp: -1 };

/** Tab stop for a roving-tabindex group: the selected item, or the first item if none is. */
export const rovingTabIndex = (selected: boolean, index: number, anySelected: boolean): 0 | -1 =>
  selected || (!anySelected && index === 0) ? 0 : -1;

/**
 * Arrow/Home/End handling for a single-select group using roving tabindex.
 * Moves focus to the next enabled item matching `itemSelector` and reports it via `onSelect`.
 */
export const handleRovingKeyDown = (
  event: KeyboardEvent<HTMLElement>,
  itemSelector: string,
  onSelect: (item: HTMLElement) => void,
  options: { vertical?: boolean } = {}
): void => {
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(itemSelector)).filter(
    (item) => !(item instanceof HTMLButtonElement && item.disabled)
  );
  if (items.length === 0) {
    return;
  }

  const deltas = options.vertical === false ? horizontalDeltas : allDeltas;
  const currentIndex = items.findIndex((item) => item === event.target);
  let nextIndex: number;
  if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = items.length - 1;
  } else {
    const delta = deltas[event.key];
    if (delta === undefined) {
      return;
    }
    nextIndex = (Math.max(0, currentIndex) + delta + items.length) % items.length;
  }

  event.preventDefault();
  const next = items[nextIndex];
  if (next) {
    next.focus();
    onSelect(next);
  }
};
