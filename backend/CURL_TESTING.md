# Atom Capitol Backend — curl Testing Guide

Every endpoint in the API, as runnable `curl` commands, in the order you'd actually
exercise them (admin sets up data → customer onboards → admin reviews → payments cycle
→ everything else). Copy/paste block by block in a terminal.

## Prerequisites

```bash
# Terminal 1 — run the server
cd backend
source venv/bin/activate
python manage.py runserver

# Terminal 2 — run the curls below
BASE=http://127.0.0.1:8000/api
```

`jq` is used to pull fields out of JSON responses into shell variables. Install it if you
don't have it (`brew install jq`) — every command below works without it too, just read
the raw JSON and copy values by hand.

Image uploads (project photos, banners, sales-person headshots) are validated as real
images by Pillow — a text file renamed `.jpg` will be rejected with a 400. Generate a
throwaway valid image once and reuse it:

```bash
python3 -c "from PIL import Image; Image.new('RGB', (20, 20), color='blue').save('/tmp/photo.jpg')"
```

Receipts/proofs/documents just need a `.pdf`-ish file (their validator only checks
content-type + size), so a plain text file with that extension is fine for testing.

You'll need one admin superuser first:

```bash
cd backend && source venv/bin/activate
python manage.py createsuperuser --email admin@atomcapitol.com
# follow the password prompt, e.g. Admin@12345
```

OTP emails print to the `runserver` console (dev uses the console email backend) — watch
Terminal 1 for the 6-digit code whenever you trigger customer login.

---

## 0. Health & public endpoints (no auth)

```bash
curl -s $BASE/health/

curl -s $BASE/public/settings/
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

Token refresh / logout (works for either actor — pass whichever refresh token you have):

```bash
curl -s -X POST $BASE/auth/token/refresh/ \
  -H "Content-Type: application/json" \
  -d "{\"refresh\":\"$ADMIN_REFRESH\"}" | jq .

curl -s -X POST $BASE/auth/logout/ \
  -H "Content-Type: application/json" \
  -d "{\"refresh\":\"$ADMIN_REFRESH\"}" | jq .
```

---

## 2. Admin — Admin Users & Roles (SUPER_ADMIN only)

```bash
# list
curl -s $BASE/admin/admin-users/ -H "$AUTH" | jq .

# create a KYC reviewer
curl -s -X POST $BASE/admin/admin-users/ -H "$AUTH" -H "Content-Type: application/json" -d '{
  "email": "reviewer@atomcapitol.com",
  "first_name": "Kavya",
  "last_name": "Reviewer",
  "role": "KYC_REVIEWER",
  "password": "Reviewer@123"
}' | tee /tmp/reviewer.json | jq .
REVIEWER_ID=$(jq -r .id /tmp/reviewer.json)

# create an accounts-role user and a support-role user (used later)
curl -s -X POST $BASE/admin/admin-users/ -H "$AUTH" -H "Content-Type: application/json" -d '{
  "email": "accounts@atomcapitol.com", "role": "ACCOUNTS", "password": "Accounts@123"
}' | jq .
curl -s -X POST $BASE/admin/admin-users/ -H "$AUTH" -H "Content-Type: application/json" -d '{
  "email": "support@atomcapitol.com", "role": "SUPPORT", "password": "Support@123"
}' | jq .

# update role / deactivate
curl -s -X PATCH $BASE/admin/admin-users/$REVIEWER_ID/ -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"is_active": true}' | jq .

# delete
curl -s -X DELETE $BASE/admin/admin-users/$REVIEWER_ID/ -H "$AUTH" -w "\nHTTP:%{http_code}\n"
```

---

## 3. Admin — Projects (Townships)

```bash
curl -s $BASE/admin/projects/ -H "$AUTH" | jq .

curl -s -X POST $BASE/admin/projects/ -H "$AUTH" \
  -F "name=Green Valley Township" \
  -F "location=Pune" \
  -F "description=A premium gated township" \
  -F "development_status=UNDER_CONSTRUCTION" | tee /tmp/project.json | jq .
