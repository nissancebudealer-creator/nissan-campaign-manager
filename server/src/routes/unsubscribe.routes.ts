import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { processUnsubscribeToken } from "../services/unsubscribe.service.js";

export const unsubscribeRouter = Router();

const CHANNEL_LABELS: Record<string, string> = { EMAIL: "email", WHATSAPP: "WhatsApp", VIBER: "Viber" };

function page(title: string, body: string) {
  return `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>${title}</title></head>
  <body style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#0f172a;">
    <h1 style="font-size:20px;">${title}</h1>
    <p style="color:#475569;">${body}</p>
  </body>
</html>`;
}

// Public, no auth — this is the link that goes out in every marketing email. Token is a signed,
// tamper-resistant contact+channel pair (see unsubscribe.service.ts), not a raw contact id.
unsubscribeRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    const result = await processUnsubscribeToken(token);

    if (!result.ok) {
      res
        .status(400)
        .send(page("Link not valid", "This unsubscribe link is invalid or has expired."));
      return;
    }

    res.send(
      page(
        "You're unsubscribed",
        `You won't receive further ${CHANNEL_LABELS[result.channel] ?? result.channel} marketing messages from us.`,
      ),
    );
  }),
);
