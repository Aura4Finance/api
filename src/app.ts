import express, { Request, Response } from "express";
import helmet from "helmet";
import cors from "cors";
import dotenv from "dotenv";
import morgan from "morgan";
import logger from "./utils/logger";
import { globalErrorHandler } from "./utils/error-handler";
import CORS_OPTIONS from "./config/cors-config";
import authRoutes from "./routes/auth.routes";
import adminRoutes from "@/routes/admin.routes";
import routes  from "./routes";
import { limiter } from "./middlewares/rate-limit.middleware";

dotenv.config();
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const router = express.Router();

app.set("trust proxy", 1);
app.use(limiter);
app.use(helmet());
app.use(cors(CORS_OPTIONS));
app.use(morgan("common"));

router.use("/admin", adminRoutes);
router.use("/auth", authRoutes);
router.use("/", routes);
app.use("/v1", router);

app.get("/", (_: Request, res: Response) => {
  res.status(200).json({
    message: "Welcome to OraFi 🚀🚀🚀",
  });
});

app.use(globalErrorHandler);

app.use((_: Request, res: Response) => {
  res.status(404).json({ message: "Requested resource does not exist" });
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at", promise, "reason:", reason);
});

export default app;
