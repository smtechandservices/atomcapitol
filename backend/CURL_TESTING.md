# Atom Capitol Backend — curl Testing Guide

Every endpoint in the API as runnable `curl` commands, in the order you'd exercise them:
admin sets up data → customer onboards → admin reviews → payments cycle → everything else.

Run the blocks **top to bottom in one terminal**. Each block reads the ids it needs
(`PROJECT_ID`, `MILESTONE_ID`, …) from earlier responses, so nothing is hardcoded and the
whole file works against a fresh database.

## Prerequisites

```bash
# Terminal 1 — run the server
cd backend
source venv/bin/activate
python manage.py runserver
```

You need one admin superuser (once):

```bash
cd backend && source venv/bin/activate
python manage.py createsuperuser --email admin@atomcapitol.com
# password used below: Admin@12345
```

Customer OTPs print to the `runserver` console (dev uses the console email backend). If
`OTP_BYPASS_CODE` is set in `backend/.env` and `DEBUG` is on, that code works for any
eligible customer too.

`jq` pulls ids out of responses (`brew install jq`).

```bash
# Terminal 2 — everything below
BASE=http://127.0.0.1:8000/api
HOST=${BASE%/api}
```

### Test files

Images (project photos, banners, sales-person headshots) are checked by Pillow, so they must
be real images. Receipts, proofs, videos and documents are only checked for content type and
size (25 MB max), so dummy files are fine.

```bash
# 1x1 PNG — a valid image, no Python needed
echo 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' \
  | base64 --decode > /tmp/photo.png

printf '%%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%%%EOF\n' \
  > /tmp/doc.pdf
echo "dummy video content" > /tmp/kyc_video.mp4
echo "Upload fails at 90% — app v1.4.2, Android 14" > /tmp/app_log.txt
```

### Conventions

- Lists are paginated (20 per page): `{count, next, previous, results: [...]}`. Use `?page=2`.
- Errors always look like `{"detail": "...", "errors": {...}}`.
- File uploads use `-F` (multipart). Don't set `Content-Type` yourself for those; curl adds the boundary.
- Every `PATCH` below also works as `PUT` with the full object.
- Access tokens last 60 minutes; refresh with `/auth/token/refresh/` (section 23).

---

## 0. Health & public endpoints (no auth)

```bash
curl -s $BASE/health/ | jq .

# bank/UPI details + support contact, also usable before login
curl -s $BASE/public/settings/ | jq .
```

---

## 1. Admin auth

```bash
curl -s -X POST $BASE/admin/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@atomcapitol.com","password":"Admin@12345"}' | tee /tmp/admin_login.json | jq .

ADMIN_ACCESS=$(jq -r .access /tmp/admin_login.json)
ADMIN_REFRESH=$(jq -r .refresh /tmp/admin_login.json)

# every admin call below reuses:
AUTH="Authorization: Bearer $ADMIN_ACCESS"
```

Roles: `SUPER_ADMIN` (everything), `KYC_REVIEWER` (KYC queue), `ACCOUNTS` (projects, plots,
payments, documents), `SUPPORT` (tickets). The superuser is `SUPER_ADMIN`.

---

## 2. Admin — Admin Users & Roles (SUPER_ADMIN only)

```bash
curl -s $BASE/admin/admin-users/ -H "$AUTH" | jq .
curl -s "$BASE/admin/admin-users/?role=SUPPORT&is_active=true&search=atom" -H "$AUTH" | jq .

# create one user per role (used later)
curl -s -X POST $BASE/admin/admin-users/ -H "$AUTH" -H "Content-Type: application/json" -d '{
  "email": "reviewer@atomcapitol.com", "first_name": "Kavya", "last_name": "Reviewer",
  "role": "KYC_REVIEWER", "password": "Reviewer@123"
}' | tee /tmp/reviewer.json | jq .
REVIEWER_ID=$(jq -r .id /tmp/reviewer.json)

curl -s -X POST $BASE/admin/admin-users/ -H "$AUTH" -H "Content-Type: application/json" -d '{
  "email": "accounts@atomcapitol.com", "first_name": "Arjun", "role": "ACCOUNTS", "password": "Accounts@123"
}' | jq .

curl -s -X POST $BASE/admin/admin-users/ -H "$AUTH" -H "Content-Type: application/json" -d '{
  "email": "support@atomcapitol.com", "first_name": "Sneha", "role": "SUPPORT", "password": "Support@123"
}' | tee /tmp/support.json | jq .
SUPPORT_ID=$(jq -r .id /tmp/support.json)

# detail / update
curl -s $BASE/admin/admin-users/$REVIEWER_ID/ -H "$AUTH" | jq .
curl -s -X PATCH $BASE/admin/admin-users/$REVIEWER_ID/ -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"last_name": "Iyer", "is_active": true}' | jq .

# delete (throwaway user)
TEMP_ADMIN_ID=$(curl -s -X POST $BASE/admin/admin-users/ -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"email":"temp@atomcapitol.com","role":"SUPPORT","password":"Temp@12345"}' | jq -r .id)
curl -s -X DELETE $BASE/admin/admin-users/$TEMP_ADMIN_ID/ -H "$AUTH" -w "HTTP:%{http_code}\n"
```

---

## 3. Admin — Projects (Townships)

