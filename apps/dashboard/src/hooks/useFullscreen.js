import { useCallback, useEffect, useState } from 'react';

function getFullscreenElement() {
  return (
    document.fullscreenElement ??
    document.webkitFullscreenElement ??
    null
  );
}

export function useFullscreen() {
  const [active, setActive] = useState(() => Boolean(getFullscreenElement()));
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(
      typeof document.documentElement.requestFullscreen === 'function' ||
        typeof document.documentElement.webkitRequestFullscreen === 'function',
    );

    function onChange() {
      setActive(Boolean(getFullscreenElement()));
    }

    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  const enter = useCallback(async () => {
    const el = document.documentElement;
    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else if (el.webkitRequestFullscreen) {
        await el.webkitRequestFullscreen();
      }
    } catch {
      // User gesture required or unsupported — ignore.
    }
  }, []);

  const exit = useCallback(async () => {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        await document.webkitExitFullscreen();
      }
    } catch {
      // ignore
    }
  }, []);

  const toggle = useCallback(async () => {
    if (getFullscreenElement()) await exit();
    else await enter();
  }, [enter, exit]);

  return { active, supported, enter, exit, toggle };
}
