"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "destructive" | "plain" | "glass";
type Size = "huge" | "large" | "normal";

/*
 * Button styles, after the iOS button styles. No borders or shadows: a filled accent button for
 * the one primary action, tinted fills for everything else. Borders appear only in the Black and
 * yellow theme and with Increase Contrast (--color-button-border).
 */
const VARIANTS: Record<Variant, string> = {
  // Filled: the one primary action on a screen.
  primary: "bg-accent text-on-accent",
  // Tinted grey fill.
  secondary: "bg-surface-2 text-text",
  // Destructive: red label, never next to the primary action.
  destructive: "bg-surface-2 text-danger",
  // A text button, like Done in a navigation bar.
  plain: "bg-transparent text-accent",
  // Over the live camera picture.
  glass: "glass-dark text-on-scrim",
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
      className={`inline-flex touch-manipulation items-center justify-center rounded-2xl border-2 border-button-border font-semibold leading-tight select-none ${
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
  className = "",
}: {
  expanded: boolean;
  onToggle: () => void;
  /** Id of the element the button shows and hides. */
  controls: string;
  icon: ReactNode;
  size?: Size;
  variant?: Variant;
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
      className={className}
      onClick={onToggle}
    />
  );
}

/**
 * The navigation bar of a modal screen (Settings, Ask): the screen's title on the leading side
 * and Done on the trailing side, on glass that floats above the scrolling content.
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
    <header className="glass sticky top-0 z-20 flex items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
      <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-bold tracking-tight">
        {title}
      </h1>
      <Button label="Done" variant="plain" size="normal" className="shrink-0 px-3 text-2xl font-bold" onClick={onDone} />
    </header>
  );
}