```bash
curl -s $BASE/admin/projects/ -H "$AUTH" | jq .
curl -s "$BASE/admin/projects/?development_status=UNDER_CONSTRUCTION&search=pune" -H "$AUTH" | jq .

curl -s -X POST $BASE/admin/projects/ -H "$AUTH" \
  -F "name=Green Valley Township" \
  -F "location=Pune" \
  -F "description=A premium gated township" \
  -F "development_status=UNDER_CONSTRUCTION" | tee /tmp/project.json | jq .
PROJECT_ID=$(jq -r .id /tmp/project.json)

curl -s $BASE/admin/projects/$PROJECT_ID/ -H "$AUTH" | jq .
curl -s -X PATCH $BASE/admin/projects/$PROJECT_ID/ -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"description": "Updated description"}' | jq .

# gallery / layout images (image_type: GALLERY | LAYOUT)
curl -s -X POST $BASE/admin/projects/$PROJECT_ID/images/ -H "$AUTH" \
  -F "image_type=GALLERY" -F "caption=Clubhouse" -F "image=@/tmp/photo.png;type=image/png" \
  | tee /tmp/project_image.json | jq .
IMAGE_ID=$(jq -r .id /tmp/project_image.json)
curl -s -X DELETE $BASE/admin/projects/$PROJECT_ID/images/$IMAGE_ID/ -H "$AUTH" -w "HTTP:%{http_code}\n"

# publish / unpublish (customers only see published projects)
curl -s -X POST $BASE/admin/projects/$PROJECT_ID/unpublish/ -H "$AUTH" | jq .
curl -s -X POST $BASE/admin/projects/$PROJECT_ID/publish/ -H "$AUTH" | jq .

# delete (SUPER_ADMIN) — check first; blocked while plots have buyers or payments
curl -s $BASE/admin/projects/$PROJECT_ID/delete-check/ -H "$AUTH" | jq .
TEMP_PROJECT_ID=$(curl -s -X POST $BASE/admin/projects/ -H "$AUTH" -F "name=Temp Project" -F "location=Nowhere" | jq -r .id)
curl -s -X DELETE $BASE/admin/projects/$TEMP_PROJECT_ID/ -H "$AUTH" -w "HTTP:%{http_code}\n"
```

---

## 4. Admin — Plot Inventory

```bash
curl -s -X POST $BASE/admin/plots/ -H "$AUTH" -H "Content-Type: application/json" -d "{
  \"project\": $PROJECT_ID, \"plot_number\": \"A-101\", \"size\": \"1200 sq.ft\",
  \"block_sector\": \"A\", \"price\": \"1500000\"
}" | tee /tmp/plot.json | jq .
PLOT_ID=$(jq -r .id /tmp/plot.json)

curl -s "$BASE/admin/plots/?project=$PROJECT_ID&status=AVAILABLE" -H "$AUTH" | jq .
curl -s $BASE/admin/plots/$PLOT_ID/ -H "$AUTH" | jq .
curl -s -X PATCH $BASE/admin/plots/$PLOT_ID/ -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"size": "1250 sq.ft"}' | jq .

# assign the buyer — this is what lets the email log in to the app. With total_value +
# instalment_count the monthly milestone plan is generated straight away.
curl -s -X POST $BASE/admin/plots/$PLOT_ID/assign/ -H "$AUTH" -H "Content-Type: application/json" -d '{
  "email": "buyer@example.com", "role": "PRIMARY", "name": "Test Buyer", "phone": "9999999999",
  "total_value": "1500000", "amount_paid_outside_app": "100000", "instalment_count": 5
}' | jq .

# co-applicant on the same plot
curl -s -X POST $BASE/admin/plots/$PLOT_ID/assign/ -H "$AUTH" -H "Content-Type: application/json" -d '{
  "email": "coapplicant@example.com", "role": "CO_APPLICANT", "name": "Co Applicant"
}' | jq .

curl -s $BASE/admin/plots/$PLOT_ID/history/ -H "$AUTH" | jq .
curl -s $BASE/admin/plots/$PLOT_ID/delete-check/ -H "$AUTH" | jq .

BUYER_ID=$(curl -s "$BASE/admin/customers/?search=buyer@example.com" -H "$AUTH" | jq -r '.results[0].id')
COAPP_ID=$(curl -s "$BASE/admin/customers/?search=coapplicant@example.com" -H "$AUTH" | jq -r '.results[0].id')
echo "buyer=$BUYER_ID coapplicant=$COAPP_ID"
```

Bulk CSV import / assignment:

```bash
cat > /tmp/plots.csv <<'EOF'
plot_number,size,block_sector,price
A-102,1000 sq.ft,A,1200000
A-103,1500 sq.ft,B,1800000
EOF
curl -s -X POST $BASE/admin/plots/bulk-import/ -H "$AUTH" \
  -F "project=$PROJECT_ID" -F "file=@/tmp/plots.csv;type=text/csv" | jq .

cat > /tmp/assignments.csv <<'EOF'
project,plot_number,email,role,name,phone,total_value,amount_paid_outside_app,instalment_count
Green Valley Township,A-102,buyer2@example.com,PRIMARY,Second Buyer,8888888888,1200000,0,4
EOF
curl -s -X POST $BASE/admin/plots/bulk-assign/ -H "$AUTH" -F "file=@/tmp/assignments.csv;type=text/csv" | jq .
```

Transfer / unassign / generate schedule (on the second plot, so the main buyer above keeps access):

```bash
PLOT2_ID=$(curl -s "$BASE/admin/plots/?project=$PROJECT_ID&search=A-102" -H "$AUTH" | jq -r '.results[0].id')
BUYER2_ID=$(curl -s "$BASE/admin/customers/?search=buyer2@example.com" -H "$AUTH" | jq -r '.results[0].id')

# transfer the primary buyer to a new email (old email loses app access)
curl -s -X POST $BASE/admin/plots/$PLOT2_ID/transfer/ -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"customer_id\": $BUYER2_ID, \"new_email\": \"newbuyer@example.com\", \"reason\": \"Resale\"}" | jq .

# unassign (revokes app access immediately)
NEWBUYER_ID=$(curl -s "$BASE/admin/customers/?search=newbuyer@example.com" -H "$AUTH" | jq -r '.results[0].id')
curl -s -X POST $BASE/admin/plots/$PLOT2_ID/unassign/ -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"customer_id\": $NEWBUYER_ID, \"reason\": \"Booking cancelled\"}" | jq .

# milestones only auto-generate when total_value + instalment_count were given at assignment.
# Generate for a plot that has none yet (400 if it already has milestones or lacks those values):
PLOT3_ID=$(curl -s "$BASE/admin/plots/?project=$PROJECT_ID&search=A-103" -H "$AUTH" | jq -r '.results[0].id')
curl -s -X POST $BASE/admin/plots/$PLOT3_ID/assign/ -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"email": "buyer3@example.com", "role": "PRIMARY", "name": "Third Buyer"}' | jq .
curl -s -X PATCH $BASE/admin/plots/$PLOT3_ID/ -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"total_value": "1800000", "instalment_count": 6}' | jq '{id, total_value, instalment_count}'
curl -s -X POST $BASE/admin/plots/$PLOT3_ID/generate-schedule/ -H "$AUTH" | jq .

# delete (throwaway plot)
TEMP_PLOT_ID=$(curl -s -X POST $BASE/admin/plots/ -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"project\": $PROJECT_ID, \"plot_number\": \"TMP-1\", \"size\": \"900 sq.ft\", \"price\": \"900000\"}" | jq -r .id)
curl -s -X DELETE $BASE/admin/plots/$TEMP_PLOT_ID/ -H "$AUTH" -w "HTTP:%{http_code}\n"
```

