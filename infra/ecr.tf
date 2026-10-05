resource "aws_ecr_repository" "api" {
  name                 = "atom-api"
  image_tag_mutability = "MUTABLE"
  force_delete         = true # images are rebuildable; lets terraform destroy succeed

  image_scanning_configuration {
    scan_on_push = true # basic scanning is free
  }

  encryption_configuration {
    encryption_type = "AES256"
  }
}

# Keep storage under the 500 MB free allowance.
resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 5 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 5
      }
      action = { type = "expire" }
    }]
  })
}

# App secret container. Values (DB app user password, JWT keys, etc.) are set
# out-of-band with `aws secretsmanager put-secret-value`, never in Terraform/state.
resource "aws_secretsmanager_secret" "app" {
  name                    = "${var.project}/app"
  description             = "Atom Capitol application secrets"
  recovery_window_in_days = 0 # delete immediately on destroy so the name is reusable
}
