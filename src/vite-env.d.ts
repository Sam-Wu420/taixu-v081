/// <reference types="vite/client" />
import type { ReactElement } from 'react';

declare global {
  namespace JSX {
    type Element = ReactElement;
  }
}

declare module '*.webp?inline' {
  const src: string;
  export default src;
}
declare module '*.png?inline' {
  const src: string;
  export default src;
}
declare module '*.jpg?inline' {
  const src: string;
  export default src;
}