---

## 5. CustomerApp — Login (email → OTP)

```bash
curl -s -X POST $BASE/customer/auth/login/ -H "Content-Type: application/json" \
  -d '{"email":"buyer@example.com"}' | jq .
# -> "OTP sent to your registered email." — the code prints in Terminal 1

# resend: 429 if called within 60s of the last send
curl -s -X POST $BASE/customer/auth/resend-otp/ -H "Content-Type: application/json" \
  -d '{"email":"buyer@example.com"}' -w "\nHTTP:%{http_code}\n"

OTP=123456   # <-- replace with the code from the server console (or OTP_BYPASS_CODE)
curl -s -X POST $BASE/customer/auth/verify-otp/ -H "Content-Type: application/json" \
  -d "{\"email\":\"buyer@example.com\",\"code\":\"$OTP\"}" | tee /tmp/customer_login.json | jq .

CUST_ACCESS=$(jq -r .access /tmp/customer_login.json)
CUST_REFRESH=$(jq -r .refresh /tmp/customer_login.json)
CAUTH="Authorization: Bearer $CUST_ACCESS"
# "next_route": onboarding | pending | rejected | home — the app routes off this field
```

An email that isn't registered or has no plot gets a 404 with the support contact instead of an OTP:

```bash
curl -s -X POST $BASE/customer/auth/login/ -H "Content-Type: application/json" \
  -d '{"email":"nobody@example.com"}' -w "\nHTTP:%{http_code}\n"
```

---

## 6. CustomerApp — KYC (Step 2 + Step 3)

These work before KYC approval (customer token only).

```bash
# Step 2a: plot details to confirm
curl -s $BASE/customer/kyc/plot-check/ -H "$CAUTH" | jq .

# Step 2b: confirm the plot + upload the first payment receipt
curl -s -X POST $BASE/customer/kyc/step2/ -H "$CAUTH" \
  -F "plot_confirmed=true" \
  -F "receipt_file=@/tmp/doc.pdf;type=application/pdf" \
  -F "receipt_amount=100000" \
  -F "receipt_payment_date=2026-09-01" | jq .

# ...or flag a mismatch instead of confirming (also allowed as a resubmission)
curl -s -X POST $BASE/customer/kyc/step2/ -H "$CAUTH" \
  -F "plot_confirmed=false" \
  -F "plot_mismatch_note=Plot size on file looks wrong" \
  -F "receipt_file=@/tmp/doc.pdf;type=application/pdf" \
  -F "receipt_amount=100000" \
  -F "receipt_payment_date=2026-09-01" -w "\nHTTP:%{http_code}\n"

# Step 3: lines to read aloud, then upload the recorded video
curl -s $BASE/customer/kyc/step3/ -H "$CAUTH" | jq .
curl -s -X POST $BASE/customer/kyc/step3/ -H "$CAUTH" \
  -F "video_file=@/tmp/kyc_video.mp4;type=video/mp4" | jq .

# 4.7/4.8/4.9 — poll this to drive the Pending / Rejected screens
curl -s $BASE/customer/kyc/status/ -H "$CAUTH" | jq .
```

---

## 7. Admin — KYC Review Queue (KYC_REVIEWER, SUPER_ADMIN)

```bash
curl -s $BASE/admin/kyc-queue/ -H "$AUTH" | jq .
# ?view=queue (default) | approved | rejected | all
# queue-only filters: ?needs=step2|step3|both  ?flagged=true  ?stale=true   + ?search= ?ordering=
curl -s "$BASE/admin/kyc-queue/?needs=both&search=buyer" -H "$AUTH" | jq .
curl -s $BASE/admin/kyc-queue/stats/ -H "$AUTH" | jq .

SUBMISSION_ID=$(curl -s "$BASE/admin/kyc-queue/?search=buyer@example.com" -H "$AUTH" | jq -r '.results[0].id')
curl -s $BASE/admin/kyc-queue/$SUBMISSION_ID/ -H "$AUTH" | jq .
# response includes "queue": {next_id, pending_count}

# reject one step with a reason (the customer can redo just that step)...
curl -s -X POST $BASE/admin/kyc-queue/$SUBMISSION_ID/decide/ -H "$AUTH" -H "Content-Type: application/json" -d '{
  "step2_decision": "REJECTED", "step2_reason": "Receipt amount does not match the booking value"
}' | jq '{step2_status, step3_status, kyc_status}'

# ...customer resubmits step 2...
curl -s -X POST $BASE/customer/kyc/step2/ -H "$CAUTH" \
  -F "plot_confirmed=true" -F "receipt_file=@/tmp/doc.pdf;type=application/pdf" \
  -F "receipt_amount=100000" -F "receipt_payment_date=2026-09-01" | jq '{step2_status, step3_status}'

# ...then approve both -> unlocks the app for the customer
curl -s -X POST $BASE/admin/kyc-queue/$SUBMISSION_ID/decide/ -H "$AUTH" -H "Content-Type: application/json" -d '{
  "step2_decision": "APPROVED", "step3_decision": "APPROVED"
}' | jq '{step2_status, step3_status, kyc_status}'
```

---

## 8. CustomerApp — Profile, Settings, Plot

Everything from here on in the CustomerApp needs KYC `APPROVED` (403 otherwise).
`/customer/settings/` is the exception: it works at any KYC stage.

```bash
curl -s $BASE/customer/profile/ -H "$CAUTH" | jq .

# "Request correction" raises a support ticket instead of editing the field
curl -s -X POST $BASE/customer/profile/request-correction/ -H "$CAUTH" -H "Content-Type: application/json" -d '{
  "field": "phone", "current_value": "9999999999", "requested_value": "9876543210", "note": "Number changed"
}' | jq .

curl -s $BASE/customer/settings/ -H "$CAUTH" | jq .
curl -s -X PATCH $BASE/customer/settings/ -H "$CAUTH" -H "Content-Type: application/json" \
  -d '{"notify_email": true, "notify_push": false, "language": "en"}' | jq .

# township + plot details
curl -s $BASE/customer/plot/ -H "$CAUTH" | jq .

# sales contact: 404 until a sales person is assigned (section 19)
curl -s $BASE/customer/sales-contact/ -H "$CAUTH" -w "\nHTTP:%{http_code}\n"
```

