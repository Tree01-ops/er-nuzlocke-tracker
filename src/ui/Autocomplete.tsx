import { useMemo, useState } from "react";
import { matchesQuery } from "./common.tsx";

export type Option = { key: string; label: string; hint?: string };

/**
 * Text box with a dropdown of matching options. ↑↓ move, Enter picks, Esc closes.
 * Names that start with the query are listed before other matches.
 */
export function Autocomplete({
  options,
  value,
  onChange,
  onPick,
  placeholder,
  max = 8,
  autoFocus,
  onCommit,
}: {
  options: Option[];
  value: string;
  onChange: (text: string) => void;
  onPick: (option: Option) => void;
  placeholder?: string;
  max?: number;
  autoFocus?: boolean;
  /** Called with the typed text on blur, or on Enter when nothing matches (free-text entry). */
  onCommit?: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [];
    const hits = options.filter((o) => matchesQuery(o.label, q));
    const starts = hits.filter((o) => o.label.toLowerCase().startsWith(q));
    const rest = hits.filter((o) => !o.label.toLowerCase().startsWith(q));
    return [...starts, ...rest].slice(0, max);
  }, [options, value, max]);

  const pick = (o: Option) => {
    onPick(o);
    setOpen(false);
  };

  return (
    <div className="autocomplete">
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setCursor(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          onCommit?.(value);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
            const step = e.key === "ArrowDown" ? 1 : -1;
            setCursor((c) => Math.max(0, Math.min(matches.length - 1, c + step)));
          } else if (e.key === "Enter" && open && matches[cursor]) {
            e.preventDefault();
            pick(matches[cursor]);
          } else if (e.key === "Enter" && onCommit) {
            e.preventDefault();
            onCommit(value);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-autocomplete="list"
      />
      {open && matches.length > 0 && (
        <ul className="ac-menu" role="listbox">
          {matches.map((o, i) => (
            <li
              key={o.key}
              role="option"
              aria-selected={i === cursor}
              className={i === cursor ? "active" : ""}
              // mousedown so the pick happens before the input's blur closes the menu
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              onMouseEnter={() => setCursor(i)}
            >
              <span>{o.label}</span>
              {o.hint && <span className="muted">{o.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
