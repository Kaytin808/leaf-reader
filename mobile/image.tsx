import type { ComponentProps } from 'react';
/* oxlint-disable next/no-img-element -- The native bundle has no image optimization server. */

export default function Image({
  unoptimized: _unoptimized,
  alt = '',
  ...props
}: ComponentProps<'img'> & { unoptimized?: boolean }) {
  return <img {...props} alt={alt} />;
}
