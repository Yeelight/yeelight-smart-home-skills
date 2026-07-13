/** @startingPoint section="Application shells" subtitle="Adaptive Yeelight PRO product shell" viewport="1200x760" */
export interface AppShellProps {
  title: string;
  navigation: React.ReactNode;
  status?: React.ReactNode;
  children: React.ReactNode;
}
export function AppShell(props: AppShellProps): React.ReactElement;
