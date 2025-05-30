import { useState } from 'preact/hooks'

export function useConsent() {
  const [accepted, setAccepted] = useState(() => localStorage.getItem('consent') === 'true')
  const [rejected, setRejected] = useState(false)
  
  const handleAccept = () => {
    localStorage.setItem('consent', 'true')
    setAccepted(true)
  }
  
  const handleReject = () => {
    setRejected(true)
    // Better approach than complex window.close() logic
    window.location.href = 'about:blank'
  }
  
  return { 
    accepted, 
    rejected, 
    handleAccept, 
    handleReject 
  }
}