"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

const FlightMap = dynamic(
  () => import("./flight-map").then((mod) => ({ default: mod.FlightMap })),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[400px] w-full rounded-lg" />,
  }
);

export { FlightMap };
