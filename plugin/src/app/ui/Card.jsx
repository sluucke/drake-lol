export function Card({ title, actions, glow = false, className = '', children }) {
  const classes = ['drk-card', glow && 'drk-card--glow', className].filter(Boolean).join(' ');
  return (
    <section className={classes}>
      {(title || actions) && (
        <header className="drk-card__head">
          {title && <h3 className="drk-card__title">{title}</h3>}
          {actions && <div className="drk-card__actions">{actions}</div>}
        </header>
      )}
      <div className="drk-card__body">{children}</div>
    </section>
  );
}
