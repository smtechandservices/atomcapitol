resource "aws_db_subnet_group" "this" {
  name        = "${var.project}-db-subnets"
  description = "Default VPC subnets; instance is private (no public IP)"
  subnet_ids  = data.aws_subnets.default.ids
}

resource "aws_db_parameter_group" "pg16" {
  name        = "${var.project}-pg16"
  family      = "postgres16"
  description = "Atom Capitol Postgres 16: force SSL"

  parameter {
    name         = "rds.force_ssl"
    value        = "1"
    apply_method = "pending-reboot" # what RDS stores for this param; avoids a perpetual diff
  }
}

resource "aws_db_instance" "this" {
  identifier     = "${var.project}-db"
  engine         = "postgres"
  engine_version = "16"
  instance_class = var.db_instance_class

  allocated_storage = var.db_allocated_storage_gb
  storage_type      = "gp3"
  storage_encrypted = true # aws/rds managed key, no KMS charge
  # max_allocated_storage omitted: storage autoscaling off, so it can't grow past the free 20 GB.

  db_name                     = var.db_name
  username                    = var.db_master_username
  manage_master_user_password = true # RDS stores/rotates it in Secrets Manager

  availability_zone      = var.availability_zone
  multi_az               = false
  publicly_accessible    = false
  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  parameter_group_name   = aws_db_parameter_group.pg16.name

  backup_retention_period    = 1
  backup_window              = "20:30-21:00" # 02:00-02:30 IST
  maintenance_window         = "sun:21:30-sun:22:30"
  auto_minor_version_upgrade = true
  copy_tags_to_snapshot      = true

  performance_insights_enabled = false
  monitoring_interval          = 0

  deletion_protection = false
  skip_final_snapshot = true
  apply_immediately   = true
}

resource "aws_cloudwatch_metric_alarm" "rds_free_storage" {
  alarm_name          = "${var.project}-rds-free-storage-low"
  alarm_description   = "RDS free storage below 2 GB"
  namespace           = "AWS/RDS"
  metric_name         = "FreeStorageSpace"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.this.identifier }
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "LessThanThreshold"
  threshold           = 2 * 1024 * 1024 * 1024
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}