---

## 9. CustomerApp — Payments & Milestones

```bash
# totals, next due, milestone list (?status=UPCOMING|DUE|OVERDUE|UNDER_REVIEW|PAID)
curl -s $BASE/customer/payments/ -H "$CAUTH" | tee /tmp/payments.json | jq .
curl -s "$BASE/customer/payments/?status=DUE" -H "$CAUTH" | jq .

MILESTONE_ID=$(jq -r '[.milestones[] | select(.status=="DUE" or .status=="OVERDUE")][0].id' /tmp/payments.json)
MILESTONE_AMOUNT=$(jq -r "[.milestones[] | select(.id==$MILESTONE_ID)][0].amount" /tmp/payments.json)
curl -s $BASE/customer/payments/$MILESTONE_ID/ -H "$CAUTH" | jq .

# pay & upload proof against a DUE/OVERDUE milestone -> it flips to UNDER_REVIEW
curl -s -X POST $BASE/customer/payments/$MILESTONE_ID/pay/ -H "$CAUTH" \
  -F "file=@/tmp/doc.pdf;type=application/pdf" \
  -F "claimed_amount=$MILESTONE_AMOUNT" \
  -F "payment_date=2026-10-05" \
  -F "payment_mode=UPI" \
  -F "transaction_reference=TXN123" | jq '{id, status, latest_proof}'

# paying it again while under review -> 400 not_payable
curl -s -X POST $BASE/customer/payments/$MILESTONE_ID/pay/ -H "$CAUTH" \
  -F "file=@/tmp/doc.pdf;type=application/pdf" -F "claimed_amount=$MILESTONE_AMOUNT" \
  -F "payment_date=2026-10-05" -w "\nHTTP:%{http_code}\n"

# milestone change requests (the current plan stays live until admin decides)
# change_type: PAY_MORE | PAY_LESS | CHANGE_DATE | CHANGE_INSTALMENTS | RESPLIT
curl -s $BASE/customer/payments/change-requests/ -H "$CAUTH" | jq .
for TYPE in CHANGE_INSTALMENTS CHANGE_DATE RESPLIT; do
  curl -s -X POST $BASE/customer/payments/change-requests/ -H "$CAUTH" -H "Content-Type: application/json" \
    -d "{\"change_type\": \"$TYPE\", \"proposed_details\": {\"note\": \"example\"}, \"reason\": \"Need smaller instalments\"}" \
    | jq '{id, change_type, status}'
done

# with an attachment (multipart)
curl -s -X POST $BASE/customer/payments/change-requests/ -H "$CAUTH" \
  -F "change_type=PAY_LESS" -F 'proposed_details={"amount": "150000"}' -F "reason=Cash crunch this month" \
  -F "attachment=@/tmp/doc.pdf;type=application/pdf" -w "\nHTTP:%{http_code}\n"
```

---

## 10. Admin — Payment Verification Queue (ACCOUNTS, SUPER_ADMIN)

```bash
# ?status=PENDING (default) | APPROVED | REJECTED | all ; pending-only: ?mismatch=true ?stale=true
curl -s $BASE/admin/payment-verification-queue/ -H "$AUTH" | jq .
curl -s "$BASE/admin/payment-verification-queue/?status=all&search=buyer" -H "$AUTH" | jq .
curl -s $BASE/admin/payment-verification-queue/stats/ -H "$AUTH" | jq .

PROOF_ID=$(curl -s $BASE/admin/payment-verification-queue/ -H "$AUTH" | jq -r '.results[0].id')

# approve (optionally correct amount/date; an amount below the milestone is refused)
curl -s -X POST $BASE/admin/payment-verification-queue/$PROOF_ID/approve/ -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"corrected_date": "2026-10-04"}' | jq '{id, status, claimed_amount}'
# -> milestone PAID, PDF receipt added to the customer's Documents + a notification

# the next instalment is now DUE: pay it, then reject that proof
NEXT_ID=$(curl -s $BASE/customer/payments/ -H "$CAUTH" | jq -r '[.milestones[] | select(.status=="DUE" or .status=="OVERDUE")][0].id')
NEXT_AMOUNT=$(curl -s $BASE/customer/payments/$NEXT_ID/ -H "$CAUTH" | jq -r .amount)
curl -s -X POST $BASE/customer/payments/$NEXT_ID/pay/ -H "$CAUTH" \
  -F "file=@/tmp/doc.pdf;type=application/pdf" -F "claimed_amount=$NEXT_AMOUNT" \
  -F "payment_date=2026-10-06" -F "transaction_reference=TXN124" | jq '{id, status}'

PROOF2_ID=$(curl -s $BASE/admin/payment-verification-queue/ -H "$AUTH" | jq -r '.results[0].id')
curl -s -X POST $BASE/admin/payment-verification-queue/$PROOF2_ID/reject/ -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"reason": "Screenshot is unreadable, please re-upload"}' | jq '{id, status, rejection_reason}'
# -> milestone back to DUE, customer can upload again
```

---

## 11. Admin — Milestones (per-plot editing, ACCOUNTS / SUPER_ADMIN)

```bash
curl -s "$BASE/admin/milestones/?plot=$PLOT_ID" -H "$AUTH" | jq .
# filters: plot, plot__project, status, status__in=OVERDUE,DUE, due_date__gte/lte, search, ordering
curl -s "$BASE/admin/milestones/?status__in=OVERDUE,DUE&ordering=due_date" -H "$AUTH" | jq .
curl -s "$BASE/admin/milestones/stats/?plot__project=$PROJECT_ID" -H "$AUTH" | jq .

LAST_MS_ID=$(curl -s "$BASE/admin/milestones/?plot=$PLOT_ID&ordering=-sequence" -H "$AUTH" | jq -r '.results[0].id')
curl -s $BASE/admin/milestones/$LAST_MS_ID/ -H "$AUTH" | jq .
curl -s -X PATCH $BASE/admin/milestones/$LAST_MS_ID/ -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"admin_remarks": "Adjusted per request"}' | jq '{id, amount, admin_remarks}'

# add an ad-hoc milestone, then remove it
ADHOC_ID=$(curl -s -X POST $BASE/admin/milestones/ -H "$AUTH" -H "Content-Type: application/json" -d "{
  \"plot\": $PLOT_ID, \"sequence\": 99, \"name\": \"Ad-hoc charge\", \"amount\": \"5000\", \"due_date\": \"2027-12-01\"
}" | jq -r .id)
curl -s -X DELETE $BASE/admin/milestones/$ADHOC_ID/ -H "$AUTH" -w "HTTP:%{http_code}\n"
```

