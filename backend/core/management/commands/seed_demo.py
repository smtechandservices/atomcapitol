"""Populates the dev database with demo data covering every admin-portal workflow.

    python manage.py seed_demo           # create demo data (skips if it already exists)
    python manage.py seed_demo --reset   # wipe previous demo data first, then recreate

Everything demo-owned uses the @demo.atomcapitol.com email domain or a "Demo" project
name, so --reset never touches real records.
"""

import io
from datetime import date, timedelta
from decimal import Decimal

from dateutil.relativedelta import relativedelta
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from PIL import Image, ImageDraw
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from accounts.models import AdminUser, Customer
from core.models import SiteSettings
from documents.models import Document
from kyc import services as kyc_services
from kyc.models import KYCSubmission
from notifications.models import Banner, NotificationCampaign
from notifications.services import send_campaign
from payments import services as pay_services
from payments.models import Milestone, MilestoneChangeRequest
from projects.models import Plot, Project, ProjectImage
from projects.services import assign_plot
from sales.models import SalesPerson
from tickets.models import Ticket, TicketMessage

DOMAIN = "demo.atomcapitol.com"
PROJECT_NAMES = ["Demo Atom Greens", "Demo Capitol Heights", "Demo Riverside Enclave"]
BANNER_PREFIX = "[Demo]"


def _pdf(title, *lines):
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    y = A4[1] - 60
    c.setFont("Helvetica-Bold", 16)
    c.drawString(50, y, title)
    c.setFont("Helvetica", 11)
    for line in lines:
        y -= 20
        c.drawString(50, y, line)
    c.save()
    return buf.getvalue()


