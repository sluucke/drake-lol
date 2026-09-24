export function Skeleton({ width = '100%', height = 12, radius, variant = 'line', className = '' }) {
  const circle = variant === 'circle';
  const style = {
    width,
    height: circle ? width : height,
    borderRadius: circle ? '50%' : radius,
  };
  return <span aria-hidden="true" className={['drk-skel', `drk-skel--${variant}`, className].filter(Boolean).join(' ')} style={style} />;
}
