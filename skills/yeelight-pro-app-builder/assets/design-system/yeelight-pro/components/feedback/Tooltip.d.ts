export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement | React.ReactNode;
  placement?: "top" | "bottom" | "start" | "end";
}
export function Tooltip(props: TooltipProps): React.ReactElement;
