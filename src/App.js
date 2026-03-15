import { Canvas } from '@react-three/fiber'
import { Scene } from './newscene'

export default function App() {
  return (
    <Canvas flat shadows camera={{ position: [-15, 0, 10], fov: 25 }}>
      <Scene />
    </Canvas>
  )
}