---

## 12. Admin — Milestone Change Requests (ACCOUNTS, SUPER_ADMIN)

```bash
curl -s $BASE/admin/milestone-change-requests/ -H "$AUTH" | jq .
# filters: status, plot, plot__project, change_type, search, ordering
curl -s "$BASE/admin/milestone-change-requests/?status=PENDING&plot=$PLOT_ID" -H "$AUTH" | jq .

CR_IDS=($(curl -s "$BASE/admin/milestone-change-requests/?status=PENDING&ordering=created_at" -H "$AUTH" | jq -r '.results[].id'))
curl -s $BASE/admin/milestone-change-requests/${CR_IDS[0]}/ -H "$AUTH" | jq .

# decline
curl -s -X POST $BASE/admin/milestone-change-requests/${CR_IDS[0]}/decline/ -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"reason": "Cannot extend beyond project completion date"}' | jq '{id, status, admin_response}'

# counter-propose a schedule (customer sees it; nothing changes yet)
curl -s -X POST $BASE/admin/milestone-change-requests/${CR_IDS[1]}/counter/ -H "$AUTH" -H "Content-Type: application/json" -d '{
  "schedule": [
    {"name": "Instalment A", "amount": "400000", "due_date": "2027-01-20"},
    {"name": "Instalment B", "amount": "440000", "due_date": "2027-03-20"}
  ],
  "note": "Here is a 2-instalment alternative"
}' | jq '{id, status, counter_schedule}'

# approve — replaces every unpaid, not-under-review milestone with this schedule
curl -s -X POST $BASE/admin/milestone-change-requests/${CR_IDS[2]}/approve/ -H "$AUTH" -H "Content-Type: application/json" -d '{
  "schedule": [
    {"name": "Instalment A", "amount": "280000", "due_date": "2026-12-20"},
    {"name": "Instalment B", "amount": "280000", "due_date": "2027-01-20"},
    {"name": "Instalment C", "amount": "280000", "due_date": "2027-02-20"}
  ]
}' | jq '{id, status}'

# deciding twice -> 400 already_reviewed
curl -s -X POST $BASE/admin/milestone-change-requests/${CR_IDS[2]}/decline/ -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"reason": "x"}' -w "\nHTTP:%{http_code}\n"
```

---

## 13. Admin — Payment Overview

```bash
curl -s $BASE/admin/payment-overview/ -H "$AUTH" | jq .
curl -s "$BASE/admin/payment-overview/?project=$PROJECT_ID&start_date=2026-01-01&end_date=2027-12-31" -H "$AUTH" | jq .

# charts: monthly scheduled vs collected, ageing, per project, top overdue
# defaults to 12 months back → 3 ahead; dates are YYYY-MM-DD
curl -s $BASE/admin/payment-overview/insights/ -H "$AUTH" | jq .
curl -s "$BASE/admin/payment-overview/insights/?project=$PROJECT_ID&start_date=2026-06-01&end_date=2027-06-30" -H "$AUTH" | jq '{range, period, snapshot}'
```

---

## 14. Documents

```bash
# CustomerApp (only documents marked visible to the customer)
curl -s $BASE/customer/documents/ -H "$CAUTH" | jq .
curl -s "$BASE/customer/documents/?doc_type=PAYMENT_RECEIPT" -H "$CAUTH" | jq .
RECEIPT_ID=$(curl -s "$BASE/customer/documents/?doc_type=PAYMENT_RECEIPT" -H "$CAUTH" | jq -r '.results[0].id')
curl -s $BASE/customer/documents/$RECEIPT_ID/ -H "$CAUTH" | jq .

# Admin (ACCOUNTS, SUPER_ADMIN)
# doc_type: PAYMENT_RECEIPT | REGISTRY | LEGAL | OTHER ; status: ISSUED | IN_PROGRESS
curl -s $BASE/admin/documents/ -H "$AUTH" | jq .
curl -s "$BASE/admin/documents/?customer=$BUYER_ID&doc_type=PAYMENT_RECEIPT" -H "$AUTH" | jq .
curl -s "$BASE/admin/documents/stats/?project=$PROJECT_ID" -H "$AUTH" | jq .

# upload a registry document for the buyer
curl -s -X POST $BASE/admin/documents/ -H "$AUTH" \
  -F "customer=$BUYER_ID" -F "name=Sale Deed" -F "doc_type=REGISTRY" -F "status=ISSUED" \
  -F "file=@/tmp/doc.pdf;type=application/pdf" | tee /tmp/document.json | jq .
DOC_ID=$(jq -r .id /tmp/document.json)

# an expected-but-not-ready document (no file yet)
curl -s -X POST $BASE/admin/documents/ -H "$AUTH" \
  -F "customer=$BUYER_ID" -F "name=Occupancy Certificate" -F "doc_type=LEGAL" -F "status=IN_PROGRESS" | jq .

curl -s $BASE/admin/documents/$DOC_ID/ -H "$AUTH" | jq .
curl -s -X PATCH $BASE/admin/documents/$DOC_ID/ -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name": "Sale Deed (registered)", "is_visible_to_customer": true}' | jq '{id, name, is_visible_to_customer}'

# download through the API (authenticated; streams the file as an attachment)
curl -s -o /tmp/downloaded.pdf -D - $BASE/admin/documents/$DOC_ID/download/ -H "$AUTH" | grep -i "^content-disposition"

curl -s -X DELETE $BASE/admin/documents/$DOC_ID/ -H "$AUTH" -w "HTTP:%{http_code}\n"
```

---

## 15. Support Tickets

`category`: `PAYMENT | DOCUMENTS | CONSTRUCTION | GENERAL` · `status`: `OPEN | IN_PROGRESS | RESOLVED | CLOSED`

Automatic status changes: an admin reply on an `OPEN` ticket moves it to `IN_PROGRESS` and
notifies the customer; a customer reply on a `RESOLVED` ticket reopens it to `OPEN`;
customers can't reply on `CLOSED` tickets (admins still can).

