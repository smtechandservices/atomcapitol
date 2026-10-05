variable "project" {
  description = "Name prefix for all resources."
  type        = string
  default     = "atomcap"
}

variable "aws_profile" {
  description = "AWS CLI profile (IAM user claude-deploy). Never root."
  type        = string
  default     = "claude-deploy"
}

variable "aws_region" {
  type    = string
  default = "ap-south-1"
}

variable "aws_account_id" {
  description = "Guard rail: Terraform refuses to run against any other account."
  type        = string
}

variable "availability_zone" {
  description = "Single AZ for both EC2 and RDS (avoids cross-AZ data transfer charges)."
  type        = string
  default     = "ap-south-1a"
}

variable "ec2_instance_type" {
  description = "t3.micro (amd64) or t4g.micro (arm64). Docker images must match the architecture."
  type        = string
  default     = "t3.micro"
}

variable "ec2_root_volume_gb" {
  type    = number
  default = 20
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "db_allocated_storage_gb" {
  type    = number
  default = 20
}

variable "db_name" {
  type    = string
  default = "atomcap"
}

variable "db_master_username" {
  description = "Master user; password is generated and stored in Secrets Manager by RDS. The app uses atom_app, not this."
  type        = string
  default     = "atom_master"
}

variable "bucket_suffix" {
  description = "Globally-unique suffix for S3 bucket names, e.g. atomcap-kyc-videos-<suffix>."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9-]{3,20}$", var.bucket_suffix))
    error_message = "bucket_suffix must be 3-20 chars of lowercase letters, digits or hyphens."
  }
}

variable "s3_force_destroy" {
  description = "Allow terraform destroy to delete non-empty buckets. Set false once real customer data exists."
  type        = bool
  default     = false
}

variable "domain_name" {
  description = "Optional API domain (e.g. api.example.com). Empty = HTTP on the Elastic IP only."
  type        = string
  default     = ""
}

variable "alert_email" {
  description = "Receives budget alerts and CloudWatch alarm notifications."
  type        = string
}

variable "monthly_budget_usd" {
  type    = number
  default = 5
}