PROJECT_ID=$(jq -r .id /tmp/project.json)

# add a gallery image
curl -s -X POST $BASE/admin/projects/$PROJECT_ID/images/ -H "$AUTH" \
  -F "image_type=GALLERY" -F "caption=Clubhouse" -F "image=@/tmp/photo.jpg;type=image/jpeg" | jq .

# publish / unpublish
curl -s -X POST $BASE/admin/projects/$PROJECT_ID/publish/ -H "$AUTH" | jq .
curl -s -X POST $BASE/admin/projects/$PROJECT_ID/unpublish/ -H "$AUTH" | jq .

# update
curl -s -X PATCH $BASE/admin/projects/$PROJECT_ID/ -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"description": "Updated description"}' | jq .
```

---

## 4. Admin — Plot Inventory

```bash
# create a plot
curl -s -X POST $BASE/admin/plots/ -H "$AUTH" -H "Content-Type: application/json" -d "{
  \"project\": $PROJECT_ID, \"plot_number\": \"A-101\", \"size\": \"1200 sq.ft\",
  \"block_sector\": \"A\", \"price\": \"1500000\"
}" | tee /tmp/plot.json | jq .
PLOT_ID=$(jq -r .id /tmp/plot.json)

# list / filter
curl -s "$BASE/admin/plots/?project=$PROJECT_ID&status=AVAILABLE" -H "$AUTH" | jq .

# assign a buyer — this is what makes the email valid for app login,
# and captures the commercial position used to generate the milestone plan
curl -s -X POST $BASE/admin/plots/$PLOT_ID/assign/ -H "$AUTH" -H "Content-Type: application/json" -d '{
  "email": "buyer@example.com",
  "role": "PRIMARY",
  "name": "Test Buyer",
  "phone": "9999999999",
  "total_value": "1500000",
  "amount_paid_outside_app": "100000",
  "instalment_count": 5
}' | jq .

# add a co-applicant to the same plot
curl -s -X POST $BASE/admin/plots/$PLOT_ID/assign/ -H "$AUTH" -H "Content-Type: application/json" -d '{
  "email": "coapplicant@example.com", "role": "CO_APPLICANT", "name": "Co Applicant"
}' | jq .

# assignment history
curl -s $BASE/admin/plots/$PLOT_ID/history/ -H "$AUTH" | jq .

# unassign (revokes that email's app access immediately)
curl -s -X POST $BASE/admin/plots/$PLOT_ID/unassign/ -H "$AUTH" -H "Content-Type: application/json" -d '{
  "customer_id": 2, "reason": "Booking cancelled"
}' | jq .

# transfer primary buyer to a new email
curl -s -X POST $BASE/admin/plots/$PLOT_ID/transfer/ -H "$AUTH" -H "Content-Type: application/json" -d '{
  "customer_id": 1, "new_email": "newbuyer@example.com", "reason": "Resale"
}' | jq .
```

Bulk CSV import / assignment:

```bash
cat > /tmp/plots.csv <<'EOF'
plot_number,size,block_sector,price
A-102,1000 sq.ft,A,1200000
A-103,1500 sq.ft,B,1800000
EOF
curl -s -X POST $BASE/admin/plots/bulk-import/ -H "$AUTH" \
  -F "project=$PROJECT_ID" -F "file=@/tmp/plots.csv" | jq .

cat > /tmp/assignments.csv <<'EOF'
project,plot_number,email,role,name,phone,total_value,amount_paid_outside_app,instalment_count
Green Valley Township,A-102,buyer2@example.com,PRIMARY,Second Buyer,8888888888,1200000,0,4
EOF
curl -s -X POST $BASE/admin/plots/bulk-assign/ -H "$AUTH" -F "file=@/tmp/assignments.csv" | jq .
```

Milestones don't always auto-generate at assignment (only when `total_value` +
`instalment_count` were both given). To (re)generate for a plot that has none yet:

```bash
curl -s -X POST $BASE/admin/plots/$PLOT_ID/generate-schedule/ -H "$AUTH" | jq .
```

---

## 5. CustomerApp — Onboarding (email → OTP)

```bash
curl -s -X POST $BASE/customer/auth/login/ -H "Content-Type: application/json" \
  -d '{"email":"buyer@example.com"}' | jq .
