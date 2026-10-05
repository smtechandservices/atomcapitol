output "rds_endpoint" {
  value = aws_db_instance.this.address
}

output "rds_master_secret_arn" {
  description = "RDS-managed master credentials (admin use only; the app uses atom_app)."
  value       = aws_db_instance.this.master_user_secret[0].secret_arn
}

output "app_secret_arn" {
  value = aws_secretsmanager_secret.app.arn
}

output "s3_buckets" {
  value = { for k, b in aws_s3_bucket.this : k => b.bucket }
}

output "ecr_repository_url" {
  value = aws_ecr_repository.api.repository_url
}


output "ec2_security_group_id" {
  description = "Attach to the manually created instance so it can reach RDS."
  value       = aws_security_group.ec2.id
}

output "ec2_instance_profile" {
  description = "Attach to the manually created instance (S3, SES, Secrets Manager, SSM without keys)."
  value       = aws_iam_instance_profile.ec2.name
}
