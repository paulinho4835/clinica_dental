import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-36" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <Skeleton className="mb-4 h-5 w-48" />
          <div className="space-y-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}
