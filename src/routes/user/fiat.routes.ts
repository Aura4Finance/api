import { RequestAuth } from "@/@types/request";
import { FiatController } from "@/controllers/user/fiat.controller";
import { asyncHandler } from "@/utils/error-handler";
import express, { Response} from "express";
import Container from "typedi";

const router = express.Router();
const fiatController = Container.get(FiatController);

router.get("/banks", 
    asyncHandler((req: Request, res: Response) => 
    fiatController.getBanks(req, res))
);

routeer.get("/rates",
    asyncHandler((req: Request, res: Response) => 
    fiatController.getRates(req, res))
);

router.get("/",
    asyncHandler((req: RequestAuth, res: Response) => 
    fiatController.getAllAccounts(req, res)
))

router.post("/",
    asyncHandler((req: RequestAuth, res: Response) => 
    fiatController.addBankAccount(req, res)
))
router.delete("/:id",
    asyncHandler((req: RequestAuth, res: Response) => 
    fiatController.deleteAccount(req, res)
))

router.patch("/:id",
    asyncHandler((req: RequestAuth, res: Response) => 
    fiatController.updateAccount(req, res)
))



export default router;