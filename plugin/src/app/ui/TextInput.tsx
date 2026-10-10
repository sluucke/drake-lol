export interface TextInputProps {
  id?: string;
  type?: string;
  value: string;
  onChange?: (value: string) => void;
  onCommit?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  maxLength?: number;
}

export function TextInput({ id, type = 'text', value, onChange, onCommit, placeholder, disabled = false, ariaLabel, maxLength }: TextInputProps) {
  return (
    <input
      id={id}
      type={type}
      className="drk-input"
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
      maxLength={maxLength}
      onChange={(event) => onChange?.(event.target.value)}
      onBlur={(event) => onCommit?.(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}
