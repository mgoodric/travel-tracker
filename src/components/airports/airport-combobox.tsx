"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAirportSearch } from "@/hooks/use-airport-search";
import type { Airport } from "@/lib/types/database";

interface AirportComboboxProps {
  value: Airport | null;
  onChange: (airport: Airport | null) => void;
  placeholder?: string;
}

function formatAirport(airport: Airport): string {
  const iata = airport.iata_code ? ` (${airport.iata_code})` : "";
  const city = airport.municipality ? `, ${airport.municipality}` : "";
  return `${airport.ident}${iata} - ${airport.name}${city}`;
}

export function AirportCombobox({ value, onChange, placeholder = "Select airport..." }: AirportComboboxProps) {
  const [open, setOpen] = useState(false);
  const { results, isLoading, setQuery } = useAirportSearch();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          />
        }
      >
        {value ? formatAirport(value) : placeholder}
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search airports..."
            onValueChange={setQuery}
          />
          <CommandList>
            {isLoading && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            )}
            {!isLoading && results.length === 0 && (
              <CommandEmpty>No airports found.</CommandEmpty>
            )}
            {!isLoading && results.length > 0 && (
              <CommandGroup>
                {results.map((airport) => (
                  <CommandItem
                    key={airport.id}
                    value={airport.ident}
                    onSelect={() => {
                      onChange(airport);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value?.id === airport.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {formatAirport(airport)}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
