export interface DialogProps {
  open: boolean;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  closeLabel?: string;
  closeOnBackdrop?: boolean;
  onClose?: () => void;
}
export function Dialog(props: DialogProps): React.ReactElement | null;
