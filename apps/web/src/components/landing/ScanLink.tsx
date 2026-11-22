"use client";

import type { MouseEvent, ReactNode } from "react";
import { goToCheckForm } from "@/components/check/focus";
import { Button } from "@/components/ui/Button";
import { siteHref } from "@/lib/site";

function goToForm(event: MouseEvent<HTMLAnchorElement>) {
  // Other pages have no form, so the link navigates to the home page normally.
  if (goToCheckForm()) event.preventDefault();
}

export function ScanLink({
  children,
  className,
  plain = false,
}: {
  children: ReactNode;
  className?: string;
  plain?: boolean;
}) {
  const href = siteHref("/#check-repo");
  if (plain) {
    return (
      <a href={href} onClick={goToForm} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Button href={href} onClick={goToForm} {...(className ? { className } : {})}>
      {children}
    </Button>
  );
}
