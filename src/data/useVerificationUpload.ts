/** Upload (or re-submit) the proof of date of birth — shared by the profile's
 *  compact verification card and the VerificationDetails screen, so the action
 *  is the same wherever it is offered (docs/security/breaks/verification-card.md). */
import { useState } from 'react';
import { pickDocument } from '../core/document';
import { notify } from '../core/notifications';
import { isMinor } from '../core/age';
import { submitVerificationDoc } from './repos';
import type { IdVerification, Player } from '../core/types';

export function useVerificationUpload(player: Pick<Player, 'id' | 'dob'>, onUploaded: (update: (prev: IdVerification | undefined) => IdVerification) => void) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const upload = async () => {
    const doc = await pickDocument();
    if (!doc) return;
    setUploading(true);
    setUploadError(null);
    try {
      // Throws (and marks nothing pending) when the file didn't upload.
      await submitVerificationDoc(player.id, doc);
      const at = Date.now();
      onUploaded((prev) => ({
        status: 'pending', docName: doc.name, submittedAt: at,
        history: [...(prev?.history ?? []), { action: 'submitted', at, docName: doc.name }],
      }));
      // Confirmation + the follow-up action (esp. the guardian step for minors).
      void notify({
        title: '📄 Proof of date of birth sent',
        body: isMinor(player.dob)
          ? "A reviewer will check it, usually within a few hours. Meanwhile: add your parent/guardian's details and verify their mobile & email."
          : "A reviewer will check it, usually within a few hours. You'll get a notification.",
      });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Couldn’t upload the document — please try again.');
    } finally {
      setUploading(false);
    }
  };

  return { upload, uploading, uploadError };
}