# -> "OTP sent to your registered email." — watch Terminal 1's console log for the code

# resend if needed (rate-limited, 60s cooldown)
curl -s -X POST $BASE/customer/auth/resend-otp/ -H "Content-Type: application/json" \
  -d '{"email":"buyer@example.com"}' | jq .

OTP=123456   # <-- replace with the code printed in the server console
curl -s -X POST $BASE/customer/auth/verify-otp/ -H "Content-Type: application/json" \
  -d "{\"email\":\"buyer@example.com\",\"code\":\"$OTP\"}" | tee /tmp/customer_login.json | jq .

CUST_ACCESS=$(jq -r .access /tmp/customer_login.json)
CUST_REFRESH=$(jq -r .refresh /tmp/customer_login.json)
CAUTH="Authorization: Bearer $CUST_ACCESS"

# response includes "next_route": onboarding | pending | rejected | home,
# tell your frontend routing off that field.
```

An email that's not registered / not yet assigned a plot gets a 404 with a support
message instead of an OTP:

```bash
curl -s -X POST $BASE/customer/auth/login/ -H "Content-Type: application/json" \
  -d '{"email":"nobody@example.com"}' -w "\nHTTP:%{http_code}\n"
```

---

## 6. CustomerApp — KYC (Step 2 + Step 3)
```bash
# Step 2a: plot details to confirm
curl -s $BASE/customer/kyc/plot-check/ -H "$CAUTH" | jq .

# Step 2b: confirm + upload first payment receipt
echo "dummy receipt content" > /tmp/receipt.pdf
curl -s -X POST $BASE/customer/kyc/step2/ -H "$CAUTH" \
  -F "plot_confirmed=true" \
  -F "receipt_file=@/tmp/receipt.pdf;type=application/pdf" \
  -F "receipt_amount=100000" \
  -F "receipt_payment_date=2026-09-01" | jq .

# ...or, if the plot details don't match, flag it instead of confirming:
curl -s -X POST $BASE/customer/kyc/step2/ -H "$CAUTH" \
  -F "plot_confirmed=false" \
  -F "plot_mismatch_note=Plot size on file looks wrong" \
  -F "receipt_file=@/tmp/receipt.pdf;type=application/pdf" \
  -F "receipt_amount=100000" \
  -F "receipt_payment_date=2026-09-01" | jq .

# Step 3: get the random lines to read aloud, then upload the recorded video
curl -s $BASE/customer/kyc/step3/ -H "$CAUTH" | jq .

echo "dummy video content" > /tmp/kyc_video.mp4
curl -s -X POST $BASE/customer/kyc/step3/ -H "$CAUTH" \
  -F "video_file=@/tmp/kyc_video.mp4;type=video/mp4" | jq .

# 4.7/4.8/4.9 — poll this to drive the Pending/Rejected screens
curl -s $BASE/customer/kyc/status/ -H "$CAUTH" | jq .
```

---

## 7. Admin — KYC Review Queue

```bash
curl -s $BASE/admin/kyc-queue/ -H "$AUTH" | jq .

SUBMISSION_ID=1   # from the list above
curl -s $BASE/admin/kyc-queue/$SUBMISSION_ID/ -H "$AUTH" | jq .

# approve both steps at once -> unlocks the app for the customer
curl -s -X POST $BASE/admin/kyc-queue/$SUBMISSION_ID/decide/ -H "$AUTH" -H "Content-Type: application/json" -d '{
  "step2_decision": "APPROVED",
  "step3_decision": "APPROVED"
}' | jq .

