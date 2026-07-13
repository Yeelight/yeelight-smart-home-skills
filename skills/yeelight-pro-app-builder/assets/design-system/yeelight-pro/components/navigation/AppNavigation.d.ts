export interface AppNavigationItem { id: string; label: string; }
export interface AppNavigationProps {
  items: AppNavigationItem[];
  activeId: string;
  onNavigate?: (id: string) => void;
}
export function AppNavigation(props: AppNavigationProps): React.ReactElement;
