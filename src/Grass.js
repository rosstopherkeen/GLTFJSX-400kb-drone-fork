// Based on https://codepen.io/al-ro/pen/jJJygQ by al-ro, rewritten in react-three-fiber
import * as THREE from "three"
import React, { useRef, useMemo } from "react"
import { useFrame, useLoader } from "@react-three/fiber"
import bladeDiffuse from "./resources/blade_diffuse.jpg"
import bladeAlpha from "./resources/blade_alpha.jpg"
import "./GrassMaterial"

function useIsMobile() {
  // Only treat actual mobile user agents as mobile — not small browser windows like
  // the dev preview pane, which would otherwise cap density to 10k regardless of leva setting
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export default function Grass({
  options = { bW: 0.05, bH: 0.28, joints: 5 },
  // Radius of the circular grass field. The camera orbits at ~18 units from origin,
  // and scene fog fades to black at 22.5 units — a radius of 30 fully covers all
  // visible ground while keeping the edge hidden inside the fog.
  radius = 50,
  instances = 150000,
  groundY = -1.85,
  windSpeed = 1.0,
  tipColor,
  bottomColor,
  ...props
}) {
  const { bW, bH, joints } = options
  const materialRef = useRef()
  const isMobile = useIsMobile()
  const effectiveInstances = isMobile ? Math.min(instances, 10000) : instances
  const [texture, alphaMap] = useLoader(THREE.TextureLoader, [bladeDiffuse, bladeAlpha])
  const attributeData = useMemo(
    () => getAttributeData(effectiveInstances, radius),
    [effectiveInstances, radius]
  )
  const baseGeom = useMemo(
    () => new THREE.PlaneGeometry(bW, bH, 1, joints).translate(0, bH / 2, 0),
    [bW, bH, joints]
  )

  // Only update wind time — grass stays fixed in world space
  useFrame((state) => {
    materialRef.current.uniforms.time.value = (state.clock.elapsedTime / 4) * windSpeed
  })

  // Dark ground fill — sized well beyond the fog line so no bare edge is ever visible
  const groundGeo = useMemo(() => new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), [])

  return (
    // Grass field is centered on the scene origin (the drone) at ground level
    <group position={[0, groundY, 0]} {...props}>
      {/* frustumCulled=false: THREE.js only knows the tiny base-blade bounding box,
          not the full radius of instance offsets — it would incorrectly cull every frame */}
      {/* Ground fill: covers bare dirt between blades. Sits just below the roots (y=-0.01)
          so it doesn't z-fight with the blades themselves. 200×200 exceeds the fog range
          so no hard edge is ever visible regardless of camera angle or orbit position. */}
      <mesh geometry={groundGeo} position={[0, -0.01, 0]}>
        <meshStandardMaterial color="#000f00" />
      </mesh>
      <mesh frustumCulled={false}>
        {/* instanceCount must be explicit: THREE.js r160 passes it directly to
            gl.drawElementsInstanced; the default Infinity coerces to 0 (fixed in r170+).
            key on the geometry forces full recreation when blade dimensions change —
            setting attributes-position on an existing geometry doesn't set needsUpdate. */}
        <instancedBufferGeometry
          key={`${bW}-${bH}-${joints}`}
          instanceCount={effectiveInstances}
          index={baseGeom.index}
          attributes-position={baseGeom.attributes.position}
          attributes-uv={baseGeom.attributes.uv}
        >
          <instancedBufferAttribute attach="attributes-offset"           args={[new Float32Array(attributeData.offsets), 3]} />
          <instancedBufferAttribute attach="attributes-orientation"      args={[new Float32Array(attributeData.orientations), 4]} />
          <instancedBufferAttribute attach="attributes-stretch"          args={[new Float32Array(attributeData.stretches), 1]} />
          <instancedBufferAttribute attach="attributes-halfRootAngleSin" args={[new Float32Array(attributeData.halfRootAngleSin), 1]} />
          <instancedBufferAttribute attach="attributes-halfRootAngleCos" args={[new Float32Array(attributeData.halfRootAngleCos), 1]} />
        </instancedBufferGeometry>
        {/* bladeHeight must match bH so frc = position.y/bladeHeight goes 0→1 across the blade */}
        <grassMaterial
          ref={materialRef}
          map={texture}
          alphaMap={alphaMap}
          toneMapped={false}
          bladeHeight={bH}
          {...(tipColor    !== undefined && { tipColor    })}
          {...(bottomColor !== undefined && { bottomColor })}
        />
      </mesh>
    </group>
  )
}

