"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type AppLoadingButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  loadingText?: string;
  children: ReactNode;
};

export function AppLoadingButton({
  loading = false,
  loadingText = "Working...",
  disabled,
  children,
  className = "",
  ...props
}: AppLoadingButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading}
      className={className}
    >
      <span className="inline-flex items-center justify-center gap-2">
        {loading && (
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
        )}
        <span>{loading ? loadingText : children}</span>
      </span>
    </button>
  );
}