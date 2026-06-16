"use client";

import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Unable to load this page</h1>
        <p className="mt-2 text-muted-foreground">
          Something went wrong while loading your data. Please try again.
        </p>
        {error.digest && (
          <p className="mt-2 text-xs text-muted-foreground">
            Reference: {error.digest}
          </p>
        )}
        <Button className="mt-5" onClick={() => reset()}>
          Try again
        </Button>
      </div>
    </div>
  );
}
