// app/reset-password/page.tsx
"use client";

import { Suspense } from "react";
import ResetPasswordPageInner from "./ResetPasswordPageInner";

export default function Page() {
  return (
    <Suspense fallback={
      <div className="flex justify-center items-center min-h-screen bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
          <div className="text-center text-gray-900 font-medium">Loading...</div>
        </div>
      </div>
    }>
      <ResetPasswordPageInner />
    </Suspense>
  );
}


