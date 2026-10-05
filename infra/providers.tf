terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Local state for now. Back up terraform.tfstate after every apply (see README).
}

provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile

  # Refuse to touch any account other than the intended one.
  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = {
      Project   = var.project
      ManagedBy = "terraform"
    }
  }
}

data "aws_caller_identity" "current" {}
