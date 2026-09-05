import type { ComponentProps } from 'react';

// The native bundle has one screen; it does not use the web server's router.
export default function Link({ children, ...props }: ComponentProps<'a'>) {
  return <a {...props}>{children}</a>;
}
