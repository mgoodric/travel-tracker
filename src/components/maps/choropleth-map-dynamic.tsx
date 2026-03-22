"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

const ChoroplethMap = dynamic(
  () => import("./choropleth-map").then((mod) => ({ default: mod.ChoroplethMap })),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[350px] w-full rounded-lg" />,
  }
);

export { ChoroplethMap };
