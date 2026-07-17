export interface DeviceTileProps {
  name: string;
  room: string;
  category: string;
  summary: React.ReactNode;
  status?: "success" | "warning" | "error" | "offline" | "readonly" | "mismatch";
  statusLabel?: string;
  power?: boolean;
  disabled?: boolean;
  onOpen?: () => void;
  onPowerChange?: (checked: boolean) => void;
}
export function DeviceTile(props: DeviceTileProps): React.ReactElement;
