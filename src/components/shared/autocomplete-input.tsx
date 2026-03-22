"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface AutocompleteInputProps {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  suggestions?: string[];
  fetchSuggestions?: (query: string) => Promise<string[]>;
}

export function AutocompleteInput({
  id,
  name,
  value,
  onChange,
  placeholder,
  required,
  suggestions: staticSuggestions,
  fetchSuggestions,
}: AutocompleteInputProps) {
  const [open, setOpen] = useState(false);
  const [filtered, setFiltered] = useState<string[]>([]);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Filter suggestions based on input
  const updateSuggestions = useCallback(
    async (input: string) => {
      if (!input) {
        setFiltered([]);
        return;
      }

      if (staticSuggestions) {
        const lower = input.toLowerCase();
        const matches = staticSuggestions.filter((s) =>
          s.toLowerCase().includes(lower)
        );
        setFiltered(matches.slice(0, 8));
      } else if (fetchSuggestions) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
          const results = await fetchSuggestions(input);
          const lower = input.toLowerCase();
          const matches = results.filter((s) =>
            s.toLowerCase().includes(lower)
          );
          setFiltered(matches.slice(0, 8));
        }, 150);
      }
    },
    [staticSuggestions, fetchSuggestions]
  );

  useEffect(() => {
    updateSuggestions(value);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, updateSuggestions]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || filtered.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && highlightIndex >= 0) {
      e.preventDefault();
      onChange(filtered[highlightIndex]);
      setOpen(false);
      setHighlightIndex(-1);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        id={id}
        name={name}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlightIndex(-1);
        }}
        onFocus={() => {
          if (filtered.length > 0) setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md">
          {filtered.map((item, i) => (
            <li
              key={item}
              className={cn(
                "cursor-pointer rounded-sm px-2 py-1.5 text-sm",
                i === highlightIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent hover:text-accent-foreground"
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(item);
                setOpen(false);
              }}
              onMouseEnter={() => setHighlightIndex(i)}
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
