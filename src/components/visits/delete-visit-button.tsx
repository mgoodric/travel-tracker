"use client";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { deleteVisit } from "@/actions/visits";

interface DeleteVisitButtonProps {
  visitId: string;
}

export function DeleteVisitButton({ visitId }: DeleteVisitButtonProps) {
  return (
    <ConfirmDialog
      title="Delete Visit"
      description="Are you sure you want to delete this visit? This action cannot be undone."
      onConfirm={() => deleteVisit(visitId)}
      trigger={<Button variant="destructive">Delete</Button>}
    />
  );
}