def _png(text, color, size=(1200, 600)):
    img = Image.new("RGB", size, color)
    ImageDraw.Draw(img).text((40, size[1] // 2 - 10), text, fill="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _email(local):
    return f"{local}@{DOMAIN}"


class Command(BaseCommand):
    help = "Seed the database with demo data for testing every admin workflow."

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="Delete existing demo data first.")

    def handle(self, *args, reset=False, **options):
        if reset:
            self._reset()
        elif Project.objects.filter(name__in=PROJECT_NAMES).exists():
            self.stdout.write(self.style.WARNING("Demo data already exists. Use --reset to recreate it."))
            return

        with transaction.atomic():
            self._seed()
        self._summary()

    # ------------------------------------------------------------------ reset
    def _reset(self):
        Customer.objects.filter(email__endswith=f"@{DOMAIN}").delete()
        Project.objects.filter(name__in=PROJECT_NAMES).delete()
        AdminUser.objects.filter(email__endswith=f"@{DOMAIN}").delete()
        SalesPerson.objects.filter(email__endswith=f"@{DOMAIN}").delete()
        Banner.objects.filter(title__startswith=BANNER_PREFIX).delete()
        NotificationCampaign.objects.filter(title__startswith=BANNER_PREFIX).delete()
        self.stdout.write("Removed previous demo data.")

    # ------------------------------------------------------------------- seed
    def _seed(self):
        self.admin = AdminUser.objects.filter(role=AdminUser.Role.SUPER_ADMIN).first()

        self._site_settings()
        self._admin_users()
        self._sales_team()
        self._projects_and_plots()
        self._customers()
        self._tickets()
        self._documents()
        self._banners_and_campaigns()

    def _site_settings(self):
        s = SiteSettings.load()
        s.company_name = "Atom Capitol"
        s.support_phone = "+91 98765 43210"
        s.support_email = "support@atomcapitol.com"
        s.bank_account_name = "Atom Capitol Developers Pvt Ltd"
        s.bank_account_number = "50200012345678"
        s.bank_ifsc = "HDFC0001234"
        s.bank_name = "HDFC Bank"
        s.upi_id = "atomcapitol@hdfcbank"
        s.receipt_template_note = "This is a computer-generated receipt and does not require a signature."
        s.save()

    def _admin_users(self):
        for local, role, first, pwd in [
            ("kyc", AdminUser.Role.KYC_REVIEWER, "Kavya", "Kyc@12345"),
            ("accounts", AdminUser.Role.ACCOUNTS, "Arjun", "Accounts@12345"),
            ("support", AdminUser.Role.SUPPORT, "Sneha", "Support@12345"),
        ]:
            AdminUser.objects.create_user(_email(local), pwd, role=role, first_name=first, last_name="Demo")

    def _sales_team(self):
        self.sales = [
            SalesPerson.objects.create(name=name, phone=phone, email=_email(local))
            for name, phone, local in [
                ("Rohit Sharma", "+91 90000 11111", "rohit.sales"),
                ("Priya Mehta", "+91 90000 22222", "priya.sales"),
                ("Vikram Singh", "+91 90000 33333", "vikram.sales"),
            ]
        ]
        self.sales[2].is_active = False
        self.sales[2].save()

    def _projects_and_plots(self):
        specs = [
            (PROJECT_NAMES[0], "Sector 150, Noida", "28.4089", "77.4926", Project.DevelopmentStatus.UNDER_CONSTRUCTION, True, "#2f6f4f"),
            (PROJECT_NAMES[1], "Yamuna Expressway, Greater Noida", "28.3670", "77.5400", Project.DevelopmentStatus.READY, True, "#1f4e79"),
            (PROJECT_NAMES[2], "Sohna Road, Gurugram", "28.2500", "77.0650", Project.DevelopmentStatus.PLANNING, False, "#7a4b2a"),
        ]
        self.projects = []
        for name, loc, lat, lng, dev_status, published, color in specs:
            p = Project.objects.create(
                name=name,
                location=loc,
                latitude=Decimal(lat),
                longitude=Decimal(lng),
                description=f"{name} is a gated plotted township with wide roads, parks and full utilities.",
                amenities=["Clubhouse", "24x7 security", "Children's park", "Jogging track", "Underground cabling"],
                development_status=dev_status,
                is_published=published,
            )
            p.brochure.save(f"{p.pk}-brochure.pdf", ContentFile(_pdf(f"{name} Brochure", loc, "Plots from 1000 sq.ft")), save=True)
            img = ProjectImage(project=p, image_type=ProjectImage.ImageType.LAYOUT, caption="Site layout", order=0)
            img.image.save(f"{p.pk}-layout.png", ContentFile(_png(f"{name} - Layout", color)), save=True)
            for i in range(1, 3):
                img = ProjectImage(project=p, image_type=ProjectImage.ImageType.GALLERY, caption=f"View {i}", order=i)
                img.image.save(f"{p.pk}-gallery-{i}.png", ContentFile(_png(f"{name} - Gallery {i}", color)), save=True)
            self.projects.append(p)

        # 8 plots per project; the first ~6 in the first two projects get buyers below.
        self.plots = {}
        for p_idx, p in enumerate(self.projects):
            for n in range(1, 9):
                size = [1000, 1200, 1500, 2000][n % 4]
                plot = Plot.objects.create(
                    project=p,
                    plot_number=f"{'ABC'[p_idx]}-{100 + n}",
                    size=f"{size} sq.ft",
                    block_sector=f"Block {'ABC'[n % 3]}",
                    price=Decimal(size * 4500),
                )
                self.plots[(p_idx, n)] = plot
        # One sold plot with no app user, to show inventory states.
        sold = self.plots[(1, 8)]
        sold.status = Plot.Status.SOLD
        sold.booking_date = date.today() - timedelta(days=400)
        sold.save()

    def _buyer(self, plot_key, local, name, phone, *, instalments, paid_outside, start_months_ago, sales_idx=0):
        """Assigns a primary buyer and builds a milestone schedule starting in the past."""
        plot = self.plots[plot_key]
        customer = assign_plot(plot, _email(local), name=name, phone=phone, performed_by=self.admin)
        customer.address = "221B, Demo Street, New Delhi"
        customer.assigned_sales_person = self.sales[sales_idx]
        customer.save()

        plot.total_value = plot.price
        plot.amount_paid_outside_app = Decimal(paid_outside)
        plot.instalment_count = instalments
        plot.booking_date = date.today() - relativedelta(months=start_months_ago + 1)
        plot.save()
        start = date.today() - relativedelta(months=start_months_ago) + timedelta(days=5)
        pay_services.generate_milestone_schedule(plot, start_date=start)
        return customer

    def _kyc_step2(self, customer, *, hours_ago):
        sub = kyc_services.submit_step2(
            customer,
            plot_confirmed=True,
            plot_mismatch_note="",
            receipt_file=ContentFile(
                _pdf("Booking Receipt", f"Customer: {customer.name}", f"Plot: {customer.assigned_plot}", "Amount: 5,00,000"),
                name=f"receipt-{customer.pk}.pdf",
            ),
            receipt_amount=Decimal("500000"),
            receipt_payment_date=date.today() - timedelta(days=30),
        )
        KYCSubmission.objects.filter(pk=sub.pk).update(step2_submitted_at=timezone.now() - timedelta(hours=hours_ago))
        return sub

    def _kyc_step3(self, customer, *, hours_ago):
        # Placeholder bytes: no video encoder is available here, so this file won't play in a browser.
        sub = kyc_services.submit_step3(
            customer, video_file=ContentFile(b"\x00\x00\x00\x18ftypmp42demo-video", name=f"kyc-{customer.pk}.mp4")
        )
        KYCSubmission.objects.filter(pk=sub.pk).update(step3_submitted_at=timezone.now() - timedelta(hours=hours_ago))
        sub.refresh_from_db()
        return sub

    def _approve_kyc(self, customer):
        sub = customer.kyc_submission
        for step in ("STEP2", "STEP3"):
            kyc_services.decide_step(sub, step=step, decision="APPROVED", reason="", admin_user=self.admin)

    def _proof(self, milestone, customer, *, ref):
        return pay_services.submit_payment_proof(
            milestone,
            customer,
            file=ContentFile(
                _pdf("Bank Transfer Confirmation", f"Ref: {ref}", f"Amount: {milestone.amount}"), name=f"proof-{ref}.pdf"
            ),
            claimed_amount=milestone.amount,
            payment_date=min(milestone.due_date, date.today()),
            payment_mode="NEFT",
            transaction_reference=ref,
        )

    def _customers(self):
        c = {}
        # 1. Fresh buyer, never logged in — use to walk the customer KYC flow yourself.
        c["new"] = self._buyer((0, 1), "aarav", "Aarav Gupta", "+91 91111 00001",
                               instalments=12, paid_outside=500000, start_months_ago=0)

        # 2-4. Full KYC submitted, both steps pending — approve/reject these in the KYC queue.
        for key, plot_key, local, name, hrs in [
            ("pending1", (0, 2), "isha", "Isha Verma", 2),
            ("pending2", (0, 3), "kabir", "Kabir Malhotra", 26),
            ("pending3", (1, 1), "meera", "Meera Iyer", 75),
        ]:
            c[key] = self._buyer(plot_key, local, name, f"+91 91111 0000{len(c) + 1}",
                                 instalments=10, paid_outside=400000, start_months_ago=1, sales_idx=1)
            self._kyc_step2(c[key], hours_ago=hrs + 1)
            self._kyc_step3(c[key], hours_ago=hrs)

        # 5. Only step 2 submitted (video not yet recorded).
        c["partial"] = self._buyer((1, 2), "nikhil", "Nikhil Rao", "+91 91111 00005",
                                   instalments=10, paid_outside=300000, start_months_ago=0)
        self._kyc_step2(c["partial"], hours_ago=5)

        # 6. Step 2 rejected, step 3 pending — shows the rejection/resubmit path.
        c["rejected"] = self._buyer((1, 3), "pooja", "Pooja Nair", "+91 91111 00006",
                                    instalments=8, paid_outside=250000, start_months_ago=0)
        sub = self._kyc_step2(c["rejected"], hours_ago=50)
        self._kyc_step3(c["rejected"], hours_ago=49)
        kyc_services.decide_step(sub, step="STEP2", decision="REJECTED",
                                 reason="Receipt image is blurry; please upload a clearer copy.", admin_user=self.admin)

        # 7. KYC approved, payments in flight: 3 paid, 1 proof awaiting review, 1 overdue behind it.
        c["active"] = self._buyer((0, 4), "rahul", "Rahul Kapoor", "+91 91111 00007",
                                  instalments=12, paid_outside=600000, start_months_ago=5, sales_idx=1)
        self._kyc_step2(c["active"], hours_ago=24 * 150)
        self._kyc_step3(c["active"], hours_ago=24 * 150)
        self._approve_kyc(c["active"])
        ms = list(c["active"].assigned_plot.milestones.order_by("sequence"))
        for i, m in enumerate(ms[:3]):
            m.refresh_from_db()
            proof = self._proof(m, c["active"], ref=f"NEFT-RK-{1000 + i}")
            pay_services.approve_payment_proof(proof, self.admin)
        ms[3].refresh_from_db()
        self._proof(ms[3], c["active"], ref="NEFT-RK-1003")

        # 8. KYC approved, overdue with a rejected proof and a fresh pending one.
        c["overdue"] = self._buyer((0, 5), "sanya", "Sanya Bhatia", "+91 91111 00008",
                                   instalments=6, paid_outside=800000, start_months_ago=3)
        self._kyc_step2(c["overdue"], hours_ago=24 * 90)
        self._kyc_step3(c["overdue"], hours_ago=24 * 90)
        self._approve_kyc(c["overdue"])
        m1 = c["overdue"].assigned_plot.milestones.order_by("sequence").first()
        bad = self._proof(m1, c["overdue"], ref="UPI-SB-0001")
        pay_services.reject_payment_proof(bad, self.admin, reason="Amount on the screenshot does not match the milestone.")
        m1.refresh_from_db()
        self._proof(m1, c["overdue"], ref="UPI-SB-0002")

        # 9. Co-applicant on Rahul's plot.
        c["coapp"] = assign_plot(c["active"].assigned_plot, _email("anjali"), role="CO_APPLICANT",
                                 name="Anjali Kapoor", phone="+91 91111 00009", performed_by=self.admin)

        # 10. KYC approved with milestone change requests pending admin review.
        c["change"] = self._buyer((1, 4), "vivek", "Vivek Joshi", "+91 91111 00010",
                                  instalments=10, paid_outside=500000, start_months_ago=2, sales_idx=1)
        self._kyc_step2(c["change"], hours_ago=24 * 60)
        self._kyc_step3(c["change"], hours_ago=24 * 60)
        self._approve_kyc(c["change"])
        plot = c["change"].assigned_plot
        pay_services.create_change_request(
            c["change"], plot, change_type=MilestoneChangeRequest.ChangeType.CHANGE_DATE,
            proposed_details={"milestone_sequence": 3, "new_due_date": str(date.today() + timedelta(days=45))},
            reason="Salary credit is delayed this month; requesting a 3-week extension.",
        )
        pay_services.create_change_request(
            c["change"], plot, change_type=MilestoneChangeRequest.ChangeType.CHANGE_INSTALMENTS,
            proposed_details={"new_instalment_count": 14},
            reason="Would like to spread the remaining balance over more months.",
        )
        pay_services.create_change_request(
            c["overdue"], c["overdue"].assigned_plot, change_type=MilestoneChangeRequest.ChangeType.PAY_MORE,
            proposed_details={"amount": "300000"},
            reason="Received a bonus, want to prepay part of the balance.",
        )

        # 11. Fully paid-up buyer whose registry is in progress.
        c["done"] = self._buyer((1, 5), "tanvi", "Tanvi Desai", "+91 91111 00011",
                                instalments=3, paid_outside=5000000, start_months_ago=4)
        self._kyc_step2(c["done"], hours_ago=24 * 130)
        self._kyc_step3(c["done"], hours_ago=24 * 130)
        self._approve_kyc(c["done"])
        for i, m in enumerate(c["done"].assigned_plot.milestones.order_by("sequence")):
            m.refresh_from_db()
            pay_services.approve_payment_proof(self._proof(m, c["done"], ref=f"RTGS-TD-{i}"), self.admin)
        plot = c["done"].assigned_plot
        plot.status = Plot.Status.SOLD
        plot.save()

        self.customers = c

    def _tickets(self):
        c = self.customers
        support = AdminUser.objects.get(email=_email("support"))
        specs = [
            (c["active"], Ticket.Category.PAYMENT, Ticket.Status.OPEN, None,
             "Receipt not visible for instalment 2", "I paid instalment 2 but the receipt is missing in Documents.", []),
            (c["overdue"], Ticket.Category.PAYMENT, Ticket.Status.IN_PROGRESS, support,
             "Why was my payment proof rejected?", "I uploaded the UPI screenshot, please check again.",
             [("ADMIN", "The amount on the screenshot was lower than the milestone. Please upload the full transfer."),
              ("CUSTOMER", "I have re-uploaded the correct screenshot now.")]),
            (c["change"], Ticket.Category.CONSTRUCTION, Ticket.Status.OPEN, None,
             "Road work status near Block B", "When will the internal roads near Block B be completed?", []),
            (c["done"], Ticket.Category.DOCUMENTS, Ticket.Status.RESOLVED, support,
             "Registry appointment date", "Please share the registry appointment date.",
             [("ADMIN", "Your registry is scheduled for next month; we will upload the draft soon.")]),
            (c["pending1"], Ticket.Category.GENERAL, Ticket.Status.CLOSED, support,
             "How long does KYC take?", "I submitted my KYC, how long will verification take?",
             [("ADMIN", "Usually within 48 hours.")]),
        ]
        for customer, cat, status, assignee, subject, desc, thread in specs:
            t = Ticket.objects.create(customer=customer, category=cat, status=status, assigned_to=assignee,
                                      subject=subject, description=desc)
            TicketMessage.objects.create(ticket=t, sender_type="CUSTOMER", sender_customer=customer, message=desc)
            for sender, msg in thread:
                TicketMessage.objects.create(
                    ticket=t, sender_type=sender, message=msg,
                    sender_customer=customer if sender == "CUSTOMER" else None,
                    sender_admin=support if sender == "ADMIN" else None,
                )

    def _documents(self):
        c = self.customers

        def doc(name, doc_type, status, *, customer=None, project=None, visible=True):
            d = Document(name=name, doc_type=doc_type, status=status, customer=customer, project=project,
                         is_visible_to_customer=visible, uploaded_by=self.admin)
            if status == Document.DocStatus.ISSUED:
                d.file.save(f"{name.lower().replace(' ', '-')}.pdf", ContentFile(_pdf(name, "Demo document")), save=False)
            d.save()

        doc("Allotment Letter", Document.DocType.LEGAL, Document.DocStatus.ISSUED, customer=c["active"])
        doc("Sale Deed Draft", Document.DocType.REGISTRY, Document.DocStatus.IN_PROGRESS, customer=c["done"])
        doc("Allotment Letter", Document.DocType.LEGAL, Document.DocStatus.ISSUED, customer=c["done"])
        doc("RERA Certificate", Document.DocType.LEGAL, Document.DocStatus.ISSUED, project=self.projects[0])
        doc("Approved Layout Plan", Document.DocType.OTHER, Document.DocStatus.ISSUED, project=self.projects[1])
        doc("Internal Valuation Note", Document.DocType.OTHER, Document.DocStatus.ISSUED, project=self.projects[0], visible=False)

    def _banners_and_campaigns(self):
        for i, (title, color, active) in enumerate([
            ("Festive offer: 5% off on Capitol Heights", "#b5462b", True),
            ("Site visit every Sunday", "#2f6f4f", True),
            ("Old monsoon offer", "#555555", False),
        ]):
            b = Banner(title=f"{BANNER_PREFIX} {title}", link_target="projects", display_order=i, is_active=active,
                       start_date=date.today() - timedelta(days=7), end_date=date.today() + timedelta(days=30))
            b.image.save(f"banner-{i}.png", ContentFile(_png(title, color, (1200, 400))), save=True)

        sent = NotificationCampaign.objects.create(
            title=f"{BANNER_PREFIX} Construction update", body="Boundary wall work at Atom Greens is complete.",
            target_type=NotificationCampaign.TargetType.PROJECT, target_project=self.projects[0], created_by=self.admin,
        )
        send_campaign(sent)
        NotificationCampaign.objects.create(
            title=f"{BANNER_PREFIX} Diwali greetings", body="Wishing you and your family a happy Diwali!",
            created_by=self.admin,
        )
        NotificationCampaign.objects.create(
            title=f"{BANNER_PREFIX} Registry camp (draft)", body="Registry camp this weekend at the site office.",
            channel=NotificationCampaign.Channel.EMAIL, created_by=self.admin,
        )

    # ---------------------------------------------------------------- summary
    def _summary(self):
        w = self.stdout.write
        w(self.style.SUCCESS("\nDemo data created.\n"))
        w("Admin logins (plus your existing super admin):")
        w(f"  kyc@{DOMAIN} / Kyc@12345           (KYC_REVIEWER)")
        w(f"  accounts@{DOMAIN} / Accounts@12345 (ACCOUNTS)")
        w(f"  support@{DOMAIN} / Support@12345   (SUPPORT)\n")
        w("Customers (OTP login, code prints in the runserver console):")
        for c in Customer.objects.filter(email__endswith=f"@{DOMAIN}").order_by("pk"):
            w(f"  {c.email:32} {c.kyc_status:12} {c.assigned_plot}")
        w("\nWaiting for you:")
        w(f"  KYC submissions pending:   {KYCSubmission.objects.filter(customer__email__endswith=DOMAIN, customer__kyc_status='SUBMITTED').count()}")
        w(f"  Payment proofs pending:    {Milestone.objects.filter(status='UNDER_REVIEW', plot__project__name__in=PROJECT_NAMES).count()}")
        w(f"  Change requests pending:   {MilestoneChangeRequest.objects.filter(status='PENDING').count()}")
        w(f"  Open tickets:              {Ticket.objects.filter(status__in=['OPEN', 'IN_PROGRESS']).count()}")