# ...or reject a single step with a reason (customer can then redo just that step, unlimited times)
curl -s -X POST $BASE/admin/kyc-queue/$SUBMISSION_ID/decide/ -H "$AUTH" -H "Content-Type: application/json" -d '{
  "step2_decision": "REJECTED",
  "step2_reason": "Receipt amount does not match plot booking value"
}' | jq .
```

---

## 8. CustomerApp — Profile, Settings, Sales contact

All of these require KYC status `APPROVED` (401/403 otherwise).

```bash
curl -s $BASE/customer/profile/ -H "$CAUTH" | jq .

curl -s -X POST $BASE/customer/profile/request-correction/ -H "$CAUTH" -H "Content-Type: application/json" -d '{
  "field": "phone",
  "current_value": "9999999999",
  "requested_value": "9876543210",
  "note": "Number changed"
}' | jq .
# -> raises a ticket for admin instead of editing directly

curl -s $BASE/customer/settings/ -H "$CAUTH" | jq .
curl -s -X PATCH $BASE/customer/settings/ -H "$CAUTH" -H "Content-Type: application/json" -d '{
  "notify_email": true, "notify_push": false, "language": "en"
}' | jq .

curl -s $BASE/customer/sales-contact/ -H "$CAUTH" -w "\nHTTP:%{http_code}\n" | jq .
```

---

## 9. CustomerApp — Township & Plot Details

```bash
curl -s $BASE/customer/plot/ -H "$CAUTH" | jq .
```

---

## 10. CustomerApp — Payments & Milestones

```bash
# summary + milestone list (totals, next due, filterable by status)
curl -s $BASE/customer/payments/ -H "$CAUTH" | jq .
curl -s "$BASE/customer/payments/?status=DUE" -H "$CAUTH" | jq .

MILESTONE_ID=1
curl -s $BASE/customer/payments/$MILESTONE_ID/ -H "$CAUTH" | jq .

# pay & upload proof against a DUE/OVERDUE milestone
echo "dummy proof content" > /tmp/proof.pdf
curl -s -X POST $BASE/customer/payments/$MILESTONE_ID/pay/ -H "$CAUTH" \
  -F "file=@/tmp/proof.pdf;type=application/pdf" \
  -F "claimed_amount=280000" \
  -F "payment_date=2026-09-20" \
  -F "payment_mode=UPI" \
  -F "transaction_reference=TXN123" | jq .
# -> milestone flips to UNDER_REVIEW and is locked until admin acts

# request a milestone change (existing plan stays live until admin approves)
curl -s $BASE/customer/payments/change-requests/ -H "$CAUTH" | jq .
curl -s -X POST $BASE/customer/payments/change-requests/ -H "$CAUTH" -H "Content-Type: application/json" -d '{
  "change_type": "CHANGE_INSTALMENTS",
  "proposed_details": {"new_count": 8},
  "reason": "Need smaller monthly instalments"
}' | jq .
```

---

## 11. Admin — Payments & Milestones (per-plot editing)

```bash
# list / filter milestones
curl -s "$BASE/admin/milestones/?plot=$PLOT_ID" -H "$AUTH" | jq .

# edit one (amount, due date, remarks, etc.)
curl -s -X PATCH $BASE/admin/milestones/$MILESTONE_ID/ -H "$AUTH" -H "Content-Type: application/json" -d '{
  "amount": "300000", "admin_remarks": "Adjusted per request"
}' | jq .

# add an extra milestone manually
curl -s -X POST $BASE/admin/milestones/ -H "$AUTH" -H "Content-Type: application/json" -d "{
  \"plot\": $PLOT_ID, \"sequence\": 99, \"name\": \"Ad-hoc charge\",
  \"amount\": \"5000\", \"due_date\": \"2026-12-01\"
}" | jq .

# remove one
curl -s -X DELETE $BASE/admin/milestones/$MILESTONE_ID/ -H "$AUTH" -w "\nHTTP:%{http_code}\n"
```

---

## 12. Admin — Payment Verification Queue

```bash
curl -s $BASE/admin/payment-verification-queue/ -H "$AUTH" | jq .

