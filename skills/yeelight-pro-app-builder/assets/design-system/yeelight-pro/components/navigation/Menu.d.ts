export interface MenuItem {
  id: string;
  label: string;
  description?: string;
  destructive?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
}
export interface MenuProps {
  label: string;
  items: MenuItem[];
  align?: "start" | "end";
}
export function Menu(props: MenuProps): React.ReactElement;
