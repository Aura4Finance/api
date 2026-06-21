import { RequestAuth } from "@/@types/request";
import { FiatController } from "@/controllers/user/fiat.controller";
import { verifyRequestBody } from "@/middlewares/verify-request-body";
import { asyncHandler } from "@/utils/error-handler";
import express, { Response} from "express";
import { Container } from "typedi";

const router = express.Router();
const fiatController = Container.get(FiatController);

router.get("/",
    asyncHandler((req: RequestAuth, res: Response) => 
    fiatController.getAllAccounts(req, res)
))

router.post("/",
    verifyRequestBody,
    asyncHandler((req: RequestAuth, res: Response) => 
    fiatController.addBankAccount(req, res)
))
router.delete("/:id",
    asyncHandler((req: RequestAuth, res: Response) => 
    fiatController.deleteAccount(req, res)
))

router.patch("/:id",
    verifyRequestBody,
    asyncHandler((req: RequestAuth, res: Response) => 
    fiatController.updateAccount(req, res)
))



export default router;