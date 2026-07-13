export interface ButtonProps {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  busy?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}
export function Button(props: ButtonProps): React.ReactElement;
