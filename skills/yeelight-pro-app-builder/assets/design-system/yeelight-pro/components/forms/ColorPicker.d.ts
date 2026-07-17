export interface ColorPickerProps {
  label: string;
  value: string;
  swatches?: string[];
  disabled?: boolean;
  onChange?: (value: string) => void;
}
export function ColorPicker(props: ColorPickerProps): React.ReactElement;
