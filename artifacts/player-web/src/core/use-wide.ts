/** Whether the window is at least 768 px wide: the desktop dock and the full header; below, the phone layout. */
import { useEffect, useState } from "react";

const WIDE = "(min-width: 768px)";
export function useWide() {
  const [wide, setWide] = useState(() => typeof matchMedia === "function" && matchMedia(WIDE).matches);
  useEffect(() => {
    const query = matchMedia(WIDE);
    const onChange = () => setWide(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return wide;
}
