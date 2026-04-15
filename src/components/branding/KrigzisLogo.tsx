import React from 'react';

type KrigzisLogoProps = {
  size?: number;
  className?: string;
  strokeWidth?: number;
  title?: string;
};

export const KrigzisLogo: React.FC<KrigzisLogoProps> = ({
  size = 28,
  className,
  strokeWidth: _sw,
  title = 'Nexus Testing',
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label={title}
      className={className}
    >
      <rect width="40" height="40" rx="9" fill="currentColor" fillOpacity="0.12" />
      <circle cx="10" cy="10" r="3.5" fill="currentColor" />
      <circle cx="10" cy="30" r="3.5" fill="currentColor" />
      <circle cx="30" cy="10" r="3.5" fill="currentColor" />
      <circle cx="30" cy="30" r="3.5" fill="currentColor" />
      <circle cx="20" cy="20" r="2.5" fill="currentColor" fillOpacity="0.6" />
      <line x1="10" y1="13" x2="10" y2="27" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <line x1="30" y1="13" x2="30" y2="27" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <line x1="12.5" y1="12" x2="27.5" y2="28" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
};

export default KrigzisLogo;
