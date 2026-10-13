import { useEffect, useState } from 'react';

export function useResourceClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const refresh = () => { if (!document.hidden) setNow(Date.now()); };
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return now;
}