Attachments: one file per message, form field `attachment`, any file type. `message` is
required on replies, so an attachment-only reply is a 400. On create, the attachment goes on
the first message.

```bash
# --- CustomerApp -------------------------------------------------------------
# create — JSON, no attachment
curl -s -X POST $BASE/customer/tickets/ -H "$CAUTH" -H "Content-Type: application/json" \
  -d '{"category":"GENERAL","subject":"When will the sale deed be ready?","description":"Need to plan leave for registration."}' \
  | jq '{id, status}'

# create — multipart with an image
curl -s -X POST $BASE/customer/tickets/ -H "$CAUTH" \
  -F "category=PAYMENT" -F "subject=Payment receipt not showing" \
  -F "description=Paid by NEFT last week, screenshot attached." \
  -F "attachment=@/tmp/photo.png;type=image/png" | tee /tmp/ticket.json | jq .
TICKET_ID=$(jq -r .id /tmp/ticket.json)

# list / filter / detail
curl -s $BASE/customer/tickets/ -H "$CAUTH" | jq .
curl -s "$BASE/customer/tickets/?status=OPEN&category=PAYMENT" -H "$CAUTH" | jq .
curl -s $BASE/customer/tickets/$TICKET_ID/ -H "$CAUTH" | jq '.messages[] | {sender_type, message, attachment}'

# reply — text (JSON), with a PDF, with a text file
curl -s -X POST $BASE/customer/tickets/$TICKET_ID/reply/ -H "$CAUTH" -H "Content-Type: application/json" \
  -d '{"message":"Any update on this?"}' | jq '.messages | length'
curl -s -X POST $BASE/customer/tickets/$TICKET_ID/reply/ -H "$CAUTH" \
  -F "message=Bank receipt attached." -F "attachment=@/tmp/doc.pdf;type=application/pdf" | jq '.messages | last'
curl -s -X POST $BASE/customer/tickets/$TICKET_ID/reply/ -H "$CAUTH" \
  -F "message=App log attached." -F "attachment=@/tmp/app_log.txt;type=text/plain" | jq '.messages | last'

# --- Admin (SUPPORT, SUPER_ADMIN) ---------------------------------------------
# filters: status, status__in, category, assigned_to, assigned_to__isnull, ?awaiting=true
#          ?search= (subject, description, customer email/name, plot) ?ordering=-last_message_at
curl -s $BASE/admin/tickets/ -H "$AUTH" | jq .
curl -s "$BASE/admin/tickets/?status__in=OPEN,IN_PROGRESS&assigned_to__isnull=true" -H "$AUTH" | jq .
curl -s "$BASE/admin/tickets/?awaiting=true&search=receipt" -H "$AUTH" | jq .
curl -s $BASE/admin/tickets/stats/ -H "$AUTH" | jq .
curl -s $BASE/admin/tickets/assignees/ -H "$AUTH" | jq .
curl -s $BASE/admin/tickets/$TICKET_ID/ -H "$AUTH" | jq .

# reply — text, then with an image (an OPEN ticket moves to IN_PROGRESS)
curl -s -X POST $BASE/admin/tickets/$TICKET_ID/reply/ -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"message":"Thanks — we are looking into this."}' | jq '{status}'
curl -s -X POST $BASE/admin/tickets/$TICKET_ID/reply/ -H "$AUTH" \
  -F "message=This is what we see on our side." -F "attachment=@/tmp/photo.png;type=image/png" | jq '.messages | last'

# assign / unassign
curl -s -X POST $BASE/admin/tickets/$TICKET_ID/assign/ -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"assigned_to\": $SUPPORT_ID}" | jq '{assigned_to, assigned_to_name}'
curl -s -X POST $BASE/admin/tickets/$TICKET_ID/assign/ -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"assigned_to": null}' | jq '{assigned_to}'

# resolve -> customer reply reopens it -> close
curl -s -X POST $BASE/admin/tickets/$TICKET_ID/status/ -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"status": "RESOLVED"}' | jq '{status}'
curl -s -X POST $BASE/customer/tickets/$TICKET_ID/reply/ -H "$CAUTH" -F "message=Still not showing." | jq '{status}'
curl -s -X POST $BASE/admin/tickets/$TICKET_ID/status/ -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"status": "CLOSED"}' | jq '{status}'

# customer reply on a CLOSED ticket -> 400
curl -s -X POST $BASE/customer/tickets/$TICKET_ID/reply/ -H "$CAUTH" -F "message=Hello?" -w "\nHTTP:%{http_code}\n"
# attachment without a message -> 400
curl -s -X POST $BASE/admin/tickets/$TICKET_ID/reply/ -H "$AUTH" \
  -F "attachment=@/tmp/photo.png;type=image/png" -w "\nHTTP:%{http_code}\n"
```

Attachments come back in `messages[].attachment`. Locally, `GET` responses give a full
`http://host/media/...` URL, but the create/reply responses give a relative `/media/...` path,
so clients should handle both. With `USE_S3` on it's a pre-signed S3 URL valid for 1 hour.
Media files need no auth header.

```bash
ATT=$(curl -s $BASE/admin/tickets/$TICKET_ID/ -H "$AUTH" | jq -r '[.messages[] | select(.attachment)][0].attachment')
case "$ATT" in http*) ATT_URL="$ATT" ;; *) ATT_URL="$HOST$ATT" ;; esac
curl -s -o /tmp/ticket_attachment -w "HTTP:%{http_code} %{content_type}\n" "$ATT_URL"
```

---

## 16. Notifications

