/** Is the signed-in account a verification reviewer (support, or appointed by
 *  support)? null while checking. docs/verification/fast-lanes.md */
import { useEffect, useState } from 'react';
import { useAuth } from '../core/auth';
import { amVerificationReviewer } from './repos';

export function useVerificationReviewer(): boolean | null {
  const { profile } = useAuth();
  const [ok, setOk] = useState<boolean | null>(profile?.role === 'support' ? true : null);
  useEffect(() => {
    let on = true;
    if (!profile?.id) { setOk(false); return; }
    void amVerificationReviewer(profile.role).then((v) => { if (on) setOk(v); }).catch(() => { if (on) setOk(false); });
    return () => { on = false; };
  }, [profile?.id, profile?.role]);
  return ok;
}
