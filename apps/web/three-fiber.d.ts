// Extends React.JSX.IntrinsicElements with @react-three/fiber Three.js elements.
// Required because React 19 uses React.JSX instead of the global JSX namespace,
// but R3F v8 only augments the legacy global JSX namespace.
import type { ThreeElements } from '@react-three/fiber';

declare module 'react' {
  namespace JSX {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface IntrinsicElements extends ThreeElements {}
  }
}