```bash
# CustomerApp
curl -s $BASE/customer/notifications/ -H "$CAUTH" | jq .
curl -s "$BASE/customer/notifications/?is_read=false&notif_type=PAYMENT_APPROVED" -H "$CAUTH" | jq .

NOTIF_ID=$(curl -s "$BASE/customer/notifications/?is_read=false" -H "$CAUTH" | jq -r '.results[0].id')
curl -s -X POST $BASE/customer/notifications/$NOTIF_ID/read/ -H "$CAUTH" | jq .
curl -s -X POST $BASE/customer/notifications/mark-all-read/ -H "$CAUTH" | jq .

# Admin — campaigns, SUPER_ADMIN (draft → send)
# target_type: ALL | PROJECT | SELECTED ; channel: PUSH | EMAIL | BOTH
curl -s $BASE/admin/notifications/campaigns/ -H "$AUTH" | jq .
curl -s $BASE/admin/notifications/campaigns/stats/ -H "$AUTH" | jq .

# how many customers a draft would reach
curl -s "$BASE/admin/notifications/campaigns/preview-recipients/?target_type=ALL" -H "$AUTH" | jq .
curl -s "$BASE/admin/notifications/campaigns/preview-recipients/?target_type=PROJECT&target_project=$PROJECT_ID" -H "$AUTH" | jq .
curl -s "$BASE/admin/notifications/campaigns/preview-recipients/?target_type=SELECTED&target_customers=$BUYER_ID,$COAPP_ID" -H "$AUTH" | jq .

curl -s -X POST $BASE/admin/notifications/campaigns/ -H "$AUTH" -H "Content-Type: application/json" -d '{
  "title": "Diwali offer", "body": "Special pricing on remaining plots this festive season.",
  "target_type": "ALL", "channel": "BOTH"
}' | tee /tmp/campaign.json | jq .
CAMPAIGN_ID=$(jq -r .id /tmp/campaign.json)

curl -s $BASE/admin/notifications/campaigns/$CAMPAIGN_ID/ -H "$AUTH" | jq .
curl -s -X PATCH $BASE/admin/notifications/campaigns/$CAMPAIGN_ID/ -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"target_type\": \"PROJECT\", \"target_project\": $PROJECT_ID}" | jq '{id, target_type, target_project_name}'

curl -s -X POST $BASE/admin/notifications/campaigns/$CAMPAIGN_ID/send/ -H "$AUTH" | jq '{status, sent_at, recipient_count}'
curl -s -X POST $BASE/admin/notifications/campaigns/$CAMPAIGN_ID/send/ -H "$AUTH" -w "\nHTTP:%{http_code}\n"   # 400 already sent
curl -s $BASE/admin/notifications/campaigns/delivery-log/ -H "$AUTH" | jq .

# a draft to selected customers, then delete it
DRAFT_ID=$(curl -s -X POST $BASE/admin/notifications/campaigns/ -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"title\": \"Site visit\", \"body\": \"Saturday 10am\", \"target_type\": \"SELECTED\", \"target_customers\": [$BUYER_ID], \"channel\": \"PUSH\"}" \
  | jq -r .id)
curl -s -X DELETE $BASE/admin/notifications/campaigns/$DRAFT_ID/ -H "$AUTH" -w "HTTP:%{http_code}\n"
```

---

## 17. Banners

```bash
# Admin, SUPER_ADMIN (multipart because of the image)
curl -s -X POST $BASE/admin/banners/ -H "$AUTH" \
  -F "title=New phase launching" -F "link_target=project:$PROJECT_ID" -F "display_order=1" \
  -F "image=@/tmp/photo.png;type=image/png" | tee /tmp/banner.json | jq .
BANNER_ID=$(jq -r .id /tmp/banner.json)

curl -s $BASE/admin/banners/ -H "$AUTH" | jq .
curl -s $BASE/admin/banners/$BANNER_ID/ -H "$AUTH" | jq .
curl -s -X PATCH $BASE/admin/banners/$BANNER_ID/ -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"display_order": 2}' | jq '{id, display_order, is_active}'

# CustomerApp — active banners for the dashboard
curl -s $BASE/customer/banners/ -H "$CAUTH" | jq .

curl -s -X DELETE $BASE/admin/banners/$BANNER_ID/ -H "$AUTH" -w "HTTP:%{http_code}\n"
```

---

## 18. Admin — Customers (SUPER_ADMIN; read for other roles)

```bash
curl -s $BASE/admin/customers/ -H "$AUTH" | jq .
curl -s "$BASE/admin/customers/?kyc_status=APPROVED&search=buyer" -H "$AUTH" | jq .

curl -s $BASE/admin/customers/$BUYER_ID/ -H "$AUTH" | jq .
curl -s -X PATCH $BASE/admin/customers/$BUYER_ID/ -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"address": "Updated address, Mumbai"}' | jq '{id, address}'

# manual KYC override (a later submission or reviewer decision recalculates it)
curl -s -X POST $BASE/admin/customers/$COAPP_ID/set-kyc-status/ -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"kyc_status": "APPROVED", "reason": "Verified offline at the site office"}' | jq '{id, kyc_status}'

# 7.6 Add/Invite — registers a buyer without a plot (assign one via section 4)
curl -s -X POST $BASE/admin/customers/ -H "$AUTH" -H "Content-Type: application/json" -d '{
  "email": "prebooked@example.com", "name": "Pre-booked Buyer", "phone": "9000000000", "address": "Mumbai"
}' | tee /tmp/prebooked.json | jq .
PREBOOKED_ID=$(jq -r .id /tmp/prebooked.json)

# delete — check first (blocked while they have a plot, payments, etc.)
curl -s $BASE/admin/customers/$BUYER_ID/delete-check/ -H "$AUTH" | jq .
curl -s $BASE/admin/customers/$PREBOOKED_ID/delete-check/ -H "$AUTH" | jq .
curl -s -X DELETE $BASE/admin/customers/$PREBOOKED_ID/ -H "$AUTH" -w "HTTP:%{http_code}\n"
```

---

## 19. Admin — Sales Team (SUPER_ADMIN)

```bash
curl -s -X POST $BASE/admin/sales-team/ -H "$AUTH" \
  -F "name=Rahul Sharma" -F "phone=9123456780" -F "email=rahul@atomcapitol.com" \
  -F "photo=@/tmp/photo.png;type=image/png" | tee /tmp/sales_person.json | jq .
SALES_ID=$(jq -r .id /tmp/sales_person.json)

SALES2_ID=$(curl -s -X POST $BASE/admin/sales-team/ -H "$AUTH" \
  -F "name=Priya Nair" -F "phone=9123456781" -F "email=priya@atomcapitol.com" | jq -r .id)

curl -s $BASE/admin/sales-team/ -H "$AUTH" | jq .
curl -s $BASE/admin/sales-team/$SALES_ID/ -H "$AUTH" | jq .
curl -s -X PATCH $BASE/admin/sales-team/$SALES_ID/ -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"phone": "9123456789"}' | jq '{id, phone, customer_count}'

# link customers, unlink one, then hand everyone over to another sales person
curl -s -X POST $BASE/admin/sales-team/$SALES_ID/assign-customers/ -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"customer_ids\": [$BUYER_ID, $COAPP_ID]}" | jq .
curl -s -X POST $BASE/admin/sales-team/$SALES_ID/unassign-customers/ -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"customer_ids\": [$COAPP_ID]}" | jq .
curl -s -X POST $BASE/admin/sales-team/$SALES_ID/move-customers/ -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"to_sales_person\": $SALES2_ID}" | jq .

# the buyer now sees a sales contact
curl -s $BASE/customer/sales-contact/ -H "$CAUTH" | jq .

curl -s -X DELETE $BASE/admin/sales-team/$SALES_ID/ -H "$AUTH" -w "HTTP:%{http_code}\n"
```

