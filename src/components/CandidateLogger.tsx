'use client';

import { useEffect, useRef } from 'react';

/**
 * CandidateLogger Component
 * Renders null (invisible). Log Candidate LinkedIn URL once in the browser
 * console when the application is mounted to verify candidacy credentials.
 */
export default function CandidateLogger() {
  const logged = useRef(false);

  useEffect(() => {
    // Prevent duplicate logs from React StrictMode double invocation
    if (!logged.current) {
      console.log("[NextFlow] Candidate LinkedIn: https://www.linkedin.com/in/yash-rao-75891316b");
      logged.current = true;
    }
  }, []);

  return null;
}

