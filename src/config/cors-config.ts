import { CorsOptions } from "cors";

const allowedOrigins = [
  "https://paylink.orafi.app",
  "https://checkout.orafi.app",
  "http://localhost:5173",
];

const CORS_OPTIONS: CorsOptions = {
  origin: (origin, callback) => {
    // allow non-browser clients (curl, servers, mobile apps)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
};

export default CORS_OPTIONS;  
