"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { CheckIcon } from "./icons";

type Variant = "primary" | "secondary" | "destructive" | "plain" | "glass" | "bar" | "float";
type Size = "huge" | "large" | "normal";

/*
 * Button styles, after the iOS 26 Liquid Glass button styles (see "Liquid Glass" in
 * globals.css): tinted glass for the one primary action, clear glass for the rest, and no fill at
 * all for items inside a glass bar. Borders appear only in the Black and yellow theme and with
 * Increase Contrast (--color-button-border).
 */
const VARIANTS: Record<Variant, string> = {
  // Tinted glass: the one primary action on a screen.
  primary: "glass-prominent",
  // Clear glass.
  secondary: "glass-button text-text",
  // Destructive: red label, never next to the primary action.
  destructive: "glass-button text-danger",
  // A text button.
  plain: "bg-transparent text-accent",
  // Over the live camera picture.
  glass: "glass-dark text-on-scrim",
  // An item inside a glass bar: no fill of its own.
  bar: "glass-item text-text",
  // A control floating on its own over content, as a small glass bar.
  float: "glass text-text",
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
      className={`inline-flex touch-manipulation items-center justify-center border-2 border-button-border font-semibold leading-tight select-none ${
        // Capsules for one line, concentric rounded rectangles for taller buttons.
        size === "huge" ? "rounded-[2rem]" : layout === "stacked" ? "flex-col gap-1 rounded-[1.4rem] py-2" : "gap-2.5 rounded-full"
      } ${VARIANTS[variant]} ${SIZES[size]} ${unavailable ? "opacity-60" : "liquid-press"} ${className}`}
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

/**
 * Shows or hides the less-used controls of a screen, so each screen starts with only its core
 * controls. VoiceOver reads it as "More, collapsed" or "More, expanded".
 */
export function MoreButton({
  expanded,
  onToggle,
  controls,
  icon,
  size = "normal",
  variant = "secondary",
  layout = "row",
  className = "",
}: {
  expanded: boolean;
  onToggle: () => void;
  /** Id of the element the button shows and hides. */
  controls: string;
  icon: ReactNode;
  size?: Size;
  variant?: Variant;
  layout?: "row" | "stacked";
  className?: string;
}) {
  return (
    <Button
      label="More"
      aria-expanded={expanded}
      aria-controls={controls}
      icon={icon}
      size={size}
      variant={variant}
      layout={layout}
      className={className}
      onClick={onToggle}
    />
  );
}

/**
 * The navigation bar of a modal screen (Settings, Ask): a floating glass capsule with the
 * screen's title on the leading side and Done, with a checkmark, on the trailing side.
 */
export function NavBar({
  title,
  headingRef,
  onDone,
}: {
  title: string;
  headingRef: React.Ref<HTMLHeadingElement>;
  onDone: () => void;
}) {
  return (
    <div className="scroll-edge-top sticky top-0 z-20 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-4">
      <header className="glass flex items-center justify-between gap-3 rounded-[1.75rem] py-2 pr-2 pl-4">
        <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-bold tracking-tight">
          {title}
        </h1>
        <Button label="Done" icon={<CheckIcon />} variant="bar" size="normal" className="shrink-0 px-4 text-2xl font-bold" onClick={onDone} />
      </header>
    </div>
  );
}
