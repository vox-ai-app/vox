export default function IconButton({ icon: Icon, size = 14, label, disabled, className = '', onClick, ...rest }) {
  return (
    <button
      aria-label={label}
      className={`workspace-icon-button ${className}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
      {...rest}
    >
      <Icon size={size} />
    </button>
  )
}
