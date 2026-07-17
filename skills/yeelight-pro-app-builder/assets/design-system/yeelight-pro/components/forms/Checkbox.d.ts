export interface CheckboxProps {
  label: string;
  description?: string;
  checked?: boolean;
  disabled?: boolean;
  indeterminate?: boolean;
  onChange?: (checked: boolean) => void;
}
export function Checkbox(props: CheckboxProps): React.ReactElement;
