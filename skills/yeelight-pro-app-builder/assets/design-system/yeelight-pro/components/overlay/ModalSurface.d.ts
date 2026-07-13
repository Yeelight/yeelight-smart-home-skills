export interface ModalSurfaceProps {
  open: boolean;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose?: () => void;
  closeLabel?: string;
}
export function ModalSurface(props: ModalSurfaceProps): React.ReactElement | null;
