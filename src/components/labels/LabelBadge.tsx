import type { LabelType } from '@/types';
import { getLabelDefinition } from '@/constants/labels';

type LabelBadgeProps = {
  label: LabelType;
  className?: string;
  isActive?: boolean;
};

const LabelBadge = ({ label, className = '', isActive = true }: LabelBadgeProps) => {
  const definition = getLabelDefinition(label);
  if (!definition) {
    return null;
  }

  const colorClass = isActive ? definition.color : definition.inactiveColor;

  return (
    <span className={`inline-flex h-5 w-5 items-center justify-center text-xs font-bold ${colorClass} ${className}`}>
      {definition.symbol}
    </span>
  );
};

export default LabelBadge;
