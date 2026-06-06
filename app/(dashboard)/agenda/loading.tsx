import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-14 w-full" />
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 w-10" />
        <Skeleton className="h-9 w-14" />
        <Skeleton className="h-9 w-10" />
        <Skeleton className="ml-2 h-6 w-32" />
      </div>
      <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 42 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
