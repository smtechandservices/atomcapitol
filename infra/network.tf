data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

data "aws_subnet" "app" {
  vpc_id            = data.aws_vpc.default.id
  availability_zone = var.availability_zone
  default_for_az    = true
}

# --- EC2: HTTP/HTTPS from anywhere, no SSH (access is via SSM Session Manager) ---
resource "aws_security_group" "ec2" {
  name        = "${var.project}-ec2-sg"
  description = "Atom Capitol API host: 80/443 public, no SSH"
  vpc_id      = data.aws_vpc.default.id
  tags        = { Name = "${var.project}-ec2-sg" }
}

resource "aws_vpc_security_group_ingress_rule" "ec2_http" {
  security_group_id = aws_security_group.ec2.id
  description       = "HTTP"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_ingress_rule" "ec2_https" {
  security_group_id = aws_security_group.ec2.id
  description       = "HTTPS"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_egress_rule" "ec2_all" {
  security_group_id = aws_security_group.ec2.id
  description       = "Outbound (SSM, ECR, S3, SES, apt, RDS)"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

# --- RDS: Postgres only from the EC2 security group; no egress rules ---
resource "aws_security_group" "rds" {
  name        = "${var.project}-rds-sg"
  description = "Atom Capitol Postgres: 5432 from ec2-sg only"
  vpc_id      = data.aws_vpc.default.id
  tags        = { Name = "${var.project}-rds-sg" }
}

resource "aws_vpc_security_group_ingress_rule" "rds_from_ec2" {
  security_group_id            = aws_security_group.rds.id
  description                  = "Postgres from API host"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.ec2.id
}
