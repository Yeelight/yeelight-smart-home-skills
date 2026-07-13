export interface InlineNoticeProps {
  title: string;
  children?: React.ReactNode;
  tone?: "info" | "error";
  action?: React.ReactNode;
}
export function InlineNotice(props: InlineNoticeProps): React.ReactElement;
