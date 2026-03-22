"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

const VisitMap = dynamic(
  () => import("./visit-map").then((mod) => ({ default: mod.VisitMap })),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[450px] w-full rounded-lg" />,
  }
);

export { VisitMap };
export type { VisitPin } from "./visit-map";
