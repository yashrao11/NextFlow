'use client';

import { useEffect, useRef } from 'react';

export default function CandidateLogger() {
  const logged = useRef(false);

  useEffect(() => {
    if (!logged.current) {
      console.log("[NextFlow] Candidate LinkedIn: https://www.linkedin.com/in/yash-rao-75891316b");
      logged.current = true;
    }
  }, []);

  return null;
}
