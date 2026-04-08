import { RequestAuth } from "@/@types/request";
import { CustomerController } from "@/controllers/customer.controller";
import { checkIfUserIsDisabled } from "@/middlewares/user.milddleware";
import { verifyRequestBody } from "@/middlewares/verify-request-body";
import { asyncHandler } from "@/utils/error-handler";
import express, { Response } from "express";
import Container from "typedi";

const router = express.Router();
const customerController = Container.get(CustomerController);

router.post(
  "/",
  verifyRequestBody,
  checkIfUserIsDisabled,
  asyncHandler((req: RequestAuth, res: Response) =>
    customerController.createCustomer(req, res)
  )
);

router.get(
  "/",
  asyncHandler((req: RequestAuth, res: Response) =>
    customerController.getCustomers(req, res)
  )
);

router.get(
  "/:customerId",
  asyncHandler((req: RequestAuth, res: Response) =>
    customerController.getCustomer(req, res)
  )
);

router.delete(
  "/:customerId",
  checkIfUserIsDisabled,
  asyncHandler((req: RequestAuth, res: Response) =>
    customerController.deleteCustomer(req, res)
  )
);

export default router;
