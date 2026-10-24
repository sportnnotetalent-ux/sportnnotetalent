# Legal templates — NDAs and IP assignment

*Prepared 2026-10-25 for the founder, as part of "make SportnNote hard to copy".*

> ⚠️ **These are templates drafted by Claude, not legal advice.**
> - Have an Indian lawyer review the whole pack once before first use, then reuse it.
> - Bring the questions at the end of this page.
> - Stamp duty, e-signature rules and data-protection rules change; the lawyer confirms the current position.

## What's in the pack

Word versions (to fill in and send) are in `docs/legal/docx/`. The Markdown files in `docs/legal/templates/` are the source. After editing a template, rebuild the Word files with:

```bash
python3 scripts/legal-docx.py
```

| # | Document | Use it for | Sign how |
|---|---|---|---|
| 01 | One-way NDA | Anyone you show **non-public** SportnNote material to and who shares nothing back: freelancers before you engage them, job candidates, advisors and mentors, testers of unreleased features, pilot partners shown the roadmap, vendors | E-signature is fine |
| 02 | Mutual NDA | **Both** sides share: integrations, league or federation partners, sponsors, other companies | E-signature is fine |
| 03 | Contractor agreement | Every freelancer, consultant or agency that **builds, designs, writes or tests** anything. Covers the work, payment, confidentiality and a full IP assignment | **Paper, wet ink, stamp paper, 2 witnesses** (contains a power of attorney) |
| 04 | Employee agreement | Every employee and **intern**, on or before day one, alongside the appointment or internship letter | **Paper, wet ink, stamp paper, 2 witnesses** (contains a power of attorney) |
| 05 | Founder IP assignment deed | **You → the company**, in weeks 1–2 after incorporation (COMPANY_SETUP.md, Step 4) | **Paper, wet ink, stamp paper, 2 witnesses**, plus a board resolution |
| 06 | Confirmatory assignment | Anyone who **already** contributed without a contract (see "Do now" below) | **Paper, wet ink, stamp paper, 2 witnesses** |

**When NOT to use an NDA:**
- **Ordinary users:** players, parents, schools and clubs using the app agree to the Terms of Service, which already cover the app and its data. Don't ask them to sign NDAs.
- **Investors:** most won't sign NDAs. Share a deck and a demo, never code or the database. Use 02 only if one asks for it.
- **Public material:** anything already public (the app, the website, the guides) needs no NDA.

## Why these clauses matter in India

- **Contractors don't hand over copyright by default:**
  - Under the Copyright Act, 1957, the author owns the work. Section 17(c) gives an employer ownership of work made by an employee in the course of employment, but **a freelancer keeps the copyright unless they assign it in writing**.
  - Section 19 requires the assignment to state the rights, the duration and the territory. If it doesn't, the assignment defaults to **5 years** and **India only**.
  - It also **lapses if not used within a year**, unless the assignment says otherwise.
  - Templates 03–06 deal with all three.
- **Moral rights** (section 57) can't be assigned. The templates get the author's agreement not to assert them, as far as the law allows.
- **Post-exit non-competes are void** under section 27 of the Indian Contract Act, 1872. The templates restrict competing work only **during** the engagement. They protect you after it through confidentiality, IP ownership and a narrow 12-month non-solicitation clause, whose enforceability the lawyer should confirm.
- **Children's data:**
  - Under the DPDP Act, 2023, a contractor who touches personal data is your **Data Processor** and must work under a contract.
  - Children's data has extra rules: verifiable parental consent, and no tracking or targeted advertising aimed at children.
  - Templates 03 and 04 include those terms.
- **AI tools:** every template stops people pasting SportnNote code or documents into AI tools you haven't approved, or tools that could train on them. This is the paper half of your concern about AI tools learning from SportnNote. The other half is your own account's "Help improve Claude" setting and using commercial plans.

## Filling them in

- Replace every `[BRACKETED]` item, delete the grey "Template" box, and remove clauses marked `[OPTIONAL]` that you don't need.
- **Company details:** after incorporation, use the company's exact name, CIN and registered office, for example *SportnNote Technologies Private Limited*.
- **Before incorporation:**
  - Use the italic "Before the Company is incorporated" wording in 01–03. You sign as promoter for the company to be incorporated, and the agreement passes to the company (Specific Relief Act, 1963, sections 15(h) and 19(e)).
  - Once the company exists, send each counterparty a short acceptance email, so there is a record of the company accepting the agreement:
    > "[COMPANY NAME] (CIN [CIN]) was incorporated on [DATE]. As provided in our [agreement] dated [DATE], the Company accepts that agreement and takes over all rights and obligations under it from [FOUNDER NAME]."
- **Purpose:** be specific in the Purpose (01, 02) and Schedule 1 (03). Narrow purposes are easier to enforce.
- **Agencies:** for an agency or a company as contractor, 03 binds the agency. Ask for the names of the people who will work on SportnNote, and confirm the agency has IP assignments from them.

## Signing and stamping

