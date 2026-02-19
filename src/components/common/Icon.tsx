import type { LucideIcon } from 'lucide-react';

interface IconProps {
  icon: LucideIcon;
  size?: number;
  className?: string;
  onClick?: () => void;
}

export function Icon({ icon: LucideIcon, size = 18, className = '', onClick }: IconProps) {
  return (
    <LucideIcon
      size={size}
      className={className}
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : undefined}
    />
  );
}
