"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { deleteFlight } from "@/actions/flights";

interface DeleteFlightButtonProps {
  flightId: string;
}

export function DeleteFlightButton({ flightId }: DeleteFlightButtonProps) {
  const router = useRouter();

  async function handleDelete() {
    await deleteFlight(flightId);
    router.push("/flights");
    router.refresh();
  }

  return (
    <ConfirmDialog
      title="Delete Flight"
      description="Are you sure you want to delete this flight? This action cannot be undone."
      onConfirm={handleDelete}
      trigger={<Button variant="destructive">Delete</Button>}
    />
  );
}
