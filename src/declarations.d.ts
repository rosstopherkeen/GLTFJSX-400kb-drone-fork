declare global {
  namespace JSX {
    interface IntrinsicElements {
      fog: any
      grassMaterial: any
    }
  }
}

declare module '*.jpg' {
  const src: string
  export default src
}
declare module '*.png' {
  const src: string
  export default src
}
