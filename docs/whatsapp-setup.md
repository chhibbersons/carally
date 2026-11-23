# Connecting WhatsApp (test number)

This gets a dealer in the app talking to Meta's free WhatsApp **test number**,
so you can send and receive real messages on your own phone. It takes about
20 minutes. You need a Facebook account.

## 1. Create a Meta app

1. Go to <https://developers.facebook.com/apps> and click **Create app**.
2. Choose the use case **Connect with customers through WhatsApp**, then
   follow the steps. Meta creates a test business and a test phone number.
3. In the app, open **WhatsApp › API Setup**. Note down:
   - **Phone number ID** (a long number, not the phone number itself)
   - **WhatsApp Business Account ID**
   - The **temporary access token** (it lasts 24 hours; see step 6 for a permanent one)
4. On the same page, under **To**, add your own mobile number and confirm it
   with the code Meta sends. The test number can only message numbers on this list.
5. Open **App settings › Basic** and copy the **App secret**.

## 2. Fill in `.env`

```bash
WA_APP_SECRET=<App secret from step 1.5>
WA_VERIFY_TOKEN=<any long random text you make up>
WA_SYSTEM_USER_TOKEN=<temporary access token, or leave empty and paste it per dealer>
ENCRYPTION_KEY=<run: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))">
```

Then apply the new database tables:

```bash
pnpm db:migrate
```

## 3. Start the app, the worker and a tunnel

Meta has to reach your laptop over the internet, so you need a tunnel. Use
three terminals:

```bash
pnpm dev
pnpm worker          # processes incoming messages; keep it running
cloudflared tunnel --url http://localhost:3000
```

`cloudflared` prints an address like `https://something.trycloudflare.com`.
(Install it from <https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/>.)
The address changes every time you restart cloudflared, so repeat step 4 when it does.

## 4. Point Meta's webhook at the app

1. In the Meta app, open **WhatsApp › Configuration**.
2. Under **Webhook**, click **Edit**:
   - Callback URL: `https://something.trycloudflare.com/api/webhooks/whatsapp`
   - Verify token: the same `WA_VERIFY_TOKEN` as in `.env`
3. Click **Verify and save**. If it fails, check that `pnpm dev` and the tunnel are running.
4. Under **Webhook fields**, click **Manage** and subscribe to **messages**.

## 5. Connect the dealer and try it

1. Log in as the operator, open **Dealers**, and click the dealer's name.
2. Paste the **Phone number ID** (and optionally the account ID and token), then **Save**.
3. Under **Send a test message**, enter your mobile and send the
   **"Hello World" template**. It should arrive on your phone within seconds,
   and the status in **Recent WhatsApp messages** changes to delivered and
   read when you refresh.
4. Reply to it from your phone. Refresh the page: your message appears as
   **Received**.
5. Now **My own text** works too, for 24 hours after your last message. Before
   that, or after it, the app refuses and explains why. That's Meta's 24-hour rule.
6. Send **STOP** from your phone. The app marks you as opted out, sends one
   confirmation, and blocks every other message. Send **START** to opt back in.

## 6. A token that doesn't expire

The temporary token stops working after 24 hours. For a permanent one, in
Meta Business Settings create a **System user**, give it access to the app
and the WhatsApp account, and generate a token with the
`whatsapp_business_messaging` and `whatsapp_business_management` permissions.
Put it in `WA_SYSTEM_USER_TOKEN`, or paste it on the dealer's page (it is
stored encrypted).
