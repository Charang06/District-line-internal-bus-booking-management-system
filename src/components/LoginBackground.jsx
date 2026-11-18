import { useEffect, useRef, useState } from 'react'

/** Keep progressive image paints hidden until the complete image is decoded. */
export default function LoginBackground() {
  const imageRef = useRef(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true
    const image = imageRef.current
    image.decode().then(() => {
      if (active) setReady(true)
    }).catch(() => {
      // A failed download or decode leaves the navy fallback visible.
    })
    return () => { active = false }
  }, [])

  return <div className={`login-background${ready ? ' is-ready' : ''}`} aria-hidden="true">
    <img ref={imageRef} src="/login-tropical-sunset-v2.webp" alt="" width="1672" height="941" decoding="async" loading="eager" fetchPriority="low" />
  </div>
}
