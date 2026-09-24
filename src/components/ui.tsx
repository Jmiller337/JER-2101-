"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "quiet";
type Size = "huge" | "large" | "normal";

const VARIANTS: Record<Variant, string> = {
  // Black on yellow: about 16:1 contrast.
  primary: "bg-yellow-300 text-black border-4 border-yellow-300",
  // White on near-black with a white border: about 19:1.
  secondary: "bg-neutral-900 text-white border-2 border-white",
  quiet: "bg-black text-white border-2 border-neutral-400",
};

const SIZES: Record<Size, string> = {
  huge: "min-h-32 text-4xl px-6",
  large: "min-h-16 text-2xl px-5",
  normal: "min-h-12 text-xl px-4",
};

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  label: ReactNode;
  variant?: Variant;
  size?: Size;
}

/**
 * A native button with a visible text label (principle 7). Primary controls are at least 64 by
 * 64 CSS pixels, secondary at least 48 (principle 8). `aria-disabled` is used instead of
 * `disabled` so VoiceOver can still find the control and hear that it is unavailable.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { label, variant = "secondary", size = "large", className = "", onClick, ...rest },
  ref,
) {
  const unavailable = rest["aria-disabled"] === true || rest["aria-disabled"] === "true";
  return (
    <button
      ref={ref}
      type="button"
      className={`rounded-2xl font-bold leading-tight ${VARIANTS[variant]} ${SIZES[size]} ${
        unavailable ? "opacity-60" : "active:scale-[0.99]"
      } ${className}`}
      onClick={unavailable ? undefined : onClick}
      {...rest}
    >
      {label}
    </button>
  );
});
