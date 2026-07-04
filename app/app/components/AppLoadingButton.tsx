"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";

type AppLoadingButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  loadingText?: string;
  overlayText?: string;
  showOverlayOnClick?: boolean;
  children: ReactNode;
};

export function AppLoadingButton({
  loading = false,
  loadingText = "Working...",
  overlayText,
  showOverlayOnClick: _showOverlayOnClick,
  disabled,
  children,
  className = "",
  ...props
}: AppLoadingButtonProps) {
  const { pending } = useFormStatus();
  const isLoading = loading || pending;

  return (
    <>
      {isLoading && overlayText ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="rounded-2xl border border-sky-700/60 bg-zinc-950 px-6 py-5 text-center shadow-2xl shadow-sky-950/40">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-current border-t-transparent text-yellow-400" />
            <div className="mt-3 text-base font-semibold text-zinc-100">
              {overlayText || loadingText}
            </div>
            <div className="mt-1 text-sm text-zinc-400">Please wait...</div>
          </div>
        </div>
      ) : null}

      <button
        {...props}
        disabled={disabled || isLoading}
        aria-busy={isLoading}
        className={className}
      >
        <span className="inline-flex items-center justify-center gap-2">
          {isLoading && (
            <span
              aria-hidden="true"
              className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            />
          )}
          <span>{isLoading ? loadingText : children}</span>
        </span>
      </button>
    </>
  );
}
