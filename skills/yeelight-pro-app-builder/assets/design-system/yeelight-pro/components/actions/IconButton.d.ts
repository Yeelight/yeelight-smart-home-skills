export interface IconButtonProps {
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}
export function IconButton(props: IconButtonProps): React.ReactElement;
