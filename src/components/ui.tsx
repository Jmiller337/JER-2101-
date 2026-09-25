"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "quiet";
type Size = "huge" | "large" | "normal";

const VARIANTS: Record<Variant, string> = {
  // Near-black on amber: about 13:1.
  primary: "bg-accent text-on-accent border-2 border-accent",
  // Off-white on slate: about 14:1.
  secondary: "bg-surface-2 text-text border-2 border-line-2",
  quiet: "bg-transparent text-text border-2 border-line",
};

const SIZES: Record<Size, string> = {
  huge: "min-h-32 text-4xl px-6",
  large: "min-h-16 text-2xl px-5",
  normal: "min-h-12 text-xl px-4",
};

const ICON_SIZES: Record<Size, string> = {
  huge: "h-10 w-10",
  large: "h-7 w-7",
  normal: "h-6 w-6",
};

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  label: ReactNode;
  /** A decorative icon (hidden from VoiceOver) shown before the label. */
  icon?: ReactNode;
  variant?: Variant;
  size?: Size;
  /** `stacked` puts the icon above the label, for narrow columns. */
  layout?: "row" | "stacked";
}

/**
 * A native button with a visible text label (principle 7). Primary controls are at least 64 by
 * 64 CSS pixels, secondary at least 48 (principle 8). `aria-disabled` is used instead of
 * `disabled` so VoiceOver can still find the control and hear that it is unavailable. The click
 * handler stays attached: the controller then says why the control cannot be used yet, instead of
 * a tap doing nothing at all.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { label, icon, variant = "secondary", size = "large", layout = "row", className = "", ...rest },
  ref,
) {
  const unavailable = rest["aria-disabled"] === true || rest["aria-disabled"] === "true";
  return (
    <button
      ref={ref}
      type="button"
      className={`inline-flex touch-manipulation items-center justify-center rounded-2xl font-bold leading-tight tracking-tight select-none ${
        layout === "stacked" ? "flex-col gap-1 py-2" : "gap-2.5"
      } ${VARIANTS[variant]} ${SIZES[size]} ${unavailable ? "opacity-60" : "transition-transform active:scale-[0.98]"} ${className}`}
      {...rest}
    >
      {icon && (
        <span aria-hidden="true" className={`shrink-0 ${ICON_SIZES[size]} [&>svg]:h-full [&>svg]:w-full`}>
          {icon}
        </span>
      )}
      <span>{label}</span>
    </button>
  );
});
