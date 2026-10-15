# API Changes — 2026-10-16

Covers all backend changes since the last update of `CURL_TESTING.md` (commit `a96ce5b`, 2026-10-09).
Base URL: `https://api.atomcapitol.com/api` · live schema: <https://api.atomcapitol.com/api/docs/>

**For the CustomerApp:** no endpoints were added, removed or renamed. **One request changed:** KYC
Step 2 now also takes Aadhaar and PAN card images (1.0). Everything else is a change in the **data**
endpoints return. Check the items marked **App action**.

---

## 1. CustomerApp changes

### 1.0 KYC Step 2 now requires Aadhaar and PAN card images (breaking)

`POST /customer/kyc/step2/` (multipart) takes three new file fields, uploaded together with the
receipt. The admin reviews them as part of Step 2, so there is no new step and no new status.

| Field | Required | Notes |
|---|---|---|
| `aadhaar_front` | **Yes** | Front of the Aadhaar card, or the e-Aadhaar PDF |
| `aadhaar_back` | No | Back of the Aadhaar card. Skip it if `aadhaar_front` is an e-Aadhaar PDF, which has both sides |
| `pan_card` | **Yes** | PAN card |

- Allowed types: `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `application/pdf`. Max 25 MB each.
- **First submission:** if `aadhaar_front` or `pan_card` is missing, the request returns `400`:
  ```json
  {"detail": "Validation failed.", "errors": {"aadhaar_front": ["This file is required."], "pan_card": ["This file is required."]}}
  ```
- **Resubmission after a rejection:** the ID files are optional. Any file you don't send stays as it
  was on record, so only re-upload what the admin asked for. `receipt_file` is still required on every Step 2 submission, as before.

```bash
curl -X POST $BASE/customer/kyc/step2/ -H "$CAUTH" \
  -F "plot_confirmed=true" \
  -F "receipt_file=@receipt.pdf;type=application/pdf" \
  -F "receipt_amount=100000" \
  -F "receipt_payment_date=2026-10-01" \
  -F "aadhaar_front=@aadhaar_front.jpg;type=image/jpeg" \
  -F "aadhaar_back=@aadhaar_back.jpg;type=image/jpeg" \
  -F "pan_card=@pan.jpg;type=image/jpeg"
