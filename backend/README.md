# Atom Capitol — Backend (Django + DRF)

Backend for the Atom Capitol **CustomerApp** (plot buyers) and **Admin Portal** (staff),
implementing the SRS: email+OTP customer login (with self sign-up) gated behind KYC, plot/milestone
management, payment proof verification, documents, tickets, notifications and audit
logging.

## Stack

- Django 4.2 (LTS) + Django REST Framework
- `djangorestframework-simplejwt` — **dual JWT auth**: one token type for CustomerApp
  (OTP login, no password) and one for Admin Portal (email + password), both served
  from the same API via a shared `actor` claim (see `accounts/authentication.py`).
- SQLite for local dev (swap to Postgres by setting `DB_*` env vars — see `.env.example`)
- `drf-spectacular` for OpenAPI schema + Swagger/Redoc docs
- `reportlab` to auto-generate PDF payment receipts
- Local disk storage for media by default; `USE_S3=True` switches to S3 (`django-storages`
  is referenced in settings but not installed by default — `pip install django-storages[s3]`
  if you turn it on)

## Setup

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # edit as needed; sqlite + console email work out of the box
python manage.py migrate
python manage.py createsuperuser --email admin@example.com   # AdminUser, role=SUPER_ADMIN
python manage.py runserver
```

API root: `http://127.0.0.1:8000/api/`
Interactive docs: `http://127.0.0.1:8000/api/docs/` (Swagger) and `/api/redoc/`
Django admin (staff-only, separate from the API): `http://127.0.0.1:8000/django-admin/`

In dev, OTP emails print to the console (`EMAIL_BACKEND` = console backend) — read the
6-digit code from the `runserver` output.

## How the two logins share one API

- `accounts.AdminUser` is `AUTH_USER_MODEL`, logs in with email+password at
  `/api/admin/auth/login/`.
- `accounts.Customer` is a separate, password-less model. Login is
  `/api/customer/auth/login/` → OTP email → `/api/customer/auth/verify-otp/`.
- Every issued JWT carries an `actor` claim (`"admin"` or `"customer"`). Two
  authentication classes (`AdminJWTAuthentication`, `CustomerJWTAuthentication`) are both
  registered in `DEFAULT_AUTHENTICATION_CLASSES`; each only claims tokens matching its
  actor and steps aside otherwise, so `request.user` resolves to the right model with no
  extra routing.
- `/api/auth/token/refresh/` and `/api/auth/logout/` work for both actor types.
- Permission classes in `core/permissions.py`: `IsAdminPortalUser`, `role_required(*roles)`
  (SUPER_ADMIN/KYC_REVIEWER/ACCOUNTS/SUPPORT), `IsCustomerUser`, `IsKYCApproved` (gates
  every post-approval CustomerApp page per the SRS's "Only Approved unlocks the app" rule).

## App layout

| App | Owns |
|---|---|
| `accounts` | AdminUser, Customer, OTP; both auth flows; Admin Users & Roles; Customers list/detail |
| `sales` | SalesPerson (display-only contact, no login) |
| `projects` | Project (township), Plot inventory, assignment/unassign/transfer + CSV bulk import |
| `kyc` | KYCSubmission (Step 2 + Step 3), admin review queue, decision log |
| `payments` | Milestone schedule generation, PaymentProof verification, MilestoneChangeRequest |
| `documents` | Document records; auto-generates the PDF receipt on payment approval |
| `tickets` | Ticket + threaded TicketMessage |
| `notifications` | Notification inbox, Banner, NotificationCampaign (compose/send/schedule) |
| `core` | AuditLog, SiteSettings (bank/UPI details, support contact), shared permissions/validators |

## Business rules encoded (from the SRS "Decisions confirmed")

- Anyone can sign in: an unknown email gets an OTP and becomes a self-registered customer
  (`accounts/services.py:get_login_customer`). Without a plot they submit KYC Step 1
  (claimed project + plot number as free text, Aadhaar, PAN), then wait for admin to assign a
  listed plot, which unlocks KYC Steps 2–3 (`core/permissions.py:IsCustomerWithPlot`). Until
  Step 1 is in, sign-ups stay out of the admin customers list and campaigns
  (`Customer.objects.on_record()`). Login and resend-OTP are throttled to 20/hour per IP.
- KYC resubmission is unlimited — only the rejected step needs to be redone.
- Milestone plans are generated per plot from `total_value`, `amount_paid_outside_app`
  and `instalment_count` captured at assignment (required for a primary buyer), but only once the
  buyer's KYC Step 2 booking receipt is approved, so instalment 2 falls due a month after approval
  (`payments/services.py:ensure_schedule`, called on assignment and on Step 2 approval).
  Instalment 1 is the KYC Step 2 booking receipt, recorded as PAID when Step 2 is approved; it
  covers the money paid outside the app, so only the excess counts separately
  (`outside_app_not_scheduled`).
- Payment proof is submitted against the **full** milestone amount; partial payment goes
  through a Milestone Change Request instead.
- No payment gateway — customers transfer via bank/UPI details from `SiteSettings` and
  upload proof.
- A customer-uploaded proof only moves a milestone to `UNDER_REVIEW`; only an admin
  approval marks it `PAID` and triggers the receipt. Customers don't enter a transaction ID:
  the admin enters the bank and transaction reference (checked against the bank statement)
  when approving a payment proof or generating the KYC receipt, and both print on the receipt.
- Unassigning/transferring a plot revokes that email's access immediately, even for an
  already-issued JWT (`CustomerJWTAuthentication` checks `customer.is_active` on every
  request). The email may sign in again later and starts over as a new customer
  (`restart_as_new_customer`); one switched off by an admin while still holding a plot stays blocked.
- Every admin mutation writes an `AuditLog` row.

## Scheduled jobs (wire up via cron / Celery beat in production)

```bash
python manage.py refresh_milestone_statuses   # promote DUE/OVERDUE nightly
python manage.py send_payment_reminders       # notify customers of upcoming/overdue dues
```

## Running tests / checks

```bash
python manage.py check
python manage.py makemigrations --check --dry-run   # fails if models drifted from migrations
```

## Notable endpoints

CustomerApp (prefix `/api/customer/`): `auth/login`, `auth/verify-otp`, `auth/resend-otp`,
`kyc/step1`, `kyc/plot-check`, `kyc/step2`, `kyc/step3`, `kyc/status`, `profile`, `profile/request-correction`,
`settings`, `sales-contact`, `plot`, `payments`, `payments/<id>`, `payments/<id>/pay`,
`payments/change-requests`, `documents`, `tickets`, `tickets/<id>/reply`, `notifications`,
`banners`.

Admin Portal (prefix `/api/admin/`): `auth/login`, `admin-users`, `customers`, `projects`,
`plots` (+ `assign`/`unassign`/`transfer`/`bulk-import`/`bulk-assign`/`history`),
`kyc-queue` (+ `<id>/decide`), `milestones`, `plots/<id>/generate-schedule`,
`payment-verification-queue` (+ `approve`/`reject`), `milestone-change-requests`
(+ `approve`/`decline`/`counter`), `payment-overview`, `documents`, `tickets`
(+ `reply`/`assign`/`status`), `banners`, `notifications/campaigns` (+ `send`/`schedule`/`delivery-log`),
`sales-team`, `audit-log`, `settings`.

Full, always-current list: `/api/docs/`.
