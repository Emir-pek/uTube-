import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.header import Header
from email.utils import formataddr
import os
import sys

def send_verification_email(to_email: str, code: str) -> bool:
    """
    Sends an OTP verification email to the user.
    
    Modes:
      - MOCK MODE: If SMTP credentials are not set, prints the code to the terminal.
      - REAL MODE: Sends via SMTP (STARTTLS on port 587, or SSL on port 465).
    
    Returns True if sent/logged successfully, False on error.
    """
    smtp_server = os.getenv("SMTP_SERVER", "").strip()
    smtp_port = os.getenv("SMTP_PORT", "587").strip()
    smtp_username = os.getenv("SMTP_USERNAME", "").strip()
    smtp_password = os.getenv("SMTP_PASSWORD", "").strip()
    sender_email = os.getenv("SMTP_SENDER_EMAIL", "").strip() or smtp_username
    display_name = os.getenv("SMTP_DISPLAY_NAME", "").strip()
    formatted_sender = formataddr((str(Header(display_name, 'utf-8')), sender_email)) if display_name else sender_email

    # ── MOCK MODE ──
    if not smtp_server or not smtp_username or not smtp_password:
        try:
            print("\n" + "=" * 60, flush=True)
            print("[MOCK EMAIL] No SMTP configured - printing code to terminal", flush=True)
            print("=" * 60, flush=True)
            print(f"  To:      {to_email}", flush=True)
            print(f"  Subject: Your uTube Verification Code", flush=True)
            print(f"  Code:    {code}", flush=True)
            print("=" * 60, flush=True)
            print(f"[OTP] Verification code for {to_email}: {code}", flush=True)
            print("=" * 60 + "\n", flush=True)
        except Exception:
            sys.stderr.write(f"[OTP] Verification code for {to_email}: {code}\n")
            sys.stderr.flush()
        return True

    # ── REAL MODE: Send via SMTP ──
    port = int(smtp_port)
    
    print(f"[EMAIL] Sending verification email to {to_email}...", flush=True)
    print(f"[EMAIL] SMTP: {smtp_server}:{port} | From: {sender_email}", flush=True)

    # Build the email message
    msg = MIMEMultipart("alternative")
    msg["From"] = formatted_sender
    msg["To"] = to_email
    msg["Subject"] = "Your uTube Verification Code"
    
    # Plain text fallback
    text_body = (
        f"Welcome to uTube!\n\n"
        f"Your verification code is: {code}\n\n"
        f"This code will expire in 15 minutes.\n"
        f"If you did not request this, please ignore this email."
    )
    
    # HTML body
    html_body = f"""
    <html>
        <body style="font-family: Arial, sans-serif; background-color: #0f0f0f; color: #ffffff; padding: 30px;">
            <div style="max-width: 480px; margin: 0 auto; background-color: #1a1a1a; border-radius: 16px; padding: 40px; border: 1px solid #333;">
                <h2 style="color: #ffffff; margin-bottom: 8px;">Welcome to uTube!</h2>
                <p style="color: #aaaaaa;">To complete your registration, enter the following verification code:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <span style="font-size: 36px; font-weight: bold; color: #e50914; letter-spacing: 8px; font-family: monospace;">{code}</span>
                </div>
                <p style="color: #888888; font-size: 13px;">This code will expire in 15 minutes.</p>
                <p style="color: #666666; font-size: 12px;">If you did not request this, please ignore this email.</p>
            </div>
        </body>
    </html>
    """
    
    msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    try:
        if port == 465:
            # ── SSL Mode (port 465) ──
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(smtp_server, port, context=context) as server:
                server.login(smtp_username, smtp_password)
                server.send_message(msg)
        else:
            # ── STARTTLS Mode (port 587 or other) ──
            context = ssl.create_default_context()
            with smtplib.SMTP(smtp_server, port, timeout=15) as server:
                server.ehlo()
                server.starttls(context=context)
                server.ehlo()
                server.login(smtp_username, smtp_password)
                server.send_message(msg)

        print(f"[EMAIL OK] Verification code sent to {to_email}", flush=True)
        return True

    except smtplib.SMTPAuthenticationError as e:
        print(f"[EMAIL ERROR] Authentication failed for '{smtp_username}'.", flush=True)
        print(f"[EMAIL ERROR] Detail: {e}", flush=True)
        print(f"[EMAIL HINT] If using Gmail, you need a 16-character App Password, not your regular password.", flush=True)
        print(f"[EMAIL HINT] Generate one at: https://myaccount.google.com/apppasswords", flush=True)
        print(f"[OTP FALLBACK] Code for {to_email}: {code}", flush=True)
        return False

    except smtplib.SMTPConnectError as e:
        print(f"[EMAIL ERROR] Could not connect to {smtp_server}:{port}: {e}", flush=True)
        print(f"[OTP FALLBACK] Code for {to_email}: {code}", flush=True)
        return False

    except smtplib.SMTPRecipientsRefused as e:
        print(f"[EMAIL ERROR] Recipient refused: {to_email}: {e}", flush=True)
        print(f"[OTP FALLBACK] Code for {to_email}: {code}", flush=True)
        return False

    except (TimeoutError, ConnectionError, OSError) as e:
        print(f"[EMAIL ERROR] Network error connecting to {smtp_server}:{port}: {type(e).__name__}: {e}", flush=True)
        print(f"[OTP FALLBACK] Code for {to_email}: {code}", flush=True)
        return False

    except Exception as e:
        print(f"[EMAIL ERROR] Unexpected error: {type(e).__name__}: {e}", flush=True)
        print(f"[OTP FALLBACK] Code for {to_email}: {code}", flush=True)
        return False
