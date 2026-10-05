# The API host is now created manually (SSH access), outside Terraform.
# Terraform still provides what it needs: ec2-sg (network.tf), the
# atomcap-ec2-profile instance profile (iam.tf), RDS, S3, secrets and ECR.
