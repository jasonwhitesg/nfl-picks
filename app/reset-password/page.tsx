// app/reset-password/page.tsx
"use client";

import { Suspense } from "react";
import ResetPasswordPageInner from "./ResetPasswordPageInner";

export default function Page() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-ink text-white">Loading...</div>}>
      <ResetPasswordPageInner />
    </Suspense>
  );
}
