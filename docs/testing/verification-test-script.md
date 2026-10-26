# Verification test script (age documents + school verification)

*Written 2026-10-26.* An end-to-end check on live of both review queues, from the person uploading to the reviewer deciding. It takes about 30 minutes. Run it after any change to verification, and as onboarding practice for a new support reviewer.

## What you need

- **Account A (the member):** a normal SportnNote account with a player profile, on the **Android phone with APK 41** (it can pick PDFs). Not the support account.
- **Account B (the reviewer):** the **support** account, on a **laptop browser** at app.sportnnote.in.
- **Two test files on the phone:**
  - a **PDF** (any page, e.g. a web page saved as PDF);
  - a **photo** of a sheet of paper with "TEST" written on it.

  Don't use real ID documents for a test.
- An email inbox you can read on the spot (your Gmail is fine).

> **Never ✓ Approve the test school.** Approval locks its official code. For the age test, only approve if the document is genuine and matches the profile; otherwise reject it.

---

## Part A — Upload an age document (Account A, phone)

1. **Profile → ✎ Edit profile:** make sure **Date of birth** is filled in, then save.
2. On **Profile**, find the **🛡️ Age & guardian verification** card.
3. Tap **📎 Upload proof of DOB (image / PDF)** and pick the **test PDF** from Files.
4. ✅ **Expect:** the card shows **⏳ Pending review**.

## Part B — Review it (Account B, laptop)

1. ✅ **Expect within about a minute:** an email to support@sportnnote.in (forwarded to your Gmail), and a notification if support has the app or web push on.
2. Open **Settings → 🛡️ Review verifications**. The support account also has the reviewer button on its empty profile.
3. ✅ **Expect** one card for the player, showing:
   - how long it has waited;
   - **Date of birth entered**;
   - **Parent / guardian** (for under-18s);
   - the document.
4. Tap **📄 Open \<file name\>.pdf**. ✅ **Expect:** the PDF opens in a new tab. Check that you can zoom and download it.
5. Under **If rejecting, why?** tap **Not an accepted type of document**, then **✗ Reject**.
6. ✅ **Expect:** the card leaves the queue.

## Part C — The member sees the result, and sends a photo (Account A)

1. ✅ **Expect:** a notification, and the card shows **✗ Rejected** with the **Support note** "Not an accepted type of document".
2. Tap **📎 Re-submit proof (image / PDF)** and pick the **test photo**.
3. **On the laptop (Account B):** the new card shows the **photo on the card itself**. Tap it to open full size.
4. Reject it again with **The photo is blurry or cut off** (or type your own reason in **Or type a reason**), then **✗ Reject**.

## Part D — Ask to verify a test school (Account A)

1. **Organize** tab → **🏛️ New community**.
2. Fill it in:
   - **Is it a registered organisation?** → **🏛️ Registered organisation**;
   - type **School**;
   - name **ZZ Test School – please ignore**;
   - **UDISE+ code:** `99999999901` (state 99 doesn't exist, so it can never be a real school).

   Then tap **Create community**.
3. On the community page, stay on the **Details** tab. On the **🛡️ Verification** card, tap **🛡️ Get verified**.
4. **Official ID:** the code is there. Tap **Save** → ✅ **✓ Saved**.
5. **Document:** pick a kind, e.g. *Board affiliation letter*, then **📎 Upload the document (image / PDF)**, then the **test PDF**. ✅ **Expect: ✓ Document uploaded**.
6. **Authority → Official school email:**
   - type the inbox you can read and tap **Email me a code**;
   - the email arrives from SportnNote <no-reply@sportnnote.in>;
   - type the 6 digits and tap **Confirm the code**.

   ✅ **Expect: ✓ Email confirmed**.
7. Tap **Send to SportnNote**. ✅ **Expect:** the card shows **📨 With SportnNote support**.

## Part E — Support reviews the school (Account B)

1. ✅ **Expect:** an email to support@ and a notification (support only).
2. **🛡️ Review verifications** → **🏫 Schools & colleges · 1**. ✅ **Expect** the card to show:
   - **Type**, **Sent by**, **Members**;
   - the **UDISE+ code** with **Search it on … ↗**;
   - the document;
   - **Verified email** (a free-mailbox note if it's Gmail);
   - the **Checklist**.
3. Tap **Search it on … ↗**. The public register opens. The code won't be found, which is expected for a fake code.
4. Tap **📄 Open …** for the document.
5. **Don't tick every checklist item.** Under **If sending back, why?** tap **ID not in the public register**, then **↩ Send back**.
6. ✅ **Expect:** "ZZ Test School – please ignore sent back — its admins have been told."

## Part F — The school admin sees it (Account A)

1. ✅ **Expect:** a notification. The **🛡️ Verification** card shows it was sent back, with the reason and **Fix it and send again**.

## Afterwards

- Documents are deleted automatically 30 days after each decision.
- The app can't delete a community yet, so the test community stays, clearly named. Ask for the SQL if you want it removed.
- Note anything that didn't match an ✅ above, with a screenshot of the step.

## Record of runs

- *(not run yet)*
