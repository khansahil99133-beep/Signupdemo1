# Infrastructure

This folder keeps the deployment helpers and binaries that ship with the project.

## Terraform

- The bundled installer sits in `terraform_1.14.3_windows_amd64/`. Use `terraform.exe` there (or replace with a newer version) whenever you run infrastructure automation.
- Add or update `.tf` files here as needed; the current binary is provided for convenience on Windows machines.

## Render deployment

- `render.yaml` at the repository root declares both the `softupkaran-backend` Node service and the `softupkaran-frontend` static site. Keep it in sync with the live Render project so changes to generated assets or backend builds publish automatically.

