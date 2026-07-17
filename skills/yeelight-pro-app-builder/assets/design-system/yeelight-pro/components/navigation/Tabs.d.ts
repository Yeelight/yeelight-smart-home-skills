export interface TabItem {
  value: string;
  label: string;
  count?: number;
  disabled?: boolean;
  content?: React.ReactNode;
}
export interface TabsProps {
  items: TabItem[];
  value: string;
  ariaLabel?: string;
  onChange?: (value: string) => void;
}
export function Tabs(props: TabsProps): React.ReactElement;
