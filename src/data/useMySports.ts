/** The signed-in person's sports (from "Personalise my Home"), for the one
 *  sport picker (UI audit step 4). Empty until loaded or when not set. */
import { useEffect, useState } from 'react';
import { getMyPersonalisation } from './personalise';

export function useMySports(): string[] {
  const [mine, setMine] = useState<string[]>([]);
  useEffect(() => {
    let on = true;
    getMyPersonalisation().then((p) => { if (on) setMine(Array.isArray(p?.sports) ? p!.sports.map(String) : []); }).catch(() => undefined);
    return () => { on = false; };
  }, []);
  return mine;
}