```

The Step 2 response and `GET /customer/kyc/status/` now include `aadhaar_front`, `aadhaar_back` and
`pan_card`. Each is a file URL, or `null` if that file hasn't been uploaded.

**App action:**
- Add Aadhaar (front and back) and PAN capture or picker to the Step 2 screen, and send them in the same multipart request as the receipt.
- On the Rejected screen, use `kyc/status` to tell which ID files are already on record (not `null`), and require only the ones the rejection reason asks for.
- Older app versions that send only the receipt will now get `400` on a first submission.

### 1.1 Instalment 1 is now the KYC booking receipt

When an admin approves KYC Step 2, the receipt the customer uploaded in Step 2 becomes **instalment 1**,
already `PAID`. The rest of the balance is split evenly over instalments 2..N.

`GET /customer/payments/`. Example for a plot with `total_value` 15,00,000, 1,00,000 paid outside
the app, a 1,00,000 KYC receipt, and `instalment_count` 5:

```json
{
  "total_value": "1500000.00",
  "paid_total": "100000.00",
  "balance": "1400000.00",
  "remaining_instalments": 4,
  "next_due_date": "2026-11-16",
  "next_due_amount": "325000.00",
  "milestones": [
    {"id": 178, "sequence": 1, "name": "Instalment 1 of 5", "amount": "100000.00", "due_date": "2026-10-01", "status": "PAID", "paid_date": "2026-10-01"},
    {"id": 174, "sequence": 2, "name": "Instalment 2 of 5", "amount": "325000.00", "due_date": "2026-11-16", "status": "DUE", "paid_date": null},
    {"id": 175, "sequence": 3, "name": "Instalment 3 of 5", "amount": "325000.00", "due_date": "2026-12-16", "status": "UPCOMING", "paid_date": null}
  ]
}
```

Instalment 1 has:

| Field | Value |
|---|---|
| `status` | `PAID` |
| `amount` | the Step 2 `receipt_amount` (or the admin-verified total, see 1.4) |
| `due_date` / `paid_date` | the Step 2 `receipt_payment_date` |
| `description` | `"Booking payment submitted with KYC"` |
| `payment_mode` | `"KYC receipt"`, or the admin's verified payment method(s), e.g. `"NEFT, UPI"` |
| `latest_proof` | the Step 2 receipt file, status `APPROVED` |

**App action:**
- The first instalment the customer can pay is now `sequence: 2`. Don't assume the first milestone is payable. Keep using `status` (`DUE` / `OVERDUE`) to decide what can be paid.
- Show instalment 1 as a normal paid instalment. Its proof is the KYC receipt, not an upload made through `/pay/`.
- `instalment_count` (shown as "Instalment X of N") counts instalment 1.

Plots that already had a schedule before this change don't get an extra instalment 1. Their
schedule stays as it was.

### 1.2 Paying a different amount than the instalment is now supported

`POST /customer/payments/{id}/pay/` is unchanged (the same `claimed_amount` field), but admins can now
**approve** a proof whose `claimed_amount` differs from the milestone `amount`. Before this change, a
short amount could only be rejected.

When that happens:
- the milestone's `amount` is changed to what was actually paid, and it becomes `PAID`;
- the admin re-plans the remaining balance, so **the amounts, due dates, names and number of the
  remaining unpaid milestones can change**;
- the customer gets the usual "payment approved" notification (deep link `milestone:<id>`).

**App action:**
- Don't cache milestone amounts or due dates. Re-fetch `/customer/payments/` after a payment is approved.
- Keep allowing the customer to enter an amount other than the instalment amount on the pay screen.
  It no longer means an automatic rejection. You may want to show a hint such as "The remaining
  schedule will be adjusted after verification."

### 1.3 Payment receipt PDFs have a new layout

Receipts in `GET /customer/documents/` (`doc_type: PAYMENT_RECEIPT`) and the `receipt` object on
`GET /customer/payments/{id}/` are now:
- printed on the company letterhead with a stamp and signature;
- a table with one row per payment (Payment By, Payment date, Bank, Chq./Ref.No., Amount), with
  amounts in Indian format (`1,01,000/-`) and dates as `DD.MM.YYYY`;
- followed by a Terms & Conditions page.

The document name is still `Receipt - <milestone name>`. Nothing changes in the JSON. Only the PDF looks different.

**Receipts can be re-issued:** an admin can regenerate a paid milestone's receipt (for example after
a correction). The old receipt is **hidden** from `/customer/documents/` and the new one appears in its place.

**App action:** don't keep document IDs or URLs from earlier lists. Always use the latest list.

### 1.4 First receipt issued at KYC approval

If the admin chooses "Approve & generate receipt" on KYC Step 2, a `PAYMENT_RECEIPT` document for
instalment 1 appears in `/customer/documents/` right after approval. Otherwise instalment 1 has no
generated receipt (its proof is still the uploaded KYC receipt).

### 1.5 Plot size is now a number in square yards

`size` on `/customer/plot/` and `/customer/kyc/plot-check/` is now a plain number of **square yards**
on new plots, e.g. `"150"`. It used to be free text like `"1200 sq.ft"`. Older plots keep their old
text, e.g. `"122.80 sq. yd."`.

**App action:** if `size` is a number, show it as `"<size> sq. yd"`. Otherwise show it as it is.

`total_value` is unchanged. Plot pricing fields (`rate_per_sq_yd`, `plc_percent`, `plc_type`) are
**not** exposed to the CustomerApp.

### 1.6 Unchanged for the app

The following endpoints are unchanged:
- auth (`/customer/auth/*`), and the KYC endpoints other than Step 2 (plot-check and step3 are unchanged; status only gains the three ID fields);
- profile, settings, tickets and notifications;
- banners, sales contact and `/public/settings/`.

---

## 2. Admin API changes (admin portal)

| Endpoint | Change |
|---|---|
| `POST /admin/plots/`, `PATCH /admin/plots/{id}/` | New fields `rate_per_sq_yd` (required when `size`/rate is set), `plc_percent` (0–100, default 0), `plc_type` (e.g. "Corner"). `size` must be a positive number in sq. yd. `price` is now **read-only**, calculated as `size × rate_per_sq_yd × (1 + plc_percent/100)`. |
| `POST /admin/plots/bulk-import/` | CSV columns are now `plot_number,size,block_sector,rate_per_sq_yd,plc_percent,plc_type` (no `price`). The file may start with an Excel byte-order mark (BOM). |
| `POST /admin/plots/{id}/assign/`, `POST /admin/plots/bulk-assign/`, `PATCH /admin/plots/{id}/` | `instalment_count` minimum is now **2** (instalment 1 is the KYC receipt). |
| `POST /admin/plots/{id}/generate-schedule/` | Builds instalments 2..N only. Returns 400 only if instalments ≥ 2 already exist, so a plot with only the KYC instalment 1 can still be generated. |
| `GET /admin/kyc-queue/{id}/` | New `first_payment_receipt`: `{id, name, url, created_at}` or `null`. New `aadhaar_front`, `aadhaar_back`, `pan_card` (file URLs or `null`). The review page shows them under the receipt. |
| `POST /admin/kyc-queue/{id}/decide/` | New optional `receipt_entries` (only with `step2_decision: "APPROVED"`). Instalment 1's amount is the sum of the entries, and a receipt PDF is issued. See the example below. |
| `POST /admin/payment-verification-queue/{id}/approve/` | `corrected_amount` / `corrected_date` **removed**. New optional `schedule` (list of `{name, amount, due_date}`), **required** when `claimed_amount` ≠ milestone amount. New error codes: `schedule_required`, `schedule_total_mismatch`, `overpaid_balance`. `short_payment` no longer exists. |
| `POST /admin/milestones/{id}/regenerate-receipt/` | **New.** Re-issues the receipt PDF for a `PAID` milestone and hides the previous one from the customer. Errors: `not_paid`, `no_customer`. |
| `GET/PATCH /admin/settings/` | New field `receipt_terms` (text printed as the last page of receipts). |
| `GET /admin/settings/receipt-terms.pdf` | **New** (SUPER_ADMIN). Downloads the terms as a letterhead PDF. |

KYC Step 2 approval with receipt entries:

```json
POST /admin/kyc-queue/{id}/decide/
{
  "step2_decision": "APPROVED",
  "receipt_entries": [
    {"payment_by": "NEFT", "payment_date": "2026-10-01", "bank": "HDFC Bank", "reference": "UTR123", "amount": "100000"}
  ]
}
```

Approving a payment whose amount doesn't match. The schedule must add up to what's left to pay
(within ₹1):

```json
POST /admin/payment-verification-queue/{id}/approve/
{
  "schedule": [
    {"name": "Instalment 3 of 5", "amount": "475000", "due_date": "2026-12-16"},
    {"name": "Instalment 4 of 5", "amount": "325000", "due_date": "2027-01-16"},
    {"name": "Instalment 5 of 5", "amount": "325000", "due_date": "2027-02-16"}
  ]
}
```

Error format is unchanged: `{"detail": "...", "errors": {"code": "<code>"}}`.