- **Stamp duty:**
  - Every agreement and deed here must be **stamped under Telangana's stamp law**, before or at signing. Buy e-stamp certificates (for example through SHCIL or an authorised vendor) for the amount the lawyer or CA confirms. The duty depends on the document type and, for assignments, the consideration.
  - An unstamped document can't be used as evidence in court until the duty and a penalty are paid (Indian Stamp Act, 1899, section 35).
- **E-signatures:**
  - Aadhaar eSign and similar providers (for example Leegality, Digio, Zoho Sign, DocuSign) are valid for agreements under the Information Technology Act, 2000, section 3A.
  - **However, a power of attorney can't be signed electronically** (IT Act, First Schedule). Templates 03, 04, 05 and 06 contain a power-of-attorney or deed element, so print them on the e-stamp paper and sign them in ink, with two witnesses who write their names and addresses.
- **Board resolution for 05:**
  - The company's board approves the deed and authorises a director to sign it.
  - Your wife and father are directors and your relatives, so you are a "related party" under the Companies Act, 2013. Ask the CS to handle the disclosure and approval formalities (sections 184 and 188) and minute them.
  - A director other than you signs for the company.
- **Copies:** sign two originals, one for each side, and scan the signed copy to PDF.

## Keeping records

- Store signed PDFs in a company-only drive folder (for example Legal/Signed), **not in this Git repository**.
- Keep the originals of 05 and 06 safe. Investors' lawyers will ask for them in due diligence.
- Keep a simple register (a spreadsheet in the same drive):

| Person / entity | Role | Document | Signed on | Stamped (₹, certificate no.) | Access granted on | Access removed on | File link |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

- **Rule:** signature first, access second. No one gets GitHub, Supabase, Expo or drive access before their 01, 03 or 04 is signed and stamped.
- **When someone leaves:** remove their access the same day, get written confirmation that they have deleted Confidential Information and data, and note both in the register.

## Do now — checklist

1. **Lawyer review** of the pack. Bring the questions below and your Salesforce agreement (COMPANY_SETUP.md, Step 0).
2. **Past contributor:**
   - Git shows one commit by someone other than you: **"likhithareddy39" (likhitha.sredutech@gmail.com), commit bec3655, 12 June 2026, "Initial commit"**. It was the Expo project scaffold.
   - Get a **06 confirmatory assignment** from them, in your name as Founder until the company exists. It's small, but it closes the only gap in the code's chain of ownership.
3. **SR Edutech:** if any SportnNote work was done or paid for through another business (for example sredutech, if it is a registered business), that business also signs a **06** through its authorised signatory.
4. **Anyone who currently sees code, data or plans:** a 01 now, or a 03 if they build anything.
5. **At incorporation (weeks 1–2):**
   - sign the **05** founder deed, with the board resolution;
   - transfer the accounts in Part G of its Schedule 1 (GitHub organisation, Expo, Supabase, Play Console app transfer, Cloudflare, domain registrar, Resend, Firebase, Meta, social handles);
   - send the acceptance emails for any agreements you signed as promoter;
   - update the privacy notice and Terms in the app (`src/data/legal.ts`) to name the company.
6. **From then on:** the right document, signed and stamped, **before** any access.

## Questions for the lawyer

1. **Stamp duty:** what is the current Telangana stamp duty for each document (NDA, contractor agreement, employee agreement, IP assignment deed for ₹[X] consideration)? Do 03 and 04 attract duty as a power of attorney as well as an agreement?
2. **Assignment wording:** is our section 19 wording (worldwide, full term, no lapse under 19(4)) sufficient? Should we also add a separate assignment form per delivery for large contracts?
3. **Moral rights:** is the moral-rights wording as strong as Indian law allows?
4. **Non-solicitation:** is the 12-month non-solicitation clause in 01, 03 and 04 likely to be enforceable, and should it be narrower?
5. **Disputes:** courts at Hyderabad, or arbitration (sole arbitrator, seat Hyderabad), especially for agencies and **foreign counterparties** (Gulf, UK and others in the international plan)?
6. **DPDP:** are the Data Processor terms in 03 and 04 enough under the DPDP Act and the rules in force? Do we need a separate data processing agreement with vendors such as Supabase, Expo or Resend, or do their standard terms suffice?
7. **Founder deed consideration:** cash or shares for the 05 deed, and the tax and Companies Act consequences of each?
8. **Employer:** does the Salesforce employment agreement give Salesforce any claim to SportnNote, and what wording should Recital B of the 05 deed use?
9. **Copyright registration:** should we register copyright in the SportnNote source code with the Copyright Office for evidential value, and in which version?
10. **Trade mark:** file **SportnNote** in which classes (9 for software, 41 for sports and tournament services, 42 for SaaS?), in the company's name, after incorporation?

## Beyond paper

Contracts work best alongside technical controls:
- **In place:**
  - the private repository and proprietary LICENSE;
  - no secrets in the repository;
  - the Terms of Service clause "Our app and its data", which bans scraping, bulk download and reverse engineering.
- **To do as people join:**
  - move the GitHub organisation into the company's name, and require multi-factor authentication for every member;
  - give least-privilege access, with no production data for contractors by default.
- **Later:** rate limits and anti-scraping hardening (see `docs/security/`).
