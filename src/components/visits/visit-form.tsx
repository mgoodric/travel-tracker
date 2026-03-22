"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { AutocompleteInput } from "@/components/shared/autocomplete-input";
import { COUNTRIES } from "@/lib/countries";
import type { FamilyMember } from "@/lib/types/database";

interface VisitFormProps {
  visit?: {
    id: string;
    visit_date: string;
    city: string | null;
    state: string | null;
    country: string;
    notes: string | null;
    visit_members?: { family_member_id: string }[];
  };
  familyMembers: FamilyMember[];
  action: (formData: FormData) => Promise<void>;
}

export function VisitForm({ visit, familyMembers, action }: VisitFormProps) {
  const [country, setCountry] = useState(visit?.country || "");
  const [state, setState] = useState(visit?.state || "");
  const [city, setCity] = useState(visit?.city || "");
  const [unknownDate, setUnknownDate] = useState(!visit?.visit_date && !!visit?.id);
  const [selectedMembers, setSelectedMembers] = useState<string[]>(
    visit?.visit_members?.map(vm => vm.family_member_id) || []
  );

  function toggleMember(memberId: string) {
    setSelectedMembers(prev =>
      prev.includes(memberId)
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    );
  }

  const fetchStates = useCallback(async () => {
    if (!country) return [];
    const res = await fetch(`/api/locations/suggest?field=state&country=${encodeURIComponent(country)}`);
    return res.ok ? res.json() : [];
  }, [country]);

  const fetchCities = useCallback(async () => {
    const params = new URLSearchParams({ field: "city" });
    if (country) params.set("country", country);
    if (state) params.set("state", state);
    const res = await fetch(`/api/locations/suggest?${params}`);
    return res.ok ? res.json() : [];
  }, [country, state]);

  return (
    <Card>
      <CardContent className="pt-6">
        <form action={action} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="visit_date">Visit Date</Label>
            <div className="flex items-center gap-4">
              <Input
                id="visit_date"
                name="visit_date"
                type="date"
                defaultValue={visit?.visit_date || ""}
                required={!unknownDate}
                disabled={unknownDate}
                className={unknownDate ? "opacity-50" : ""}
              />
              <label className="flex items-center gap-2 text-sm text-muted-foreground whitespace-nowrap cursor-pointer">
                <input
                  type="checkbox"
                  name="unknown_date"
                  checked={unknownDate}
                  onChange={(e) => setUnknownDate(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                Date unknown
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="country">Country</Label>
            <AutocompleteInput
              id="country"
              name="country"
              value={country}
              onChange={setCountry}
              suggestions={COUNTRIES}
              required
              placeholder="e.g., United States"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="state">State / Region (optional)</Label>
              <AutocompleteInput
                id="state"
                name="state"
                value={state}
                onChange={setState}
                fetchSuggestions={fetchStates}
                placeholder="e.g., Texas"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">City (optional)</Label>
              <AutocompleteInput
                id="city"
                name="city"
                value={city}
                onChange={setCity}
                fetchSuggestions={fetchCities}
                placeholder="e.g., Austin"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Family Members</Label>
            <div className="space-y-2 rounded-md border p-4">
              {familyMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No family members added yet.</p>
              ) : (
                familyMembers.map((member) => (
                  <label key={member.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedMembers.includes(member.id)}
                      onChange={() => toggleMember(member.id)}
                      className="h-4 w-4"
                    />
                    <span className="text-sm">{member.name}</span>
                  </label>
                ))
              )}
            </div>
            <input type="hidden" name="members" value={JSON.stringify(selectedMembers)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              name="notes"
              defaultValue={visit?.notes || ""}
            />
          </div>

          <Button type="submit" className="w-full">
            {visit ? "Update Visit" : "Log Visit"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
