export interface ToastProps {
  open?: boolean;
  tone?: "info" | "success" | "warning" | "error";
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  duration?: number;
  dismissLabel?: string;
  onDismiss?: () => void;
}
export function Toast(props: ToastProps): React.ReactElement | null;
