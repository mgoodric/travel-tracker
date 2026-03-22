"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createFamilyMember, updateFamilyMember } from "@/actions/family";
import type { FamilyMember } from "@/lib/types/database";

const RELATIONSHIPS = ["Self", "Spouse", "Child", "Parent", "Sibling", "Other"];

interface MemberFormDialogProps {
  member?: FamilyMember;
  trigger?: React.ReactNode;
}

export function MemberFormDialog({ member, trigger }: MemberFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [relationship, setRelationship] = useState(member?.relationship || "Self");
  const router = useRouter();

  async function handleSubmit(formData: FormData) {
    formData.set("relationship", relationship);
    if (member) {
      await updateFamilyMember(member.id, formData);
    } else {
      await createFamilyMember(formData);
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <span onClick={() => setOpen(true)}>
        {trigger || <Button>Add Member</Button>}
      </span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{member ? "Edit Member" : "Add Family Member"}</DialogTitle>
          </DialogHeader>
          <form action={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                defaultValue={member?.name}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="relationship">Relationship</Label>
              <select
                name="relationship"
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                className="flex h-8 w-full items-center rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {RELATIONSHIPS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <Button type="submit" className="w-full">
              {member ? "Update" : "Add Member"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
