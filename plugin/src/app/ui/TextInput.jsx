export function TextInput({ id, type = 'text', value, onChange, onCommit, placeholder, disabled = false, ariaLabel, maxLength }) {
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
