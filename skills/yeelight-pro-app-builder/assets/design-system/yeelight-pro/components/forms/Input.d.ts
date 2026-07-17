export interface InputProps {
  label: string;
  value?: string;
  type?: "text" | "search" | "number";
  placeholder?: string;
  helper?: string;
  error?: string;
  disabled?: boolean;
  readOnly?: boolean;
  onChange?: (value: string) => void;
}
export function Input(props: InputProps): React.ReactElement;