PROOF_ID=1
# approve (optionally correct the amount/date before approving)
curl -s -X POST $BASE/admin/payment-verification-queue/$PROOF_ID/approve/ -H "$AUTH" -H "Content-Type: application/json" \
  -d '{}' | jq .
curl -s -X POST $BASE/admin/payment-verification-queue/$PROOF_ID/approve/ -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"corrected_amount": "275000", "corrected_date": "2026-09-19"}' | jq .

# reject with a reason -> milestone goes back to Due, customer can re-upload
curl -s -X POST $BASE/admin/payment-verification-queue/$PROOF_ID/reject/ -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"reason": "Screenshot is unreadable, please re-upload"}' | jq .
```

Approving auto-generates a PDF receipt and pushes it to the customer's Documents +
Notifications — check those next (sections 13 & 15).

---

## 13. Admin — Milestone Change Requests

```bash
curl -s $BASE/admin/milestone-change-requests/ -H "$AUTH" | jq .
curl -s "$BASE/admin/milestone-change-requests/?status=PENDING" -H "$AUTH" | jq .

CR_ID=1
curl -s $BASE/admin/milestone-change-requests/$CR_ID/ -H "$AUTH" | jq .

# approve as proposed, replacing the remaining (unpaid) schedule
curl -s -X POST $BASE/admin/milestone-change-requests/$CR_ID/approve/ -H "$AUTH" -H "Content-Type: application/json" -d '{
  "schedule": [
    {"name": "Instalment A", "amount": "175000", "due_date": "2026-10-20"},
    {"name": "Instalment B", "amount": "175000", "due_date": "2026-11-20"},
    {"name": "Instalment C", "amount": "175000", "due_date": "2026-12-20"},
    {"name": "Instalment D", "amount": "175000", "due_date": "2027-01-20"},
    {"name": "Instalment E", "amount": "175000", "due_date": "2027-02-20"},
    {"name": "Instalment F", "amount": "175000", "due_date": "2027-03-20"},
    {"name": "Instalment G", "amount": "175000", "due_date": "2027-04-20"},
    {"name": "Instalment H", "amount": "175000", "due_date": "2027-05-20"}
  ]
}' | jq .

# decline
curl -s -X POST $BASE/admin/milestone-change-requests/$CR_ID/decline/ -H "$AUTH" -H "Content-Type: application/json" -d '{
  "reason": "Cannot extend beyond project completion date"
}' | jq .

# counter-propose a different schedule
curl -s -X POST $BASE/admin/milestone-change-requests/$CR_ID/counter/ -H "$AUTH" -H "Content-Type: application/json" -d '{
  "schedule": [
    {"name": "Instalment A", "amount": "233333", "due_date": "2026-10-20"},
    {"name": "Instalment B", "amount": "233333", "due_date": "2026-12-20"},
    {"name": "Instalment C", "amount": "233334", "due_date": "2027-02-20"}
  ],
  "note": "6 instalments isn't feasible, here is a 3-instalment alternative"
}' | jq .
```

---

## 14. Admin — Payment Overview

```bash
curl -s $BASE/admin/payment-overview/ -H "$AUTH" | jq .
curl -s "$BASE/admin/payment-overview/?project=$PROJECT_ID&start_date=2026-01-01&end_date=2026-12-31" -H "$AUTH" | jq .
```

---

## 15. Documents

```bash
# CustomerApp
curl -s $BASE/customer/documents/ -H "$CAUTH" | jq .
curl -s "$BASE/customer/documents/?doc_type=PAYMENT_RECEIPT" -H "$CAUTH" | jq .
DOC_ID=1
curl -s $BASE/customer/documents/$DOC_ID/ -H "$CAUTH" | jq .

# Admin
curl -s $BASE/admin/documents/ -H "$AUTH" | jq .

