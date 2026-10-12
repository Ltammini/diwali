# Optional donations — Diwali 2026

## What changes

- Registrants may choose **no donation**, a suggested amount (€5, €10, €20), or a custom euro amount between €0 and €10,000 (two decimal places).
- The registration form and review show the **registration fees**, **optional donation**, and **total bank transfer amount** separately.
- Google Apps Script validates the donation and recomputes the amount due; the browser's total is not trusted.
- A new **Donation** column is appended to the *end* of the `Registrations` Google Sheet. The existing `Contribution` column remains the **total amount due** (fees + donation). Existing rows have an empty Donation cell, treated as €0.
- Payment instructions, the bank transfer page, and the payment-pending confirmation include the full transfer amount and donation breakdown.
- The payment instructions email thanks people for **choosing** to donate, without implying that payment was received. After manual verification, the QR ticket email thanks them for their **received donation**, including the exact amount.
- The admin dashboard shows donations **pledged** and donations **received** (verified PAID registrations only), and the CSV export includes the Donation column.
- A free registration with no donation still gets its QR ticket immediately. A free registration **with a donation** is pending until the pledged transfer is verified.

## Example

One regular adult (€20) + one student (€15) + optional donation (€10):

| Item | Amount |
| --- | ---: |
| Registration fees | €35.00 |
| Optional donation | €10.00 |
| **Total to transfer** | **€45.00** |

The existing registration ID is still the payment reference; no separate bank transfer is needed.

## Deployment and staging

**Do not deploy the frontend before the backend.** An old Apps Script backend would reject donation totals from the new form.

1. Back up the live Google Sheet before applying the new Apps Script schema.
2. For testing, use a **separate Google Sheet**, a separate Apps Script Web App deployment and a separate Cloudflare Worker pointing at the test `APPS_SCRIPT_URL`. Set `PAYMENT_SITE_URL` to the staging website URL.
3. Update the **staging** `Code.gs` first and deploy a **new Apps Script Web App version**. Its first registration/dashboard request will append the Donation column. The script assumes existing columns have not been reordered.
4. Deploy the GitHub feature branch to the **staging** Cloudflare Worker (not the production Worker). Configure the staging Worker's `APPS_SCRIPT_URL` to the staging Apps Script `/exec` URL.
5. Test the scenarios below. Merge to `main` only after acceptance.
6. For production, deploy the updated `Code.gs` first, then merge/deploy the Cloudflare frontend and Worker. **Merging GitHub does not deploy Apps Script.**

## Manual acceptance tests

- [ ] No donation: registration fee and bank transfer amount remain unchanged; no donation thank-you text appears.
- [ ] Suggested €5, €10, €20 buttons and custom €12.50 all update the displayed total.
- [ ] Negative amounts, more than two decimal places and amounts above €10,000 cannot be submitted.
- [ ] A €20 registration + €10 donation requests a single **€30** transfer with the normal registration reference.
- [ ] A paid registration with a donation shows payment pending, no QR; its email thanks the donor for **choosing** to donate €10.
- [ ] The payment instructions link displays the correct total and donation breakdown.
- [ ] The Google Sheet records Contribution = 30 and Donation = 10 in separate columns.
- [ ] The admin dashboard shows the donor's donation; pledged increases immediately and received increases only after verification.
- [ ] Confirm payment only after checking the bank receipt; the QR email thanks the donor for the exact amount.
- [ ] Confirm payment a second time; no duplicate QR email is sent.
- [ ] A child-only registration with €0 donation remains free; with a €5 donation it requires payment before a QR ticket is issued.
- [ ] Check existing registrations and check-in behavior are unaffected.

## Important

The donation is optional and is paid to the same SBCF bank account as the registration fee. This feature **does not initiate a bank transfer or automatically verify a payment**. Organizers must still verify incoming payments using the existing manual confirmation process. Avoid real bank transfers while testing.
