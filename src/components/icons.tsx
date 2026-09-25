import type { ReactNode } from "react";

interface IconProps {
  className?: string;
}

/**
 * Small line icons, drawn inline so nothing is downloaded. Every icon is decorative: it sits next
 * to a visible text label (principle 7) and is hidden from VoiceOver.
 */
function Icon({ children, className = "h-7 w-7" }: IconProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

export const CameraIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 8h3.2l1.6-3h6.4l1.6 3H20v11H4z" />
    <circle cx="12" cy="13" r="3.6" />
  </Icon>
);

export const PhotoIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <circle cx="8.5" cy="10" r="1.8" />
    <path d="m21 16-5-5-8.5 8" />
  </Icon>
);

export const PlayIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 5.5v13l10-6.5z" fill="currentColor" />
  </Icon>
);

export const PauseIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="6" y="5" width="4.5" height="14" rx="1" fill="currentColor" />
    <rect x="13.5" y="5" width="4.5" height="14" rx="1" fill="currentColor" />
  </Icon>
);

export const StepBackIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 6v12" />
    <path d="M18 6.5v11L9.5 12z" fill="currentColor" />
  </Icon>
);

export const StepForwardIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M17 6v12" />
    <path d="M6 6.5v11l8.5-5.5z" fill="currentColor" />
  </Icon>
);

export const ParagraphUpIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m6 13 6-6 6 6" />
    <path d="M6 19h12" />
  </Icon>
);

export const ParagraphDownIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 5h12" />
    <path d="m6 11 6 6 6-6" />
  </Icon>
);

export const SpellIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 17 8.5 6l4.5 11" />
    <path d="M5.7 13h5.6" />
    <path d="M16 10.5c1.7 0 3 .9 3 2.3V17" />
    <path d="M19 14.2c-2.6 0-4.3.5-4.3 1.9 0 1 .8 1.4 1.8 1.4 1.4 0 2.5-.8 2.5-2" />
  </Icon>
);

export const SlowerIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14" />
  </Icon>
);

export const FasterIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const QuestionIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-5 4z" />
    <path d="M9.8 8.2a2.3 2.3 0 1 1 3.2 2.1c-.7.4-1 .8-1 1.5" />
    <circle cx="12" cy="13.6" r=".5" fill="currentColor" />
  </Icon>
);

export const AddPageIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 3h8l4 4v14H6z" />
    <path d="M14 3v4h4" />
    <path d="M12 10.5v6M9 13.5h6" />
  </Icon>
);

export const NewDocumentIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 3h8l4 4v14H6z" />
    <path d="M14 3v4h4" />
    <path d="M9 13h6M9 16.5h6" />
  </Icon>
);

export const RetakeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 12a8 8 0 1 1-2.4-5.7" />
    <path d="M20 4v4.5h-4.5" />
  </Icon>
);

export const SettingsIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
  </Icon>
);

export const MicIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
    <path d="M12 18v3" />
  </Icon>
);

export const SendIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M21 3 10.5 13.5" />
    <path d="M21 3 14.5 21l-4-7.5L3 9.5z" />
  </Icon>
);

export const BackIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19 12H5" />
    <path d="m12 5-7 7 7 7" />
  </Icon>
);

export const LockIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </Icon>
);

export const EarIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 9a6 6 0 0 1 12 0c0 3.2-2.4 4-3.2 6.2-.6 1.6-1.2 3.8-3.3 3.8-1.6 0-2.5-1.1-2.5-2.3" />
    <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.6-1.6 2-1.6 3.4" />
  </Icon>
);

export const SpeakerIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 9.5v5h3.5L13 19V5L7.5 9.5z" fill="currentColor" />
    <path d="M16 8.5a5 5 0 0 1 0 7" />
    <path d="M18.8 5.5a9 9 0 0 1 0 13" />
  </Icon>
);

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);

/** The app's mark: a page with sound leaving it. */
export const BrandMark = ({ className = "h-12 w-12" }: IconProps) => (
  <svg aria-hidden="true" focusable="false" viewBox="0 0 64 64" className={className}>
    <rect x="4" y="4" width="56" height="56" rx="16" fill="#ffd166" />
    <path d="M20 18h14l8 8v20H20z" fill="none" stroke="#191100" strokeWidth="4" strokeLinejoin="round" />
    <path d="M34 18v8h8" fill="none" stroke="#191100" strokeWidth="4" strokeLinejoin="round" />
    <path d="M26 33h12M26 39h12" stroke="#191100" strokeWidth="4" strokeLinecap="round" />
  </svg>
);