# upload a Registry/Legal document for a customer
echo "dummy legal doc" > /tmp/sale_deed.pdf
curl -s -X POST $BASE/admin/documents/ -H "$AUTH" \
  -F "customer=1" -F "name=Sale Deed" -F "doc_type=REGISTRY" -F "status=ISSUED" \
  -F "file=@/tmp/sale_deed.pdf;type=application/pdf" | jq .

# mark an expected-but-not-ready document as "in progress" (visible, not hidden)
curl -s -X POST $BASE/admin/documents/ -H "$AUTH" \
  -F "customer=1" -F "name=Occupancy Certificate" -F "doc_type=LEGAL" -F "status=IN_PROGRESS" | jq .

curl -s -X DELETE $BASE/admin/documents/$DOC_ID/ -H "$AUTH" -w "\nHTTP:%{http_code}\n"
```

---

## 16. Support Tickets

```bash
# CustomerApp
curl -s -X POST $BASE/customer/tickets/ -H "$CAUTH" \
  -F "category=PAYMENT" -F "subject=Wrong amount shown" -F "description=Milestone amount looks off" | tee /tmp/ticket.json | jq .
TICKET_ID=$(jq -r .id /tmp/ticket.json)

curl -s $BASE/customer/tickets/ -H "$CAUTH" | jq .
curl -s "$BASE/customer/tickets/?status=OPEN" -H "$CAUTH" | jq .
curl -s $BASE/customer/tickets/$TICKET_ID/ -H "$CAUTH" | jq .

curl -s -X POST $BASE/customer/tickets/$TICKET_ID/reply/ -H "$CAUTH" \
  -F "message=Any update on this?" | jq .

# Admin
curl -s $BASE/admin/tickets/ -H "$AUTH" | jq .
curl -s "$BASE/admin/tickets/?status=OPEN&category=PAYMENT" -H "$AUTH" | jq .
curl -s $BASE/admin/tickets/$TICKET_ID/ -H "$AUTH" | jq .

curl -s -X POST $BASE/admin/tickets/$TICKET_ID/reply/ -H "$AUTH" \
  -F "message=Checked — the amount is correct, it includes a late fee." | jq .

SUPPORT_ID=$(jq -r .id /tmp/reviewer.json)   # any AdminUser id
curl -s -X POST $BASE/admin/tickets/$TICKET_ID/assign/ -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"assigned_to\": $SUPPORT_ID}" | jq .

curl -s -X POST $BASE/admin/tickets/$TICKET_ID/status/ -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"status": "RESOLVED"}' | jq .
```

---

## 17. Notifications & Banners

```bash
# CustomerApp
curl -s $BASE/customer/notifications/ -H "$CAUTH" | jq .
curl -s "$BASE/customer/notifications/?is_read=false" -H "$CAUTH" | jq .

NOTIF_ID=1
curl -s -X POST $BASE/customer/notifications/$NOTIF_ID/read/ -H "$CAUTH" | jq .
curl -s -X POST $BASE/customer/notifications/mark-all-read/ -H "$CAUTH" | jq .

curl -s $BASE/customer/banners/ -H "$CAUTH" | jq .

# Admin — Banners
curl -s $BASE/admin/banners/ -H "$AUTH" | jq .
curl -s -X POST $BASE/admin/banners/ -H "$AUTH" \
  -F "title=New phase launching" \
  -F "link_target=project:$PROJECT_ID" \
  -F "display_order=1" \
  -F "image=@/tmp/photo.jpg;type=image/jpeg" | jq .

# Admin — Notification Campaigns (draft → send)
curl -s $BASE/admin/notifications/campaigns/ -H "$AUTH" | jq .

curl -s -X POST $BASE/admin/notifications/campaigns/ -H "$AUTH" -H "Content-Type: application/json" -d '{
  "title": "Diwali offer",
  "body": "Special pricing on remaining plots this festive season.",
  "target_type": "ALL",
  "channel": "BOTH"
}' | tee /tmp/campaign.json | jq .
CAMPAIGN_ID=$(jq -r .id /tmp/campaign.json)

