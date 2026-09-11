import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as analyticsController from "../controllers/analytics.controller.js";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);
dashboardRouter.get("/", asyncHandler(analyticsController.dashboard));

export const reportsRouter = Router();
reportsRouter.use(requireAuth);
reportsRouter.get("/campaigns", asyncHandler(analyticsController.campaignReports));
reportsRouter.get("/campaigns/:id", asyncHandler(analyticsController.campaignReportDetail));
