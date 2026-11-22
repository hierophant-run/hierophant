import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary";

type BaseProps = {
  variant?: ButtonVariant;
  className?: string;
  children: ReactNode;
};

type NativeButtonProps = BaseProps &
  Omit<ComponentPropsWithoutRef<"button">, keyof BaseProps> & { href?: undefined };

type LinkButtonProps = BaseProps &
  Omit<ComponentPropsWithoutRef<typeof Link>, keyof BaseProps | "href"> & { href: string };

export type ButtonProps = NativeButtonProps | LinkButtonProps;

const baseClasses =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[3px] border px-5 text-sm font-medium whitespace-nowrap transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border-accent bg-accent text-on-accent hover:border-dot hover:bg-dot disabled:hover:border-accent disabled:hover:bg-accent",
  secondary:
    "border-line bg-transparent text-text hover:border-muted hover:bg-surface disabled:hover:border-line disabled:hover:bg-transparent",
};

export function Button(props: ButtonProps) {
  if (props.href !== undefined) {
    const { variant = "primary", className, children, href, ...rest } = props;
    return (
      <Link href={href} className={cn(baseClasses, variantClasses[variant], className)} {...rest}>
        {children}
      </Link>
    );
  }

  const { variant = "primary", className, children, type = "button", ...rest } = props;
  return (
    <button type={type} className={cn(baseClasses, variantClasses[variant], className)} {...rest}>
      {children}
    </button>
  );
}
