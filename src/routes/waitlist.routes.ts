import express, { Request, Response } from "express";
import { Container } from "typedi";
import { asyncHandler } from "@/utils/error-handler";
import { verifyRequestBody } from "@/middlewares/verify-request-body";
import { WaitlistController } from "@/controllers/waitlist.controller";

const router = express.Router();
const waitlistController = Container.get(WaitlistController);

router.post(
    "/",
    verifyRequestBody,
    asyncHandler((req: Request, res: Response) => 
        waitlistController.addToWaitlist(req, res))
);
export default router;