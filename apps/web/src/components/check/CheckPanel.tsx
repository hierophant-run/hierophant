"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ScanForm } from "@/components/landing/ScanForm";
import { cn } from "@/lib/cn";
import { CHECK_TABS, checkTabHash, tabFromHash, type CheckTabId } from "@/lib/check-tabs";
import { CheckForm } from "./CheckForm";
import { WatchForm } from "./WatchForm";
import { goToCheckForm } from "./focus";

function subscribeToHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

const closeMobileMenu = () =>
  document.querySelector("header details[open]")?.removeAttribute("open");

function replaceHash(id: CheckTabId) {
  const { pathname, search } = window.location;
  window.history.replaceState(null, "", `${pathname}${search}${checkTabHash(id)}`);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export function CheckPanel({ className }: { className?: string }) {
  const hash = useSyncExternalStore(
    subscribeToHash,
    () => window.location.hash,
    () => "",
  );
  const [isScanning, setIsScanning] = useState(false);
  // A running scan owns the panel, so its progress and errors stay on screen.
  const active = isScanning ? "repo" : (tabFromHash(hash) ?? "repo");
  const isTabClick = useRef(false);
  const isScanningRef = useRef(false);

  useEffect(() => {
    const requested = tabFromHash(hash);
    if (!requested) return;
    closeMobileMenu();
    if (isScanningRef.current && requested !== "repo") {
      isTabClick.current = true;
      replaceHash("repo");
      return;
    }
    if (isTabClick.current) {
      isTabClick.current = false;
      return;
    }
    goToCheckForm();
  }, [hash]);

  // Clicking the menu item for the open tab does not change the hash, so handle it here.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.<HTMLAnchorElement>(
        'a[href*="#check-"]',
      );
      if (!link) return;
      const url = new URL(link.href);
      if (url.pathname !== window.location.pathname || url.hash !== window.location.hash) return;
      closeMobileMenu();
      goToCheckForm();
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  const select = (id: CheckTabId) => {
    isTabClick.current = true;
    replaceHash(id);
  };

  const onScanBusy = (busy: boolean) => {
    isScanningRef.current = busy;
    setIsScanning(busy);
  };

  return (
    <div className={cn("w-full", className)}>
      <div
        role="group"
        aria-label="What to check"
        className="grid grid-cols-3 gap-1 sm:flex sm:gap-1.5"
      >
        {CHECK_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={tab.id === active}
            disabled={isScanning && tab.id !== "repo"}
            onClick={() => select(tab.id)}
            className={cn(
              "min-h-10 min-w-0 rounded-[3px] border px-0.5 text-xs font-medium transition-colors sm:min-h-9 sm:px-3 sm:text-sm",
              tab.id === active
                ? "border-accent bg-accent text-on-accent"
                : "border-line bg-bg/60 text-muted hover:border-muted hover:text-text disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line disabled:hover:text-muted",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="mt-2.5 min-h-40 sm:min-h-24">
        {active === "repo" ? (
          <ScanForm onBusyChange={onScanBusy} />
        ) : active === "watch" ? (
          <WatchForm />
        ) : (
          <CheckForm key={active} type={active} />
        )}
      </div>
    </div>
  );
}
