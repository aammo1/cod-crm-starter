"use client";

import { useId, useMemo, useRef, useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CityOption {
  id: number;
  name: string;
}

const MAX_RESULTS = 60;

/** Accent/case-insensitive key: "Fès" matches "fes", "Ksar El Kébir" matches "kebir". */
function searchKey(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Searchable city picker for the full Ozon list. Typing filters by accent-free
 * prefix first, then substring. `value` is the city id as a string ("" = none).
 */
export function CityCombobox({
  id,
  cities,
  value,
  onChange,
  disabled,
  placeholder = "Rechercher une ville…",
  noneLabel,
  className,
}: {
  id: string;
  cities: CityOption[];
  value: string;
  onChange: (cityId: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** When set, offers an explicit "no city" choice mapped to "". */
  noneLabel?: string;
  className?: string;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const indexed = useMemo(() => cities.map((city) => ({ ...city, key: searchKey(city.name) })), [cities]);
  const selected = cities.find((city) => String(city.id) === value) ?? null;

  const options = useMemo(() => {
    const q = searchKey(query);
    const matches = q
      ? [
          ...indexed.filter((city) => city.key.startsWith(q)),
          ...indexed.filter((city) => !city.key.startsWith(q) && city.key.includes(q)),
        ]
      : indexed;
    const list: Array<{ value: string; label: string }> = matches
      .slice(0, MAX_RESULTS)
      .map((city) => ({ value: String(city.id), label: city.name }));
    return noneLabel && !q ? [{ value: "", label: noneLabel }, ...list] : list;
  }, [indexed, query, noneLabel]);

  function choose(next: string) {
    onChange(next);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) setOpen(true);
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => Math.max(0, Math.min(options.length - 1, current + delta)));
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      const option = options[active];
      if (option) choose(option.value);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      setQuery("");
    }
  }

  const activeOption = open ? options[active] : undefined;

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeOption ? `${listId}-${active}` : undefined}
        autoComplete="off"
        disabled={disabled}
        value={open ? query : (selected?.name ?? (value === "" && noneLabel ? noneLabel : ""))}
        placeholder={open && selected ? selected.name : placeholder}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onClick={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setQuery("");
        }}
        onKeyDown={onKeyDown}
        className={cn(
          "h-9 w-full min-w-0 rounded-lg border px-2.5 pr-8 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
      />
      <ChevronDownIcon aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {options.length === 0 ? (
            <li className="px-2 py-2 text-sm text-muted-foreground">Aucune ville trouvée.</li>
          ) : (
            options.map((option, index) => (
              <li
                key={option.value || "none"}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={option.value === value}
                // mousedown keeps focus in the input so blur does not close before the click lands.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option.value)}
                onMouseEnter={() => setActive(index)}
                className={cn(
                  "cursor-pointer rounded-md px-2 py-2 text-sm",
                  index === active && "bg-accent text-accent-foreground",
                  option.value === value && "font-semibold",
                )}
              >
                {option.label}
              </li>
            ))
          )}
          {searchKey(query) && options.length === MAX_RESULTS ? (
            <li className="px-2 py-1 text-xs text-muted-foreground">Affinez la recherche pour voir plus de villes.</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
