export interface SheetProps {
  open: boolean;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  closeLabel?: string;
  closeOnBackdrop?: boolean;
  onClose?: () => void;
}
export function Sheet(props: SheetProps): React.ReactElement | null;
