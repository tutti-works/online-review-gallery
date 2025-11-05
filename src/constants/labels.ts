import type { LabelType } from '@/types';

export type LabelDefinition = {
  type: LabelType;
  symbol: string;
  color: string;
  inactiveColor: string;
  bgColor: string;
};

export const LABEL_DEFINITIONS: LabelDefinition[] = [
  { type: 'red-1', symbol: '1', color: 'text-red-600', inactiveColor: 'text-red-300', bgColor: 'bg-red-100 hover:bg-red-200' },
  { type: 'red-2', symbol: '2', color: 'text-red-600', inactiveColor: 'text-red-300', bgColor: 'bg-red-100 hover:bg-red-200' },
  { type: 'red-3', symbol: '3', color: 'text-red-600', inactiveColor: 'text-red-300', bgColor: 'bg-red-100 hover:bg-red-200' },
  { type: 'red-4', symbol: '4', color: 'text-red-600', inactiveColor: 'text-red-300', bgColor: 'bg-red-100 hover:bg-red-200' },
  { type: 'red-5', symbol: '5', color: 'text-red-600', inactiveColor: 'text-red-300', bgColor: 'bg-red-100 hover:bg-red-200' },
  { type: 'blue-1', symbol: '1', color: 'text-blue-600', inactiveColor: 'text-blue-300', bgColor: 'bg-blue-100 hover:bg-blue-200' },
  { type: 'blue-2', symbol: '2', color: 'text-blue-600', inactiveColor: 'text-blue-300', bgColor: 'bg-blue-100 hover:bg-blue-200' },
  { type: 'blue-3', symbol: '3', color: 'text-blue-600', inactiveColor: 'text-blue-300', bgColor: 'bg-blue-100 hover:bg-blue-200' },
  { type: 'blue-4', symbol: '4', color: 'text-blue-600', inactiveColor: 'text-blue-300', bgColor: 'bg-blue-100 hover:bg-blue-200' },
  { type: 'blue-5', symbol: '5', color: 'text-blue-600', inactiveColor: 'text-blue-300', bgColor: 'bg-blue-100 hover:bg-blue-200' },
];

export const getLabelDefinition = (label: LabelType): LabelDefinition | undefined =>
  LABEL_DEFINITIONS.find((definition) => definition.type === label);
