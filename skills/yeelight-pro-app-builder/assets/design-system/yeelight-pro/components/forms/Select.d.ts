export interface SelectOption { value: string; label: string; disabled?: boolean; }
export interface SelectProps {
  label: string;
  value: string;
  options: SelectOption[];
  helper?: string;
  error?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
}
export function Select(props: SelectProps): React.ReactElement;