function getAttributeData(instances, radius) {
  const offsets = []
  const orientations = []
  const stretches = []
  const halfRootAngleSin = []
  const halfRootAngleCos = []

  let quaternion_0 = new THREE.Vector4()
  let quaternion_1 = new THREE.Vector4()

  const tiltMin = -0.25
  const tiltMax = 0.25

  for (let i = 0; i < instances; i++) {
    // Uniform-area distribution: sqrt(random()) * radius gives equal blade density
    // per square metre across the whole circle, ensuring full ground coverage.
    const theta = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * radius
    const offsetX = Math.cos(theta) * r
    const offsetZ = Math.sin(theta) * r
    offsets.push(offsetX, 0, offsetZ)

    // Random Y-axis rotation for the blade face direction
    let angle = Math.PI - Math.random() * (2 * Math.PI)
    halfRootAngleSin.push(Math.sin(0.5 * angle))
    halfRootAngleCos.push(Math.cos(0.5 * angle))

    let RotationAxis = new THREE.Vector3(0, 1, 0)
    let x = RotationAxis.x * Math.sin(angle / 2.0)
    let y = RotationAxis.y * Math.sin(angle / 2.0)
    let z = RotationAxis.z * Math.sin(angle / 2.0)
    let w = Math.cos(angle / 2.0)
    quaternion_0.set(x, y, z, w).normalize()

    // Small random X tilt
    angle = Math.random() * (tiltMax - tiltMin) + tiltMin
    RotationAxis = new THREE.Vector3(1, 0, 0)
    x = RotationAxis.x * Math.sin(angle / 2.0)
    y = RotationAxis.y * Math.sin(angle / 2.0)
    z = RotationAxis.z * Math.sin(angle / 2.0)
    w = Math.cos(angle / 2.0)
    quaternion_1.set(x, y, z, w).normalize()
    quaternion_0 = multiplyQuaternions(quaternion_0, quaternion_1)

    // Small random Z tilt
    angle = Math.random() * (tiltMax - tiltMin) + tiltMin
    RotationAxis = new THREE.Vector3(0, 0, 1)
    x = RotationAxis.x * Math.sin(angle / 2.0)
    y = RotationAxis.y * Math.sin(angle / 2.0)
    z = RotationAxis.z * Math.sin(angle / 2.0)
    w = Math.cos(angle / 2.0)
    quaternion_1.set(x, y, z, w).normalize()
    quaternion_0 = multiplyQuaternions(quaternion_0, quaternion_1)

    orientations.push(quaternion_0.x, quaternion_0.y, quaternion_0.z, quaternion_0.w)

    // Height variety: a third of blades are taller to break uniformity.
    // Cap at 0.6 (vs the original 1.8) — the narrow 25° FOV of this scene
    // magnifies blade height ~4× vs a typical wide-FOV scene.
    stretches.push(i < instances / 3 ? Math.random() * 0.6 : Math.random() * 0.3)
  }

  return { offsets, orientations, stretches, halfRootAngleCos, halfRootAngleSin }
}

function multiplyQuaternions(q1, q2) {
  const x = q1.x * q2.w + q1.y * q2.z - q1.z * q2.y + q1.w * q2.x
  const y = -q1.x * q2.z + q1.y * q2.w + q1.z * q2.x + q1.w * q2.y
  const z = q1.x * q2.y - q1.y * q2.x + q1.z * q2.w + q1.w * q2.z
  const w = -q1.x * q2.x - q1.y * q2.y - q1.z * q2.z + q1.w * q2.w
  return new THREE.Vector4(x, y, z, w)
}
