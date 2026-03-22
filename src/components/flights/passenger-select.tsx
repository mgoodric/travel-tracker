"use client";

import type { FamilyMember } from "@/lib/types/database";

interface PassengerSelectProps {
  familyMembers: FamilyMember[];
  value: { family_member_id: string; role: string }[];
  onChange: (value: { family_member_id: string; role: string }[]) => void;
}

export function PassengerSelect({ familyMembers, value, onChange }: PassengerSelectProps) {
  function toggleMember(memberId: string) {
    const existing = value.find(p => p.family_member_id === memberId);
    if (existing) {
      onChange(value.filter(p => p.family_member_id !== memberId));
    } else {
      onChange([...value, { family_member_id: memberId, role: "passenger" }]);
    }
  }

  function updateRole(memberId: string, role: string) {
    onChange(value.map(p => p.family_member_id === memberId ? { ...p, role } : p));
  }

  return (
    <div className="space-y-2 rounded-md border p-4">
      {familyMembers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No family members added yet.</p>
      ) : (
        familyMembers.map((member) => {
          const selected = value.find(p => p.family_member_id === member.id);
          return (
            <div key={member.id} className="flex items-center gap-4">
              <label className="flex flex-1 items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!selected}
                  onChange={() => toggleMember(member.id)}
                  className="h-4 w-4"
                />
                <span className="text-sm">{member.name}</span>
              </label>
              {selected && (
                <select
                  value={selected.role}
                  onChange={(e) => updateRole(member.id, e.target.value)}
                  className="h-8 w-36 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="passenger">Passenger</option>
                  <option value="pilot">Pilot</option>
                  <option value="copilot">Co-Pilot</option>
                </select>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
