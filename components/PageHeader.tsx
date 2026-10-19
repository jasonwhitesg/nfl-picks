import type { ReactNode } from "react";

// Steel-blue page header. Content below it can tuck up with "-mt-10".
export default function PageHeader({
  title,
  subtitle,
  icon,
  right,
}: {
  title: string;
  subtitle?: ReactNode;
  icon?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="bg-ink text-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 pb-14 pt-5">
        <div className="flex min-w-0 items-center gap-3">
          {icon && (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-2xl">{icon}</div>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-extrabold leading-tight tracking-tight">{title}</h1>
            {subtitle && <p className="truncate text-sm text-sky-100/80">{subtitle}</p>}
          </div>
        </div>
        {right}
      </div>
    </header>
  );
}
