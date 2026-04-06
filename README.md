# Abington OTP Desk

A standalone OTP generator and approval-servicing website for the Abington workflow.

## What it includes

- secure admin login
- stage-based OTP generation for `pending`, `processing`, `transferring`, and `successful`
- automatic fee mapping
- active queue management
- code regeneration
- completion history
- responsive mobile layout

## Admin login

- email: `abingtonbank@aol.com`
- password: `Inbox!2026`

## Local use

Open `index.html` directly in a browser, or serve the folder with any static server.

## Render

This repo includes `render.yaml` for a Render static-site deploy.

- service name: `abingtonotp`
- publish path: `.`
- build command: `echo "Static site ready"`

If the service name is available in your Render account, the site URL can be close to:

- `https://abingtonotp.onrender.com`

## Safety note

This website is an internal servicing preview and does not connect to any real payment rail, financial institution, or messaging provider.
