export interface ModalSurfaceProps {
  open: boolean;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose?: () => void;
  closeLabel?: string;
  variant?: "dialog" | "sheet";
  closeOnBackdrop?: boolean;
}
export function ModalSurface(props: ModalSurfaceProps): React.ReactElement | null;
