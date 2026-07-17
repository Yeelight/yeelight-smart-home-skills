export interface SwitchProps {
  label: string;
  description?: string;
  checked?: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}
export function Switch(props: SwitchProps): React.ReactElement;
