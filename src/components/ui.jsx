export function Panel({
  title,
  subtitle,
  action,
  className = '',
  children
}) {
  return (
    <section className={`panel ${className}`.trim()}>
      {(title || subtitle || action) && (
        <header className="panel-header">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action ? <div>{action}</div> : null}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatCard({ label, value, tone = 'default' }) {
  return (
    <div className={`stat-card stat-card-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function Badge({ children, tone = 'default' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Button({
  children,
  tone = 'primary',
  className = '',
  type = 'button',
  ...props
}) {
  return (
    <button
      className={`button button-${tone} ${className}`.trim()}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span>
        <strong>{label}</strong>
        {hint ? <small>{hint}</small> : null}
      </span>
      {children}
    </label>
  );
}

export function EmptyState({ title, body }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}

export function Callout({ tone = 'default', children }) {
  return <div className={`callout callout-${tone}`}>{children}</div>;
}
