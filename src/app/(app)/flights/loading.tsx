import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function FlightsLoading() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-24" />
          <Skeleton className="mt-2 h-4 w-32" />
        </div>
        <Skeleton className="h-10 w-28" />
      </div>

      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <Skeleton className="h-7 w-14" />
                  <Skeleton className="mt-1 h-3 w-20" />
                </div>
                <Skeleton className="h-4 w-4" />
                <div className="text-center">
                  <Skeleton className="h-7 w-14" />
                  <Skeleton className="mt-1 h-3 w-20" />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="mt-1 h-3 w-16" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
