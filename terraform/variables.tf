variable "aws_region" {
  description = "AWS region to deploy resources"
  type        = string
  default     = "us-east-1"
}

variable "db_password" {
  description = "Password for the PostgreSQL database"
  type        = string
  sensitive   = truex
}

variable "secret_key" {
  description = "Secret key for the application"
  type        = string
  sensitive   = true
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "llm-proxy"
} 