curl -s -X POST $BASE/admin/notifications/campaigns/$CAMPAIGN_ID/send/ -H "$AUTH" | jq .
curl -s $BASE/admin/notifications/campaigns/delivery-log/ -H "$AUTH" | jq .

```

---

## 18. Admin — Sales Team

```bash
curl -s $BASE/admin/sales-team/ -H "$AUTH" | jq .

curl -s -X POST $BASE/admin/sales-team/ -H "$AUTH" \
  -F "name=Rahul Sharma" -F "phone=9123456780" -F "email=rahul@atomcapitol.com" \
  -F "photo=@/tmp/photo.jpg;type=image/jpeg" | tee /tmp/sales_person.json | jq .
SALES_ID=$(jq -r .id /tmp/sales_person.json)

# bulk-assign this sales person to a list of customers
curl -s -X POST $BASE/admin/sales-team/$SALES_ID/assign-customers/ -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"customer_ids": [1, 2]}' | jq .
```

---

## 19. Admin — Customers

```bash
curl -s $BASE/admin/customers/ -H "$AUTH" | jq .
curl -s "$BASE/admin/customers/?kyc_status=APPROVED&search=buyer" -H "$AUTH" | jq .

# 7.6 Add/Invite — registers a buyer (without a plot yet; assign one via section 4 above)
curl -s -X POST $BASE/admin/customers/ -H "$AUTH" -H "Content-Type: application/json" -d '{
  "email": "prebooked@example.com", "name": "Pre-booked Buyer", "phone": "9000000000", "address": "Mumbai"
}' | jq .

CUSTOMER_ID=1
curl -s $BASE/admin/customers/$CUSTOMER_ID/ -H "$AUTH" | jq .
curl -s -X PATCH $BASE/admin/customers/$CUSTOMER_ID/ -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"address": "Updated address, Mumbai"}' | jq .
```

---

## 20. Admin — Settings & Audit Log

```bash
curl -s $BASE/admin/settings/ -H "$AUTH" | jq .

curl -s -X PUT $BASE/admin/settings/ -H "$AUTH" -H "Content-Type: application/json" -d '{
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

curl -s $BASE/admin/audit-log/ -H "$AUTH" | jq .
curl -s "$BASE/admin/audit-log/?action=plot.assign" -H "$AUTH" | jq .
```

---

## Permission sanity checks

```bash
# a SUPPORT-role admin can read tickets but not projects/plots (403 expected)
SUPPORT_LOGIN=$(curl -s -X POST $BASE/admin/auth/login/ -H "Content-Type: application/json" \
  -d '{"email":"support@atomcapitol.com","password":"Support@123"}')
SUPPORT_ACCESS=$(echo "$SUPPORT_LOGIN" | jq -r .access)

curl -s -o /dev/null -w "tickets (expect 200): %{http_code}\n" \
  $BASE/admin/tickets/ -H "Authorization: Bearer $SUPPORT_ACCESS"
curl -s -o /dev/null -w "projects (expect 403): %{http_code}\n" \
  $BASE/admin/projects/ -H "Authorization: Bearer $SUPPORT_ACCESS"

# a customer token can never reach an /admin/ endpoint (403 expected)
curl -s -o /dev/null -w "customer on admin/customers (expect 403): %{http_code}\n" \
  $BASE/admin/customers/ -H "$CAUTH"

# an admin token can never reach a KYC-gated /customer/ endpoint (403 expected)
curl -s -o /dev/null -w "admin on customer/profile (expect 403): %{http_code}\n" \
  $BASE/customer/profile/ -H "$AUTH"
```

---

## Scheduled jobs (not HTTP — run via cron)

```bash
python manage.py refresh_milestone_statuses
python manage.py send_payment_reminders
```

---

## Everything at a glance

Prefer clicking through instead of copy-pasting? Every endpoint above is also documented
interactively at `$BASE/docs/` (Swagger UI) and `$BASE/redoc/` once the server is
running — request/response schemas, required fields, and a "Try it out" button included.
