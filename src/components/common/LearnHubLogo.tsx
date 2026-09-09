import React from "react";

interface LearnHubLogoProps {
  size?: number;
  className?: string;
  withText?: boolean;
  textColor?: string;
  textSize?: string;
}

export const LearnHubLogo: React.FC<LearnHubLogoProps> = ({
  size = 28,
  className = "",
  withText = false,
  textColor = "text-[var(--lh-ink)]",
  textSize = "text-lg",
}) => {
  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
        aria-hidden="true"
      >
        <circle cx="25" cy="25" r="25" fill="var(--lh-primary)" />
        <circle cx="75" cy="25" r="25" fill="var(--lh-secondary)" />
        <circle cx="25" cy="75" r="25" fill="var(--lh-secondary)" />
        <circle cx="75" cy="75" r="25" fill="var(--lh-primary)" />
      </svg>
      {withText && (
        <span className={`font-medium tracking-tight ${textSize} ${textColor}`}>
          LearnHub
        </span>
      )}
    </div>
  );
};
