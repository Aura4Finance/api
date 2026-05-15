import express, { Request, Response } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
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

app.set("trust proxy", 1);
app.set("query parser", "extended");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const router = express.Router();
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

// Fallback 404 handler for undefined endpoints
app.use((req: Request, res: Response) => {
  res.status(404).json({
    status: "error",
    code: 404,
    message: "Endpoint not found",
    path: req.path,
    method: req.method,
    details: "The requested endpoint is not available in this API. Please check the API documentation for available endpoints.",
    timestamp: new Date().toISOString(),
  });
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at", promise, "reason:", reason);
});

export default app;
