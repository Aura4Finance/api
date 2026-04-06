import { RequestAuth } from "@/@types/request";
import { PaylinkController } from "@/controllers/paylink.controller";
import { asyncHandler } from "@/utils/error-handler";
import express, { Response } from "express";
import Container from "typedi";
import multer from "multer";
import { checkIfUserIsDisabled } from "@/middlewares/user.milddleware";

const router = express.Router();
const paylinkController = Container.get(PaylinkController);
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post(
  "/",
  checkIfUserIsDisabled,
  upload.array("images", 10),
  asyncHandler((req: RequestAuth, res: Response) =>
    paylinkController.createPaylink(req, res)
  )
);

router.delete(
  "/images/:imageId",
  checkIfUserIsDisabled,
  asyncHandler((req: RequestAuth, res: Response) =>
    paylinkController.removeImageFromPaylink(req, res)
  )
);

router.get(
  "/:paylinkId",
  asyncHandler((req: RequestAuth, res: Response) =>
    paylinkController.getPaylinkDetails(req, res)
)
);

router.get(
  "/",
  asyncHandler((req: RequestAuth, res: Response) =>
    paylinkController.getAllPaylinks(req, res)
)
);

router.delete(
  "/:paylinkId",
  checkIfUserIsDisabled,
  asyncHandler((req: RequestAuth, res: Response) =>
    paylinkController.deletePaymentLink(req, res)
  )
);

router.patch(
  "/:paylinkId",
  checkIfUserIsDisabled,
  upload.array("images", 10),
  asyncHandler((req: RequestAuth, res: Response) =>
    paylinkController.editPaylink(req, res)
  )
);

export default router;
