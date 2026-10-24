# Email password reset setup

The reset flow sends a one-time link to the address already saved on the DocuVault account. Configure these variables in the backend hosting provider (do not commit real credentials):

| Variable | Purpose |
| --- | --- |
| `SMTP_HOST` | Email provider SMTP server, such as `smtp.gmail.com` |
| `SMTP_PORT` | Usually `587` for STARTTLS or `465` for SSL |
| `SMTP_SECURE` | `false` for port 587; `true` for port 465 |
| `SMTP_USER` | Gmail address or other SMTP account used to send the email |
| `SMTP_PASS` | SMTP password; for Gmail, use a Google App Password |
| `SMTP_FROM` | Sender label and address, for example `DocuVault <account@gmail.com>` |
| `FRONTEND_URL` | Public frontend origin, with no trailing slash |

For Gmail, enable two-step verification and create an App Password for the sending account. The recipient is the user's registered DocuVault email; the sender account does not need to be the same address.

Reset links expire after 30 minutes and work once. Resetting changes only the account password; it does not delete or modify uploaded documents or trash records. When `VITE_API_URL` is unset, the frontend uses its local demo mode and shows a simulated reset link instead of sending email.
