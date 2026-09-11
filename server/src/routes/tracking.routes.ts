import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getTrackingPixel, recordClickAndGetDestination, recordOpen } from "../services/tracking.service.js";

export const trackingRouter = Router();

// Public, no auth — embedded as an <img> in every sent campaign email.
trackingRouter.get(
  "/open/:recipientId.gif",
  asyncHandler(async (req, res) => {
    await recordOpen(req.params.recipientId);
    res.set("Content-Type", "image/gif");
    res.set("Cache-Control", "no-store");
    res.send(getTrackingPixel());
  }),
);

// Public, no auth — this is what a campaign's CTA link actually points to in the sent email.
// Destination is looked up server-side from the campaign, never taken from the request.
trackingRouter.get(
  "/click/:recipientId",
  asyncHandler(async (req, res) => {
    const destination = await recordClickAndGetDestination(req.params.recipientId);
    if (!destination) {
      res.status(404).send("Link not found");
      return;
    }
    res.redirect(302, destination);
  }),
);