---

## 20. Admin — Settings & Audit Log (SUPER_ADMIN)

```bash
curl -s $BASE/admin/settings/ -H "$AUTH" | jq .

curl -s -X PATCH $BASE/admin/settings/ -H "$AUTH" -H "Content-Type: application/json" -d '{
  "company_name": "Atom Capitol",
  "support_phone": "+91-9000090000",
  "support_email": "support@atomcapitol.com",
  "bank_account_name": "Atom Capitol Pvt Ltd",
  "bank_account_number": "123456789012",
  "bank_ifsc": "HDFC0001234",
  "bank_name": "HDFC Bank",
  "upi_id": "atomcapitol@hdfcbank",
  "receipt_template_note": "Thank you for your payment. This is a computer-generated receipt."
}' | jq .

# audit log — kept for 7 days
# filters: action, action__startswith, target_type, actor, created_at__date__gte/lte, search
#          ?category=payments|customers|projects|documents|content|team
curl -s $BASE/admin/audit-log/ -H "$AUTH" | jq .
curl -s "$BASE/admin/audit-log/?action=plot.assign" -H "$AUTH" | jq .
curl -s "$BASE/admin/audit-log/?category=payments&created_at__date__gte=2026-01-01" -H "$AUTH" | jq .
curl -s $BASE/admin/audit-log/facets/ -H "$AUTH" | jq .
```

---

## 21. Permission checks

```bash
# SUPPORT can work tickets but not projects
SUPPORT_ACCESS=$(curl -s -X POST $BASE/admin/auth/login/ -H "Content-Type: application/json" \
  -d '{"email":"support@atomcapitol.com","password":"Support@123"}' | jq -r .access)
curl -s -o /dev/null -w "support → tickets  (expect 200): %{http_code}\n" $BASE/admin/tickets/ -H "Authorization: Bearer $SUPPORT_ACCESS"
curl -s -o /dev/null -w "support → projects (expect 403): %{http_code}\n" $BASE/admin/projects/ -H "Authorization: Bearer $SUPPORT_ACCESS"

# KYC_REVIEWER can open the KYC queue but not payments
REVIEWER_ACCESS=$(curl -s -X POST $BASE/admin/auth/login/ -H "Content-Type: application/json" \
  -d '{"email":"reviewer@atomcapitol.com","password":"Reviewer@123"}' | jq -r .access)
curl -s -o /dev/null -w "reviewer → kyc-queue (expect 200): %{http_code}\n" $BASE/admin/kyc-queue/ -H "Authorization: Bearer $REVIEWER_ACCESS"
curl -s -o /dev/null -w "reviewer → payments  (expect 403): %{http_code}\n" $BASE/admin/payment-verification-queue/ -H "Authorization: Bearer $REVIEWER_ACCESS"

# customer token on an admin endpoint, admin token on a customer endpoint
curl -s -o /dev/null -w "customer → admin/customers   (expect 403): %{http_code}\n" $BASE/admin/customers/ -H "$CAUTH"
curl -s -o /dev/null -w "admin → customer/profile     (expect 403): %{http_code}\n" $BASE/customer/profile/ -H "$AUTH"
curl -s -o /dev/null -w "no token → customer/tickets  (expect 401): %{http_code}\n" $BASE/customer/tickets/
```

---

## 22. Validation errors (examples)

```bash
curl -s -X POST $BASE/admin/auth/login/ -H "Content-Type: application/json" \
  -d '{"email":"admin@atomcapitol.com","password":"wrong"}' -w "\nHTTP:%{http_code}\n"          # 401
curl -s -X POST $BASE/customer/tickets/ -H "$CAUTH" -H "Content-Type: application/json" \
  -d '{"category":"REFUND","subject":"x","description":"y"}' -w "\nHTTP:%{http_code}\n"       # 400 bad choice
curl -s -X POST $BASE/admin/tickets/$TICKET_ID/status/ -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"status":"DONE"}' -w "\nHTTP:%{http_code}\n"                                            # 400 bad choice
curl -s $BASE/admin/tickets/999999/ -H "$AUTH" -w "\nHTTP:%{http_code}\n"                      # 404
```

---

## 23. Token refresh & logout

Works for either actor. Refresh tokens rotate: each refresh returns a new `refresh` and the old
one stops working, so always keep the latest.

```bash
curl -s -X POST $BASE/auth/token/refresh/ -H "Content-Type: application/json" \
  -d "{\"refresh\":\"$ADMIN_REFRESH\"}" | tee /tmp/admin_refresh.json | jq .
ADMIN_REFRESH=$(jq -r .refresh /tmp/admin_refresh.json)

curl -s -X POST $BASE/auth/logout/ -H "Content-Type: application/json" \
  -d "{\"refresh\":\"$ADMIN_REFRESH\"}" | jq .
curl -s -X POST $BASE/auth/logout/ -H "Content-Type: application/json" \
  -d "{\"refresh\":\"$CUST_REFRESH\"}" | jq .

# a logged-out refresh token can't be used again -> 401
curl -s -X POST $BASE/auth/token/refresh/ -H "Content-Type: application/json" \
  -d "{\"refresh\":\"$ADMIN_REFRESH\"}" -w "\nHTTP:%{http_code}\n"
```

---

## Scheduled jobs (not HTTP — run via cron)

```bash
cd backend && source venv/bin/activate
python manage.py refresh_milestone_statuses
python manage.py send_payment_reminders
```

---

## Swagger / ReDoc

Interactive docs at `$BASE/docs/` (Swagger UI) and `$BASE/redoc/` while the server runs.
