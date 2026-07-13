export interface StatusBadgeProps {
  children: React.ReactNode;
  tone?: "success" | "warning" | "error" | "offline" | "readonly" | "mismatch";
}
export function StatusBadge(props: StatusBadgeProps): React.ReactElement;
