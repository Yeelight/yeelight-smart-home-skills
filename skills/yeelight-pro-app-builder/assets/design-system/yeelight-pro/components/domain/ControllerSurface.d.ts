export interface ControllerSurfaceProps {
  title: string;
  subtitle?: string;
  status?: "success" | "warning" | "error" | "offline" | "readonly" | "mismatch";
  statusLabel?: string;
  value?: string | number;
  unit?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}
export function ControllerSurface(props: ControllerSurfaceProps): React.ReactElement;
