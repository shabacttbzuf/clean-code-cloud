import type { HTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type DivProps = HTMLAttributes<HTMLDivElement>;

export function AppIcon({
  icon: Icon,
  className,
  decorative = true,
  ...props
}: {
  icon: LucideIcon;
  className?: string;
  decorative?: boolean;
} & Omit<React.SVGProps<SVGSVGElement>, "ref">) {
  return (
    <Icon
      aria-hidden={decorative ? true : undefined}
      focusable={decorative ? false : undefined}
      className={cn("size-4 shrink-0", className)}
      {...props}
    />
  );
}

export function PageSection({ className, ...props }: DivProps) {
  return <section className={cn("min-w-0 space-y-5", className)} {...props} />;
}

export function SectionHeading({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0 space-y-1">
        <h2 className="text-base font-semibold leading-7 text-foreground sm:text-lg">{title}</h2>
        {description ? (
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Surface({ className, ...props }: DivProps) {
  return (
    <div
      data-design-surface
      className={cn("min-w-0 rounded-[var(--radius-card)] border bg-card text-card-foreground shadow-[var(--shadow-card)]", className)}
      {...props}
    />
  );
}

export function ResponsiveTableContainer({ className, ...props }: DivProps) {
  return (
    <div
      data-design-table-container
      className={cn("w-full min-w-0 overflow-x-auto rounded-[var(--radius-card)] border bg-card", className)}
      {...props}
    />
  );
}
